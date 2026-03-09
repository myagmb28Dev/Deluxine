import { Injectable, forwardRef, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Pose } from '../../entities/pose.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { SessionService } from '../session/session.service';

export interface PoseModel {
  sessionId: string;
  chosenPose: string;
  keypoints: Array<{ name: string; x: number; y: number }>;
}

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly CACHE_TTL = 1800; // 30분
  private readonly TEMP_TTL = 3600; // 1시간

  constructor(
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @InjectQueue('pose')
    private readonly poseQueue: Queue,
  ) {}

  async generate(sessionId: string) {
    // 1. 세션에서 선화 URL 조회
    const session = await this.sessionService.findById(sessionId);
    const lineArtUrl = session?.lineArtUrl || 'line.png';

    // 2. 상태 설정 (대기 중)
    await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), 'pending', 600);

    // 3. 비동기 작업 큐에 등록
    this.logger.log(`Enqueuing pose generation for session ${sessionId}`);
    await this.poseQueue.add('generate-pose', {
      sessionId,
      lineArtUrl,
    }, {
      jobId: `pose-${sessionId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    });

    return {
      status: 'pending',
      message: 'Pose generation has been enqueued. Please check back later.',
      sessionId,
    };
  }

  async update(sessionId: string, keypoints: Array<{ name: string; x: number; y: number }>) {
    // 임시 키포인트 저장 (DB 저장 전)
    await this.redisService.set(RedisKeys.tempPoseKeypoints(sessionId), keypoints, this.TEMP_TTL);

    let pose = await this.poseRepository.findOne({ where: { sessionId } });
    if (!pose) {
      // 포즈가 없으면 에러 혹은 새로 생성 대기 로직이 필요하나 현재는 임시 에러 반환
      throw new Error('No generated pose found to update.');
    }

    pose.keypoints = keypoints.map((kp) => ({ ...kp, confidence: 1.0 }));
    const updated = await this.poseRepository.save(pose);

    // 캐시 갱신 및 임시 데이터 삭제
    await this.redisService.set(RedisKeys.poseCache(sessionId), updated, this.CACHE_TTL);
    await this.redisService.del(RedisKeys.tempPoseKeypoints(sessionId));

    return updated;
  }

  async findBySessionId(sessionId: string) {
    // 캐시 확인
    const cached = await this.redisService.get<Pose>(RedisKeys.poseCache(sessionId));
    if (cached) {
      return cached;
    }

    // DB 조회
    const pose = await this.poseRepository.findOne({ where: { sessionId } });
    if (pose) {
      await this.redisService.set(RedisKeys.poseCache(sessionId), pose, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.sessionCurrentPose(sessionId), pose.id, this.CACHE_TTL);
    }

    return pose;
  }

  async getPoseGenerationStatus(sessionId: string): Promise<string | null> {
    return this.redisService.get<string>(RedisKeys.sessionCurrentPose(sessionId));
  }

  async getTempKeypoints(sessionId: string) {
    return this.redisService.get<Array<{ name: string; x: number; y: number }>>(
      RedisKeys.tempPoseKeypoints(sessionId),
    );
  }

  async markAsChosen(poseId: string) {
    const pose = await this.poseRepository.findOne({ where: { id: poseId } });
    if (pose) {
      pose.isChosen = true;
      const updated = await this.poseRepository.save(pose);
      
      // 캐시 갱신
      await this.redisService.set(RedisKeys.poseCache(pose.sessionId), updated, this.CACHE_TTL);
      
      return updated;
    }
    return null;
  }

  async invalidateCache(sessionId: string) {
    await this.redisService.del(RedisKeys.poseCache(sessionId));
    await this.redisService.del(RedisKeys.sessionCurrentPose(sessionId));
    await this.redisService.del(RedisKeys.tempPoseKeypoints(sessionId));
  }
}
