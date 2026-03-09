import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { PoseService } from './pose.service';
import { Pose } from '../../entities/pose.entity';
import { RedisService } from '../redis/redis.service';
import { SessionService } from '../session/session.service';

describe('PoseService (Async Queue Test)', () => {
  let service: PoseService;
  let poseQueue: any;

  const mockPoseRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockSessionService = {
    findById: jest.fn().mockResolvedValue({ id: 'session-123', lineArtUrl: '/uploads/line.png' }),
  };

  const mockPoseQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseService,
        {
          provide: getRepositoryToken(Pose),
          useValue: mockPoseRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
        {
          provide: getQueueToken('pose'),
          useValue: mockPoseQueue,
        },
      ],
    }).compile();

    service = module.get<PoseService>(PoseService);
    poseQueue = module.get(getQueueToken('pose'));
  });

  it('generate()는 AI 작업을 즉시 큐에 추가하고 status:pending을 반환해야 함', async () => {
    const sessionId = 'session-123';
    const result = await service.generate(sessionId);

    // 1. 큐에 작업이 추가되었는지 확인
    expect(poseQueue.add).toHaveBeenCalledWith(
      'generate-pose',
      expect.objectContaining({ sessionId, lineArtUrl: '/uploads/line.png' }),
      expect.anything(),
    );

    // 2. 즉시 반환된 응답 확인
    expect(result).toEqual({
      status: 'pending',
      message: 'Pose generation has been enqueued. Please check back later.',
      sessionId: 'session-123',
    });
    
    console.log('✅ PoseService 비동기 큐 등록 테스트 성공!');
  });
});
