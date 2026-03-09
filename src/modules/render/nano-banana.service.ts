import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface RenderRequest {
  line_art: string;  // 로컬 파일 경로 (예: /uploads/file.png)
  pose_data: any;    // 수정된 포즈 데이터 (JSON)
  prompt: string;    // 사용자 프롬프트
}

@Injectable()
export class NanoBananaService {
  private readonly logger = new Logger(NanoBananaService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async render(request: RenderRequest) {
    const baseUrl = this.configService.get<string>('NANO_BANANA_BASE_URL');
    const model = this.configService.get<string>('NANO_BANANA_MODEL');
    const apiKey = this.configService.get<string>('NANO_BANANA_API_KEY');

    // 1. 선화 파일 읽기 및 Base64 변환
    const absolutePath = join(process.cwd(), request.line_art);
    const lineArtBase64 = await readFile(absolutePath, { encoding: 'base64' });

    this.logger.log(`Requesting Gemini Image Generation (Nano Banana Pro mode)...`);

    try {
      // 2. Google Generative Language API 호출
      const response = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/models/${model}:generateContent`,
          {
            contents: [{
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: lineArtBase64,
                  },
                },
                {
                  text: `Edit this character line art based on this pose: ${JSON.stringify(request.pose_data)}. 
                         Prompt: ${request.prompt}. 
                         Maintain character proportions and line art structure. 
                         High quality, 4K resolution illustration.`,
                },
              ],
            }],
            generationConfig: {
              responseModal: 'IMAGE', // 가이드 명시 사항
              responseMimeType: 'image/png',
              temperature: 0.7,
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
      // 가이드에 따르면 inline_data.data에 base64 이미지가 들어있음
      const base64Data = response.data.candidates[0].content.parts[0].inline_data.data;
      
      // 4. 결과 파일 저장
      const fileName = `render-${randomUUID()}.png`;
      const outputPath = join(process.cwd(), 'uploads', fileName);
      await writeFile(outputPath, Buffer.from(base64Data, 'base64'));

      this.logger.log(`Image rendered and saved as: ${fileName}`);

      return {
        outputImage: `/uploads/${fileName}`,
        generationTime: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Gemini/NanoBanana API Call Failed', error.response?.data || error.message);
      throw error;
    }
  }
}
