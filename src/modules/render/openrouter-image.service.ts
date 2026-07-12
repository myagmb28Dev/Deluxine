import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { RenderModel } from './render-model';
import { RenderCameraView, RenderPoseData } from './render-job.types';

export interface OpenRouterRenderRequest {
  model: RenderModel;
  lineArtImage: string;
  poseData: RenderPoseData;
  poseProjectionImage?: string;
  cameraView?: RenderCameraView;
  prompt: string;
}

interface OpenRouterImageResponse {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
  }>;
  usage?: {
    cost?: number;
  };
}

export interface OpenRouterRenderResult {
  outputImageBase64: string;
  outputMimeType: string;
  generationTime: string;
  costUsd: number | null;
  referenceStrategy: 'line_art_first' | 'pose_first' | 'line_art_only';
  referenceCount: number;
}

export class OpenRouterImageError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responseData?: unknown,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

@Injectable()
export class OpenRouterImageService {
  private readonly logger = new Logger(OpenRouterImageService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async render(
    request: OpenRouterRenderRequest,
  ): Promise<OpenRouterRenderResult> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseUrl =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      'https://openrouter.ai/api/v1';
    const timeout = Number(
      this.configService.get<string>('OPENROUTER_TIMEOUT_MS') ?? 600000,
    );

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY_MISSING');
    }

    const lineArtReference = {
      type: 'image_url',
      image_url: {
        url: this.toDataUrl(request.lineArtImage, 'image/png'),
      },
    };
    const poseReference = request.poseProjectionImage
      ? {
          type: 'image_url',
          image_url: {
            url: this.toDataUrl(request.poseProjectionImage, 'image/png'),
          },
        }
      : null;
    const referenceStrategy = this.referenceStrategy(request);
    const inputReferences = poseReference
      ? referenceStrategy === 'pose_first'
        ? [poseReference, lineArtReference]
        : [lineArtReference, poseReference]
      : [lineArtReference];
    const prompt = this.buildPrompt(request, referenceStrategy);

    this.logger.log(
      `OpenRouter reference diagnostics: ${JSON.stringify({
        model: request.model,
        has_pose_projection_image: Boolean(request.poseProjectionImage),
        pose_image_mime_type: this.imageMimeType(request.poseProjectionImage),
        pose_image_length: request.poseProjectionImage?.length ?? 0,
        reference_count: inputReferences.length,
        reference_strategy: referenceStrategy,
        pose_priority_instruction_included: prompt.includes(
          'TARGET POSE IS THE HIGHEST PRIORITY',
        ),
      })}`,
    );

