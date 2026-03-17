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

type JointGuideItem = {
  name: string;
  label: string;
  group: 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg' | 'left_hand' | 'right_hand' | 'left_foot' | 'right_foot';
  color: string;
};

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

  async update(sessionId: string, keypoints: Array<{ name: string; x: number; y: number; z?: number; confidence?: number }>) {
    // 임시 키포인트 저장 (DB 저장 전)
    await this.redisService.set(RedisKeys.tempPoseKeypoints(sessionId), keypoints, this.TEMP_TTL);

    let pose = await this.poseRepository.findOne({ where: { sessionId } });
    if (!pose) {
      // 포즈가 없으면 에러 혹은 새로 생성 대기 로직이 필요하나 현재는 임시 에러 반환
      throw new Error('No generated pose found to update.');
    }

    pose.keypoints = keypoints.map((kp) => ({
      name: kp.name,
      x: kp.x,
      y: kp.y,
      ...(typeof kp.z !== 'undefined' ? { z: kp.z } : {}),
      confidence: typeof kp.confidence !== 'undefined' ? kp.confidence : 1.0,
    }));
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

  async findById(poseId: string) {
    const pose = await this.poseRepository.findOne({ where: { id: poseId } });
    if (pose) {
      // 캐시 보강
      await this.redisService.set(RedisKeys.poseCache(pose.sessionId), pose, this.CACHE_TTL);
      await this.redisService.set(RedisKeys.sessionCurrentPose(pose.sessionId), pose.id, this.CACHE_TTL);
      return pose;
    }
    return null;
  }

  async getPoseGenerationStatus(sessionId: string): Promise<string | null> {
    return this.redisService.get<string>(RedisKeys.sessionCurrentPose(sessionId));
  }

  async getPoseProgress(sessionId: string): Promise<number | null> {
    const progress = await this.redisService.get<number>(RedisKeys.poseProgress(sessionId));
    return progress ?? null;
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

  getGuide() {
    const joints: JointGuideItem[] = [
      { name: 'head', label: '머리', group: 'head', color: '#A855F7' },
      { name: 'neck', label: '목', group: 'head', color: '#A855F7' },
      { name: 'chest', label: '가슴', group: 'torso', color: '#10B981' },
      { name: 'abdomen', label: '복부', group: 'torso', color: '#10B981' },
      { name: 'spine', label: '척추 중앙', group: 'torso', color: '#10B981' },
      { name: 'pelvis', label: '골반 중심', group: 'torso', color: '#10B981' },

      { name: 'left_shoulder', label: '왼쪽 어깨', group: 'left_arm', color: '#EF4444' },
      { name: 'left_elbow', label: '왼쪽 팔꿈치', group: 'left_arm', color: '#EF4444' },
      { name: 'left_wrist', label: '왼쪽 손목', group: 'left_arm', color: '#EF4444' },
      { name: 'left_thumb', label: '왼쪽 엄지', group: 'left_hand', color: '#F97316' },
      { name: 'left_index', label: '왼쪽 검지', group: 'left_hand', color: '#F97316' },
      { name: 'left_middle', label: '왼쪽 중지', group: 'left_hand', color: '#F97316' },
      { name: 'left_ring', label: '왼쪽 약지', group: 'left_hand', color: '#F97316' },
      { name: 'left_pinky', label: '왼쪽 새끼손가락', group: 'left_hand', color: '#F97316' },

      { name: 'right_shoulder', label: '오른쪽 어깨', group: 'right_arm', color: '#F43F5E' },
      { name: 'right_elbow', label: '오른쪽 팔꿈치', group: 'right_arm', color: '#F43F5E' },
      { name: 'right_wrist', label: '오른쪽 손목', group: 'right_arm', color: '#F43F5E' },
      { name: 'right_thumb', label: '오른쪽 엄지', group: 'right_hand', color: '#FB7185' },
      { name: 'right_index', label: '오른쪽 검지', group: 'right_hand', color: '#FB7185' },
      { name: 'right_middle', label: '오른쪽 중지', group: 'right_hand', color: '#FB7185' },
      { name: 'right_ring', label: '오른쪽 약지', group: 'right_hand', color: '#FB7185' },
      { name: 'right_pinky', label: '오른쪽 새끼손가락', group: 'right_hand', color: '#FB7185' },

      { name: 'left_hip', label: '왼쪽 골반', group: 'left_leg', color: '#3B82F6' },
      { name: 'left_knee', label: '왼쪽 무릎', group: 'left_leg', color: '#3B82F6' },
      { name: 'left_ankle', label: '왼쪽 발목', group: 'left_leg', color: '#3B82F6' },
      { name: 'left_foot', label: '왼쪽 발끝', group: 'left_leg', color: '#3B82F6' },
      { name: 'left_toe', label: '왼쪽 발가락', group: 'left_foot', color: '#06B6D4' },

      { name: 'right_hip', label: '오른쪽 골반', group: 'right_leg', color: '#2563EB' },
      { name: 'right_knee', label: '오른쪽 무릎', group: 'right_leg', color: '#2563EB' },
      { name: 'right_ankle', label: '오른쪽 발목', group: 'right_leg', color: '#2563EB' },
      { name: 'right_foot', label: '오른쪽 발끝', group: 'right_leg', color: '#2563EB' },
      { name: 'right_toe', label: '오른쪽 발가락', group: 'right_foot', color: '#0891B2' },
    ];

    return {
      version: '1.0',
      groups: {
        head: { label: '머리/목', color: '#A855F7' },
        torso: { label: '몸통', color: '#10B981' },
        left_arm: { label: '왼팔', color: '#EF4444' },
        right_arm: { label: '오른팔', color: '#F43F5E' },
        left_hand: { label: '왼손(상세)', color: '#F97316' },
        right_hand: { label: '오른손(상세)', color: '#FB7185' },
        left_leg: { label: '왼다리', color: '#3B82F6' },
        right_leg: { label: '오른다리', color: '#2563EB' },
        left_foot: { label: '왼발(상세)', color: '#06B6D4' },
        right_foot: { label: '오른발(상세)', color: '#0891B2' },
      },
      joints,
      recommendedUi: {
        defaultMode: 'core_only',
        advancedToggle: {
          hand: ['left_thumb', 'left_index', 'left_middle', 'left_ring', 'left_pinky', 'right_thumb', 'right_index', 'right_middle', 'right_ring', 'right_pinky'],
          foot: ['left_toe', 'right_toe'],
        },
      },
    };
  }

  getTopology() {
    return {
      edges: [
        ['head', 'neck'],
        ['neck', 'chest'],
        ['chest', 'abdomen'],
        ['abdomen', 'spine'],
        ['spine', 'pelvis'],
        ['neck', 'left_shoulder'],
        ['left_shoulder', 'left_elbow'],
        ['left_elbow', 'left_wrist'],
        ['neck', 'right_shoulder'],
        ['right_shoulder', 'right_elbow'],
        ['right_elbow', 'right_wrist'],
        ['pelvis', 'left_hip'],
        ['left_hip', 'left_knee'],
        ['left_knee', 'left_ankle'],
        ['left_ankle', 'left_foot'],
        ['pelvis', 'right_hip'],
        ['right_hip', 'right_knee'],
        ['right_knee', 'right_ankle'],
        ['right_ankle', 'right_foot'],
      ],
      left_right_pairs: [
        ['left_shoulder', 'right_shoulder'],
        ['left_elbow', 'right_elbow'],
        ['left_wrist', 'right_wrist'],
        ['left_hip', 'right_hip'],
        ['left_knee', 'right_knee'],
        ['left_ankle', 'right_ankle'],
        ['left_foot', 'right_foot'],
      ],
      groups: {
        head: ['head', 'neck'],
        face: [],
        torso: ['chest', 'abdomen', 'spine', 'pelvis'],
        arm: ['left_shoulder', 'left_elbow', 'left_wrist', 'right_shoulder', 'right_elbow', 'right_wrist'],
        hand: ['left_thumb', 'left_index', 'left_middle', 'left_ring', 'left_pinky', 'right_thumb', 'right_index', 'right_middle', 'right_ring', 'right_pinky'],
        leg: ['left_hip', 'left_knee', 'left_ankle', 'left_foot', 'right_hip', 'right_knee', 'right_ankle', 'right_foot'],
      },
    };
  }
}
