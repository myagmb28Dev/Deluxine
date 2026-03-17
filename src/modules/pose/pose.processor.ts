import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Pose } from '../../entities/pose.entity';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import axios from 'axios';

@Processor('pose')
export class PoseProcessor extends WorkerHost {
  private readonly logger = new Logger(PoseProcessor.name);
  private readonly CACHE_TTL = 1800; // 30분

  constructor(
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ sessionId: string; lineArtUrl: string }>): Promise<any> {
    const { sessionId, lineArtUrl } = job.data;
    this.logger.log(`Processing pose extraction for session: ${sessionId}`);

    try {
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'generating', 600);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 10, 600);

      // 1. Python 3D AI 엔진 호출을 위한 절대 경로 생성
      const baseUrl = this.configService.get<string>('app.baseUrl');
      const absoluteUrl = lineArtUrl.startsWith('http') 
        ? lineArtUrl 
        : `${baseUrl}${lineArtUrl.startsWith('/') ? '' : '/'}${lineArtUrl}`;

      const aiUrl = this.configService.get<string>('AI_POSE_ENGINE_URL');
      if (!aiUrl) {
        throw new Error('AI_POSE_ENGINE_URL is not defined in the environment variables.');
      }
      
      this.logger.log(`Calling AI Pose Engine at ${aiUrl} with imageUrl: ${absoluteUrl}`);
      const { data } = await axios.post(aiUrl, { imageUrl: absoluteUrl });
      
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 50, 600);

      // 2. 받은 3D 데이터(z값 포함)를 DB에 저장
      const pose = this.poseRepository.create({
        sessionId,
        label: data.label,
        keypoints: data.keypoints,
      });
      const saved = await this.poseRepository.save(pose);

      // 3. 캐시 갱신 및 완료 처리
      await this.redisService.set(RedisKeys.poseCache(sessionId), saved, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), saved.id, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 100, 600);
      
      this.logger.log(`Successfully extracted and saved pose for session ${sessionId}`);
      return saved;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message;
      this.logger.error(`Pose extraction failed for session ${sessionId}: ${errorMessage}`);
      if (error.response?.data) {
        this.logger.error(`Error details: ${JSON.stringify(error.response.data)}`);
      }
      
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'failed', 600);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), -1, 600); // -1 = 실패
      throw error;
    }
  }
}