    this.logger.log(
      `Requesting OpenRouter image generation with ${request.model}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenRouterImageResponse>(
          `${baseUrl}/images`,
          {
            model: request.model,
            prompt,
            n: 1,
            input_references: inputReferences,
          },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': this.configService.get<string>('app.baseUrl'),
              'X-Title':
                this.configService.get<string>('app.name') ?? 'Deluxine',
            },
          },
        ),
      );

      const image = response.data?.data?.[0];
      if (!image?.b64_json) {
        throw new Error('NO_IMAGE_DATA');
      }

      const decoded = this.decodeBase64Image(image.b64_json, image.media_type);
      return {
        outputImageBase64: decoded.data,
        outputMimeType: decoded.mimeType,
        generationTime: new Date().toISOString(),
        costUsd: response.data?.usage?.cost ?? null,
        referenceStrategy,
        referenceCount: inputReferences.length,
      };
    } catch (error: unknown) {
      const statusCode = isAxiosError(error)
        ? error.response?.status
        : undefined;
      const responseData: unknown = isAxiosError(error)
        ? error.response?.data
        : undefined;
      const message =
        error instanceof Error ? error.message : 'OpenRouter API Error';

      this.logger.error(
        'OpenRouter image generation failed',
        JSON.stringify({
          model: request.model,
          statusCode: statusCode ?? null,
          message,
        }),
      );

      if (statusCode === 402 || statusCode === 429) {
        throw new OpenRouterImageError(
          'QUOTA_EXCEEDED',
          statusCode,
          responseData,
          { statusCode },
        );
      }

      if (responseData) {
        throw new OpenRouterImageError(message, statusCode, responseData);
      }

      throw error;
    }
  }

  private buildPrompt(
    request: OpenRouterRenderRequest,
    referenceStrategy: OpenRouterRenderResult['referenceStrategy'],
  ) {
    const userPrompt = request.prompt?.trim()
      ? `Additional instructions: ${request.prompt.trim()}`
      : 'No additional changes. Focus on the pose.';

    let poseInstruction: string;
    if (request.poseProjectionImage) {
      const posePosition =
        referenceStrategy === 'pose_first' ? 'first' : 'second';
      const lineArtPosition =
        referenceStrategy === 'pose_first' ? 'second' : 'first';
      poseInstruction = [
        'TARGET POSE IS THE HIGHEST PRIORITY.',
        `The ${posePosition} reference image is the target pose projection from the editor.`,
        `The ${lineArtPosition} reference image is the source line art and provides character design only.`,
        'Discard the pose from the source line art completely and re-pose the character to match the target pose projection.',
        'Match the silhouette, body angle, torso twist, head tilt, limb directions, and overall balance.',
        'Do not preserve the source arm directions, leg directions, torso angle, or body orientation.',
        'Do not copy the mannequin appearance. Transfer only the pose.',
      ].join(' ');

      if (request.cameraView) {
        poseInstruction = [
          poseInstruction,
          'Preserve the target camera viewpoint from the pose projection image.',
          `Horizontal camera azimuth: ${request.cameraView.azimuthDegrees} degrees.`,
          `Vertical camera elevation: ${request.cameraView.elevationDegrees} degrees.`,
          'Do not normalize or rotate the character to a front-facing view.',
          'Ignore the camera viewpoint of the source line art; use it only for character design.',
        ].join(' ');
      }
    } else {
      const keypoints = request.poseData.keypoints ?? [];
      const ignoredKeypoints = new Set([
        'left_eye',
        'right_eye',
        'left_eye_inner',
        'left_eye_outer',
        'right_eye_inner',
        'right_eye_outer',
        'mouth_left',
        'mouth_right',
        'left_ear',
        'right_ear',
        'nose',
      ]);
      const filteredPoseData = {
        ...request.poseData,
        keypoints: keypoints.filter(
          (keypoint) => !ignoredKeypoints.has(keypoint.name),
        ),
      };
      poseInstruction = `Re-pose the character to match this skeleton data: ${JSON.stringify(filteredPoseData)}.`;
    }

    return [
      poseInstruction,
      userPrompt,
      'Preserve the original character design, body type, clothing, face, and line-art style.',
      'Change only the pose unless the additional instructions explicitly request another change.',
      'Keep the anatomy natural and preserve the character identity.',
      'When a pose reference image is present, prioritize it over inferred motion from text.',
    ].join('\n');
  }

  private referenceStrategy(
    request: OpenRouterRenderRequest,
  ): OpenRouterRenderResult['referenceStrategy'] {
    if (!request.poseProjectionImage) return 'line_art_only';
    return 'pose_first';
  }

  private imageMimeType(image?: string) {
    return image?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] ?? null;
  }

  private toDataUrl(image: string, fallbackMimeType: string) {
    if (/^https?:\/\//.test(image)) {
      return image;
    }
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) {
      return image;
    }
    return `data:${fallbackMimeType};base64,${image}`;
  }

  private decodeBase64Image(image: string, mediaType?: string) {
    const dataUrlMatch = image.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s,
    );
    if (dataUrlMatch) {
      return { mimeType: dataUrlMatch[1], data: dataUrlMatch[2] };
    }
    return { mimeType: mediaType ?? 'image/png', data: image };
  }
}
