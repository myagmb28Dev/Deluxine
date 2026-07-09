import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface RenderRequest {
  lineArtBase64: string;
  lineArtMimeType: string;
  pose_data: any;    // 수정된 포즈 데이터 (JSON)
  pose_projection_image?: string; // 프론트에서 캡처한 포즈 투영 이미지(data URL)
  prompt: string;    // 사용자 프롬프트
}

@Injectable()
export class NanoBananaService {
  private readonly logger = new Logger(NanoBananaService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private decodeInlineImage(image: string) {
    const dataUrlMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      return {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      };
    }

    return {
      mimeType: 'image/png',
      data: image,
    };
  }

  async render(request: RenderRequest) {
    const baseUrl = this.configService.get<string>('NANO_BANANA_BASE_URL');
    const model = this.configService.get<string>('NANO_BANANA_MODEL');
    const apiKey = this.configService.get<string>('NANO_BANANA_API_KEY');

    this.logger.log(`Requesting Gemini Image Generation (Nano Banana Pro mode)...`);

    // 429 방지를 위해 API 호출 전 아주 짧은 간격(500ms) 추가
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Google Generative Language API 호출
    const userPrompt = request.prompt?.trim() ? `Additional instructions: ${request.prompt}` : 'No additional changes, just focus on the pose.';
    const parts: Array<Record<string, unknown>> = [
      {
        inlineData: {
          mimeType: request.lineArtMimeType,
          data: request.lineArtBase64,
        },
      },
    ];

    let poseInstruction = '';
    if (request.pose_projection_image) {
      const poseProjection = this.decodeInlineImage(request.pose_projection_image);
      parts.push({
        inlineData: {
          mimeType: poseProjection.mimeType,
          data: poseProjection.data,
        },
      });
      poseInstruction = `MAIN TASK: The first image is the original line art. The second image is the target pose projection from the editor. Re-pose the character in the first image to match the second image as closely as possible. Match the silhouette, body angle, torso twist, head tilt, arm direction, leg direction, and overall balance of the second image. Do not copy the mannequin's appearance itself. Only transfer the pose.`;
    } else {
      const keypoints = request.pose_data?.keypoints || [];
      const filteredPoseData = {
        ...request.pose_data,
        keypoints: keypoints.filter((kp: any) =>
          !['left_eye', 'right_eye', 'left_eye_inner', 'left_eye_outer', 'right_eye_inner', 'right_eye_outer', 'mouth_left', 'mouth_right', 'left_ear', 'right_ear', 'nose'].includes(kp.name)
        )
      };
      poseInstruction = `MAIN TASK: Modify this character's body pose to exactly match this 3D skeleton: ${JSON.stringify(filteredPoseData)}.`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/models/${model}:generateContent`,
          {
            contents: [{
              role: 'user',
              parts: [
                ...parts,
                {
                  text: `${poseInstruction}
                         ${userPrompt}
                         
                         Detailed Instructions:
                         1. POSING: The primary goal is to change only the pose so the result matches the target pose reference as closely as possible.
                         2. CONSISTENCY: Keep the character's design, body type, clothing, and the original line-art style identical. Do not redesign the character.
                         3. FACE & QUALITY: Maintain a beautiful, well-proportioned face. High resolution, professional digital illustration.
                         4. NO DISTORTION: Ensure the modified pose looks natural and anatomically correct while preserving the original character identity.
                         5. PRIORITY: If a pose reference image is provided, trust that image over inferred motion from text.`,
                },
              ],
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              temperature: 0.4, // 창의성보다는 안정적인 품질을 위해 낮춤
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
          },
        ),
      );

      // 3. 응답 데이터(Base64) 처리
      // Gemini 응답은 보통 camelCase(inlineData)지만, 환경에 따라 snake_case도 방어적으로 허용한다.
      const responseParts = response.data?.candidates?.[0]?.content?.parts ?? [];
      const imagePart = responseParts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
      const base64Data = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
      if (!base64Data) {
        throw new Error('NO_IMAGE_DATA');
      }

      // 할당량 정보가 헤더에 있는지 확인 로그 추가
      if (response.headers) {
        this.logger.log('Gemini API Response Headers: ' + JSON.stringify({
          'x-goog-ratelimit-remaining': response.headers['x-goog-ratelimit-remaining'],
          'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
          'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
          'x-ratelimit-reset': response.headers['x-ratelimit-reset'],
        }));
      }

      return {
        outputImageBase64: base64Data,
        generationTime: new Date().toISOString(),
      };
    } catch (error) {
      const statusCode = error.response?.status;
      const responseData = error.response?.data;
      const isRateLimit = statusCode === 429;

      this.logger.error('Gemini/NanoBanana API Call Failed', JSON.stringify({
        statusCode: statusCode ?? null,
        responseData: responseData ?? null,
        message: error.message,
      }));

      // Throw a normalized error for quota so processor can classify it
      if (isRateLimit) {
        const err = new Error('QUOTA_EXCEEDED');
        // attach extra info for diagnostics
        (err as any).details = { statusCode, responseData };
        throw err;
      }

      // Re-attach response data to the error for upstream logging
      if (responseData) {
        const err = new Error(error.message || 'Gemini API Error');
        (err as any).responseData = responseData;
        (err as any).statusCode = statusCode;
        throw err;
      }

      throw error;
    }
  }
}
