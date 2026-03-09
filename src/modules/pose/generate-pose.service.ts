import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GeneratePoseService {
  private readonly logger = new Logger(GeneratePoseService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async execute(lineArtUrl: string) {
    const apiUrl = this.configService.get<string>('POSE_GEN_API_URL');
    const apiKey = this.configService.get<string>('POSE_GEN_API_KEY');

    this.logger.log(`Requesting pose generation from: ${apiUrl}`);

    try {
      // TODO: 실제 AI 서버 스펙에 맞게 요청 구조 조정
      // const response = await firstValueFrom(
      //   this.httpService.post(apiUrl, { 
      //     line_art_url: lineArtUrl 
      //   }, {
      //     headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      //   })
      // );
      // return response.data;

      // 현재는 테스트를 위해 구조화된 데이터 반환
      return {
        candidates: [{
          id: `pose-${Date.now()}`,
          label: 'detected-pose',
          keypoints: [{ name: 'head', x: 250, y: 100, confidence: 0.99 }]
        }]
      };
    } catch (error) {
      this.logger.error('AI Pose Generation Failed', error.stack);
      throw error;
    }
  }
}
