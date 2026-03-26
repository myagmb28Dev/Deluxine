import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pose } from '../../entities/pose.entity';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

type CanonicalKeypoint = {
  name: string;
  x: number;
  y: number;
  z?: number;
  confidence: number;
};

@Processor('pose')
export class PoseProcessor extends WorkerHost {
  private readonly logger = new Logger(PoseProcessor.name);
  private readonly CACHE_TTL = 1800;

  constructor(
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<{ sessionId: string; lineArtUrl: string; targetRatio?: number }>): Promise<any> {
    const { sessionId, targetRatio } = job.data;
    this.logger.log(`Generating pose for session: ${sessionId}`);

    try {
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'generating', 600);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 10, 600);

      const keypoints = this.createFallbackKeypoints(targetRatio);
      const sourceLabel = 'default_template_pose';

      await this.redisService.set(RedisKeys.poseProgress(sessionId), 85, 600);

      const existing = await this.poseRepository.findOne({ where: { sessionId } });
      const pose = existing ?? this.poseRepository.create({ sessionId });
      pose.label = sourceLabel;
      pose.keypoints = keypoints;
      pose.detectedRatio = targetRatio ?? null;

      const saved = await this.poseRepository.save(pose);

      await this.redisService.set(RedisKeys.poseCache(sessionId), saved, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.poseProgress(sessionId), 100, 600);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), saved.id, this.CACHE_TTL);

      this.logger.log(`Pose generated successfully for session ${sessionId}`);
      return saved;
    } catch (error) {
      this.logger.error(`Failed to generate pose: ${error.message}`);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'failed', 600);
      throw error;
    }
  }

  private createFallbackKeypoints(targetRatio?: number): CanonicalKeypoint[] {
    const ratioFactor = targetRatio && targetRatio > 0 ? Math.min(1.2, Math.max(0.8, 7 / targetRatio)) : 1;
    const legY = 0.88 * ratioFactor;

    return [
      { name: 'head', x: 0.5, y: 0.12, confidence: 1 },
      { name: 'face_center', x: 0.5, y: 0.15, confidence: 1 },
      { name: 'left_eye', x: 0.485, y: 0.14, confidence: 1 },
      { name: 'right_eye', x: 0.515, y: 0.14, confidence: 1 },
      { name: 'nose', x: 0.5, y: 0.16, confidence: 1 },
      { name: 'mouth_left', x: 0.492, y: 0.18, confidence: 1 },
      { name: 'mouth_right', x: 0.508, y: 0.18, confidence: 1 },

      { name: 'neck', x: 0.5, y: 0.22, confidence: 1 },
      { name: 'chest', x: 0.5, y: 0.30, confidence: 1 },
      { name: 'abdomen', x: 0.5, y: 0.39, confidence: 1 },
      { name: 'spine', x: 0.5, y: 0.45, confidence: 1 },
      { name: 'pelvis', x: 0.5, y: 0.52, confidence: 1 },

      { name: 'left_shoulder', x: 0.43, y: 0.27, confidence: 1 },
      { name: 'left_elbow', x: 0.39, y: 0.39, confidence: 1 },
      { name: 'left_wrist', x: 0.36, y: 0.50, confidence: 1 },
      { name: 'left_thumb', x: 0.35, y: 0.53, confidence: 1 },
      { name: 'left_index', x: 0.355, y: 0.55, confidence: 1 },
      { name: 'left_middle', x: 0.36, y: 0.56, confidence: 1 },
      { name: 'left_ring', x: 0.365, y: 0.55, confidence: 1 },
      { name: 'left_pinky', x: 0.37, y: 0.54, confidence: 1 },

      { name: 'right_shoulder', x: 0.57, y: 0.27, confidence: 1 },
      { name: 'right_elbow', x: 0.61, y: 0.39, confidence: 1 },
      { name: 'right_wrist', x: 0.64, y: 0.50, confidence: 1 },
      { name: 'right_thumb', x: 0.65, y: 0.53, confidence: 1 },
      { name: 'right_index', x: 0.645, y: 0.55, confidence: 1 },
      { name: 'right_middle', x: 0.64, y: 0.56, confidence: 1 },
      { name: 'right_ring', x: 0.635, y: 0.55, confidence: 1 },
      { name: 'right_pinky', x: 0.63, y: 0.54, confidence: 1 },

      { name: 'left_hip', x: 0.46, y: 0.53, confidence: 1 },
      { name: 'left_knee', x: 0.45, y: 0.70, confidence: 1 },
      { name: 'left_ankle', x: 0.45, y: legY, confidence: 1 },
      { name: 'left_foot', x: 0.45, y: 0.92, confidence: 1 },
      { name: 'left_big_toe', x: 0.44, y: 0.95, confidence: 1 },
      { name: 'left_index_toe', x: 0.445, y: 0.95, confidence: 1 },
      { name: 'left_middle_toe', x: 0.45, y: 0.95, confidence: 1 },
      { name: 'left_ring_toe', x: 0.455, y: 0.95, confidence: 1 },
      { name: 'left_pinky_toe', x: 0.46, y: 0.95, confidence: 1 },

      { name: 'right_hip', x: 0.54, y: 0.53, confidence: 1 },
      { name: 'right_knee', x: 0.55, y: 0.70, confidence: 1 },
      { name: 'right_ankle', x: 0.55, y: legY, confidence: 1 },
      { name: 'right_foot', x: 0.55, y: 0.92, confidence: 1 },
      { name: 'right_big_toe', x: 0.54, y: 0.95, confidence: 1 },
      { name: 'right_index_toe', x: 0.545, y: 0.95, confidence: 1 },
      { name: 'right_middle_toe', x: 0.55, y: 0.95, confidence: 1 },
      { name: 'right_ring_toe', x: 0.555, y: 0.95, confidence: 1 },
      { name: 'right_pinky_toe', x: 0.56, y: 0.95, confidence: 1 },
    ];
  }
}
