import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pose } from '../../entities/pose.entity';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

@Processor('pose')
export class PoseProcessor extends WorkerHost {
  private readonly logger = new Logger(PoseProcessor.name);
  private readonly CACHE_TTL = 1800; // 30분

  constructor(
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { sessionId } = job.data; // lineArtUrl is no longer needed
    this.logger.log(`Processing mannequin generation for session: ${sessionId}`);

    try {
      // 0% - 상태 업데이트 (진행중)
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'generating', 600);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 0, 600);

      // 20% - AI 엔진 호출 시작 (이제는 그냥 대기)
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 20, 600);
      
      // AI 호출 대신 기본 마네킹 포즈 사용 (1024x1024 기준 T-Pose)
      const defaultMannequin = {
        label: 'mannequin',
        keypoints: [
          // Head & Torso
          { name: 'head', x: 512, y: 100, confidence: 1 },
          { name: 'neck', x: 512, y: 180, confidence: 1 },
          { name: 'chest', x: 512, y: 280, confidence: 1 },
          { name: 'abdomen', x: 512, y: 380, confidence: 1 },
          { name: 'spine', x: 512, y: 480, confidence: 1 },
          { name: 'pelvis', x: 512, y: 580, confidence: 1 },

          // Left Arm
          { name: 'left_shoulder', x: 600, y: 220, confidence: 1 },
          { name: 'left_elbow', x: 720, y: 220, confidence: 1 },
          { name: 'left_wrist', x: 840, y: 220, confidence: 1 },
          { name: 'left_thumb', x: 860, y: 210, confidence: 1 },
          { name: 'left_index', x: 880, y: 215, confidence: 1 },
          { name: 'left_middle', x: 885, y: 220, confidence: 1 },
          { name: 'left_ring', x: 880, y: 225, confidence: 1 },
          { name: 'left_pinky', x: 870, y: 230, confidence: 1 },

          // Right Arm
          { name: 'right_shoulder', x: 424, y: 220, confidence: 1 },
          { name: 'right_elbow', x: 304, y: 220, confidence: 1 },
          { name: 'right_wrist', x: 184, y: 220, confidence: 1 },
          { name: 'right_thumb', x: 164, y: 210, confidence: 1 },
          { name: 'right_index', x: 144, y: 215, confidence: 1 },
          { name: 'right_middle', x: 139, y: 220, confidence: 1 },
          { name: 'right_ring', x: 144, y: 225, confidence: 1 },
          { name: 'right_pinky', x: 154, y: 230, confidence: 1 },

          // Left Leg
          { name: 'left_hip', x: 562, y: 580, confidence: 1 },
          { name: 'left_knee', x: 562, y: 780, confidence: 1 },
          { name: 'left_ankle', x: 562, y: 940, confidence: 1 },
          { name: 'left_foot', x: 562, y: 980, confidence: 1 },
          { name: 'left_toe', x: 580, y: 1000, confidence: 1 },

          // Right Leg
          { name: 'right_hip', x: 462, y: 580, confidence: 1 },
          { name: 'right_knee', x: 462, y: 780, confidence: 1 },
          { name: 'right_ankle', x: 462, y: 940, confidence: 1 },
          { name: 'right_foot', x: 462, y: 980, confidence: 1 },
          { name: 'right_toe', x: 444, y: 1000, confidence: 1 },
        ]
      };

      // 60% - 처리 완료, DB 저장 중
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 60, 600);

      // DB 저장
      const pose = this.poseRepository.create({
        sessionId,
        label: defaultMannequin.label,
        keypoints: defaultMannequin.keypoints,
      });

      const saved = await this.poseRepository.save(pose);

      // 90% - 캐시 저장 중
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 90, 600);

      // 캐시 및 상태 갱신
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), saved.id, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.poseCache(sessionId), saved, this.CACHE_TTL);

      // 100% - 완료
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 100, 600);

      this.logger.log(`Successfully generated mannequin pose for session ${sessionId}`);
      return saved;
    } catch (error) {
      this.logger.error(`Mannequin generation failed for session ${sessionId}: ${error.message}`);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'failed', 600);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), -1, 600); // -1 = 실패
      throw error;
    }
  }
}
