import { Queue } from 'bullmq';
import { DeepPartial, Repository } from 'typeorm';
import { RenderJob } from '../../entities/render-job.entity';
import { R2Service } from '../r2/r2.service';
import { RedisService } from '../redis/redis.service';
import { RenderService } from './render.service';
import { RenderModel } from './render-model';
import { RenderQueuePayload } from './render-job.types';

describe('RenderService', () => {
  const repository = {
    create: jest.fn(
      (value: DeepPartial<RenderJob>): RenderJob => value as RenderJob,
    ),
    save: jest.fn(
      (value: RenderJob): Promise<RenderJob> => Promise.resolve(value),
    ),
    findOne: jest.fn((): Promise<RenderJob | null> => Promise.resolve(null)),
  };
  const redisService = {
    set: jest.fn((): Promise<'OK'> => Promise.resolve('OK')),
    get: jest.fn((): Promise<string | null> => Promise.resolve(null)),
  };
  const r2Service = {
    presignGet: jest.fn(() =>
      Promise.resolve({
        url: 'https://cdn.example.com/output.png',
        key: 'output.png',
        expiresInSec: 600,
        method: 'GET' as const,
      }),
    ),
  };
  const renderQueue = {
    add: jest.fn(() => Promise.resolve({ id: 'job-1' })),
  };
  const service = new RenderService(
    repository as unknown as Repository<RenderJob>,
    redisService as unknown as RedisService,
    r2Service as unknown as R2Service,
    renderQueue as unknown as Queue<RenderQueuePayload>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockImplementation((value) => value);
    repository.save.mockImplementation((value) =>
      Promise.resolve({
        ...value,
        id: 'job-1',
      }),
    );
  });

  it('persists and enqueues the user-selected model', async () => {
    const result = await service.render({
      sessionId: 'session-1',
      userId: 'user-1',
      lineArtKey: 'users/user-1/line-art.png',
      chosenPose: { keypoints: [] },
      prompt: 'Keep the original style.',
      model: RenderModel.SEEDREAM_4_5,
      poseProjectionImage: 'data:image/png;base64,pose',
      usageDay: '2026-07-10',
      history: [],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          model: RenderModel.SEEDREAM_4_5,
          usage_day: '2026-07-10',
        }) as unknown,
      }),
    );
    expect(renderQueue.add).toHaveBeenCalledWith(
      'process-render',
      expect.objectContaining({
        model: RenderModel.SEEDREAM_4_5,
        usageDay: '2026-07-10',
      }),
      expect.any(Object),
    );
    expect(result.model).toBe(RenderModel.SEEDREAM_4_5);
  });
});
