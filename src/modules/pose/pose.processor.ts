import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pose } from '../../entities/pose.entity';
import { GeneratePoseService } from './generate-pose.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

@Processor('pose')
export class PoseProcessor extends WorkerHost {
  private readonly logger = new Logger(PoseProcessor.name);
  private readonly CACHE_TTL = 1800; // 30분

  constructor(
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    private readonly generatePoseService: GeneratePoseService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { sessionId, lineArtUrl } = job.data;
    this.logger.log(`Processing pose generation for session: ${sessionId}`);

    try {
      // 1. 상태 업데이트 (진행중)
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'generating', 600);

      // 2. 실제 AI 포즈 추출 호출
      const aiResult = await this.generatePoseService.execute(lineArtUrl);
      const bestCandidate = aiResult.candidates[0];

      // 3. DB 저장
      const pose = this.poseRepository.create({
        sessionId,
        label: bestCandidate.label,
        keypoints: bestCandidate.keypoints,
      });

      const saved = await this.poseRepository.save(pose);

      // 4. 캐시 및 상태 갱신 (완료)
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), saved.id, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.poseCache(sessionId), saved, this.CACHE_TTL);

      this.logger.log(`Successfully generated pose for session ${sessionId}`);
      return saved;
    } catch (error) {
      this.logger.error(`Pose generation failed for session ${sessionId}: ${error.message}`);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'failed', 600);
      throw error;
    }
  }
}
