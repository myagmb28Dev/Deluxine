import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { RenderJob } from '../../entities/render-job.entity';
import { R2Service } from '../r2/r2.service';
import { RedisService } from '../redis/redis.service';
import {
  OpenRouterImageError,
  OpenRouterImageService,
} from './openrouter-image.service';
import { RenderQueuePayload } from './render-job.types';
import { RenderModel } from './render-model';
import { RenderProcessor } from './render.processor';
import { RenderUsageService } from './render-usage.service';

type TestRenderResult = {
  outputImageKey: string;
  generationTime: string;
} | void;

describe('RenderProcessor usage refunds', () => {
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const openRouterImageService = {
    render: jest.fn(),
  };
  const redisService = {
    set: jest.fn(),
  };
  const r2Service = {
    presignGet: jest.fn(),
    buildKey: jest.fn(),
    putObject: jest.fn(),
  };
  const renderUsageService = {
    releaseUserRequestForFailedJob: jest.fn(),
  };
  const processor = new RenderProcessor(
    repository as unknown as Repository<RenderJob>,
    openRouterImageService as unknown as OpenRouterImageService,
    redisService as unknown as RedisService,
    r2Service as unknown as R2Service,
    renderUsageService as unknown as RenderUsageService,
  );

  let renderJob: RenderJob;

  beforeEach(() => {
    jest.clearAllMocks();
    renderJob = {
      id: 'job-1',
      sessionId: 'session-1',
      status: 'pending',
      metadata: { usage_day: '2026-07-10' },
      createdAt: new Date('2026-07-10T23:59:59.000Z'),
    } as RenderJob;
    repository.findOne.mockResolvedValue(renderJob);
    repository.save.mockImplementation((value: RenderJob) =>
      Promise.resolve(value),
    );
    redisService.set.mockResolvedValue('OK');
    r2Service.presignGet.mockResolvedValue({
      url: 'https://cdn.example.com/line-art.png',
    });
    renderUsageService.releaseUserRequestForFailedJob.mockResolvedValue(true);
  });

  it('does not refund or expose a terminal status before the final attempt', async () => {
    openRouterImageService.render.mockRejectedValue(new Error('PROVIDER_DOWN'));

    await expect(processor.process(makeJob(0))).rejects.toThrow(
      'PROVIDER_DOWN',
    );

    expect(
      renderUsageService.releaseUserRequestForFailedJob,
    ).not.toHaveBeenCalled();
    expect(renderJob.status).toBe('running');
  });

  it('refunds exactly once on the final failed attempt', async () => {
    openRouterImageService.render.mockRejectedValue(new Error('PROVIDER_DOWN'));

    await expect(processor.process(makeJob(4))).rejects.toThrow(
      'PROVIDER_DOWN',
    );

    expect(renderJob.status).toBe('failed');
    expect(
      renderUsageService.releaseUserRequestForFailedJob,
    ).toHaveBeenCalledTimes(1);
    expect(
      renderUsageService.releaseUserRequestForFailedJob,
    ).toHaveBeenCalledWith('user-1', 'job-1', '2026-07-10');
  });

  it('refunds the final quota-exceeded attempt', async () => {
    openRouterImageService.render.mockRejectedValue(
      new OpenRouterImageError('QUOTA_EXCEEDED', 429),
    );

    await expect(processor.process(makeJob(4))).rejects.toThrow(
      'QUOTA_EXCEEDED',
    );

    expect(renderJob.status).toBe('quota_exceeded');
    expect(
      renderUsageService.releaseUserRequestForFailedJob,
    ).toHaveBeenCalledWith('user-1', 'job-1', '2026-07-10');
  });

  it('does not refund a completed job', async () => {
    openRouterImageService.render.mockResolvedValue({
      outputImageBase64: 'generated-image',
      outputMimeType: 'image/png',
      generationTime: '2026-07-11T03:05:00.000Z',
      costUsd: 0,
      referenceStrategy: 'pose_first',
      referenceCount: 2,
    });
    r2Service.buildKey.mockReturnValue('renders/output.png');
    r2Service.putObject.mockResolvedValue({});

    await expect(processor.process(makeJob(0))).resolves.toEqual({
      outputImageKey: 'renders/output.png',
      generationTime: '2026-07-11T03:05:00.000Z',
    });

    expect(renderJob.status).toBe('completed');
    expect(renderJob.metadata).toEqual(
      expect.objectContaining({
        has_pose_projection_image: true,
        reference_strategy: 'pose_first',
        reference_count: 2,
      }),
    );
    expect(
      renderUsageService.releaseUserRequestForFailedJob,
    ).not.toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalledWith(
      'render_job:job-1:progress',
      {
        progress: 15,
        phase: 'preparing',
        message: '렌더링 입력을 준비하고 있습니다.',
      },
      7200,
    );
    expect(redisService.set).toHaveBeenCalledWith(
      'render_job:job-1:progress',
      {
        progress: 35,
        phase: 'generating',
        message: 'AI가 이미지를 생성하고 있습니다.',
      },
      7200,
    );
    expect(redisService.set).toHaveBeenCalledWith(
      'render_job:job-1:progress',
      {
        progress: 90,
        phase: 'uploading',
        message: '생성된 이미지를 저장하고 있습니다.',
      },
      7200,
    );
    expect(redisService.set).toHaveBeenCalledWith(
      'render_job:job-1:progress',
      {
        progress: 100,
        phase: 'completed',
        message: '이미지 생성이 완료되었습니다.',
      },
      7200,
    );
  });

  function makeJob(attemptsMade: number) {
    return {
      attemptsMade,
      opts: { attempts: 5 },
      data: {
        jobId: 'job-1',
        sessionId: 'session-1',
        userId: 'user-1',
        lineArtKey: 'line-art.png',
        chosenPose: { keypoints: [] },
        prompt: '',
        model: RenderModel.SEEDREAM_4_5,
        poseProjectionImage: 'data:image/jpeg;base64,pose',
        usageDay: '2026-07-10',
      },
    } as unknown as Job<RenderQueuePayload, TestRenderResult, string>;
  }
});
