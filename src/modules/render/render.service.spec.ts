import { Queue } from 'bullmq';
import { DeepPartial, Repository } from 'typeorm';
import { RenderJob } from '../../entities/render-job.entity';
import { R2Service } from '../r2/r2.service';
import { RedisService } from '../redis/redis.service';
import { RenderService } from './render.service';
import { RenderModel } from './render-model';
import { RenderQueuePayload } from './render-job.types';

describe('RenderService', () => {
  const queryBuilder = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const repository = {
    create: jest.fn(
      (value: DeepPartial<RenderJob>): RenderJob => value as RenderJob,
    ),
    save: jest.fn(
      (value: RenderJob): Promise<RenderJob> => Promise.resolve(value),
    ),
    findOne: jest.fn((): Promise<RenderJob | null> => Promise.resolve(null)),
    createQueryBuilder: jest.fn(() => queryBuilder),
    delete: jest.fn(),
  };
  const redisService = {
    set: jest.fn((): Promise<'OK'> => Promise.resolve('OK')),
    get: jest.fn((): Promise<string | null> => Promise.resolve(null)),
    del: jest.fn((): Promise<number> => Promise.resolve(1)),
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
    deleteObjects: jest.fn(() => Promise.resolve()),
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
    repository.findOne.mockResolvedValue(null);
    repository.delete.mockResolvedValue({ affected: 1 });
    renderQueue.add.mockResolvedValue({ id: 'job-1' });
    repository.create.mockImplementation((value) => value);
    repository.save.mockImplementation((value) =>
      Promise.resolve({
        ...value,
        id: 'job-1',
      }),
    );
    queryBuilder.getMany.mockResolvedValue([]);
  });

  it('persists and enqueues the user-selected model', async () => {
    const result = await service.render({
      sessionId: 'session-1',
      userId: 'user-1',
      lineArtKey: 'users/user-1/line-art.png',
      chosenPose: { keypoints: [] },
      prompt: 'Keep the original style.',
      model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
      poseProjectionImage: 'data:image/png;base64,pose',
      usageDay: '2026-07-10',
      history: [],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
          usage_day: '2026-07-10',
        }) as unknown,
      }),
    );
    expect(renderQueue.add).toHaveBeenCalledWith(
      'process-render',
      expect.objectContaining({
        model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
        usageDay: '2026-07-10',
      }),
      expect.any(Object),
    );
    expect(result.model).toBe(RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE);
  });

  it('removes the pending job and cache when queue insertion fails', async () => {
    renderQueue.add.mockRejectedValue(new Error('QUEUE_UNAVAILABLE'));

    await expect(
      service.render({
        sessionId: 'session-1',
        userId: 'user-1',
        lineArtKey: 'users/user-1/line-art.png',
        chosenPose: { keypoints: [] },
        prompt: '',
        model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
        usageDay: '2026-07-11',
        history: [],
      }),
    ).rejects.toThrow('QUEUE_UNAVAILABLE');

    expect(repository.delete).toHaveBeenCalledWith({ id: 'job-1' });
    expect(redisService.del).toHaveBeenCalledWith('render_job:job-1:status');
    expect(redisService.del).toHaveBeenCalledWith('render_job:job-1:progress');
  });

  it('loads a render job only through its owning session and user', async () => {
    repository.findOne.mockResolvedValue({ id: 'job-1' });

    await service.findJobByIdForUser('job-1', 'session-1', 'user-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        sessionId: 'session-1',
        session: { userId: 'user-1' },
      },
      relations: { session: true },
    });
  });

  it('lists only completed outputs owned by the user with signed URLs', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'job-2',
        sessionId: 'session-1',
        session: { title: 'Gesture study' },
        prompt: 'Keep the line art.',
        outputImageKey: 'renders/job-2.webp',
        metadata: { model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE },
        createdAt: new Date('2026-07-11T09:00:00.000Z'),
      },
    ]);

    const result = await service.listHistory('user-1', { limit: 20 });

    expect(queryBuilder.innerJoinAndSelect).toHaveBeenCalledWith(
      'job.session',
      'session',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'session.userId = :userId',
      {
        userId: 'user-1',
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'job.status = :completedStatus',
      { completedStatus: 'completed' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'job.outputImageKey IS NOT NULL',
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(r2Service.presignGet).toHaveBeenCalledWith('renders/job-2.webp');
    expect(result).toEqual({
      items: [
        {
          job_id: 'job-2',
          session_id: 'session-1',
          session_title: 'Gesture study',
          output_image: 'https://cdn.example.com/output.png',
          model: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
          prompt: 'Keep the line art.',
          created_at: '2026-07-11T09:00:00.000Z',
        },
      ],
      next_cursor: null,
    });
  });

  it('uses a deterministic cursor and returns the next page cursor', async () => {
    const jobs = Array.from({ length: 3 }, (_, index) => ({
      id: `job-${3 - index}`,
      sessionId: 'session-1',
      session: { title: null },
      prompt: '',
      outputImageKey: `renders/job-${3 - index}.webp`,
      metadata: {},
      createdAt: new Date(`2026-07-11T09:00:0${3 - index}.000Z`),
    }));
    queryBuilder.getMany.mockResolvedValue(jobs);

    const firstPage = await service.listHistory('user-1', { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.next_cursor).toEqual(expect.any(String));

    queryBuilder.getMany.mockResolvedValue([]);
    await service.listHistory('user-1', {
      limit: 2,
      cursor: firstPage.next_cursor!,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(job.createdAt < :cursorCreatedAt OR (job.createdAt = :cursorCreatedAt AND job.id < :cursorId))',
      {
        cursorCreatedAt: new Date('2026-07-11T09:00:02.000Z'),
        cursorId: 'job-2',
      },
    );
  });

  it('uses the session identifier as the title when the session has no title', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'job-1',
        sessionId: '3905f650-2537-47c8-bcd4-ed5283344036',
        session: { title: null },
        prompt: '',
        outputImageKey: 'renders/job-1.webp',
        metadata: {},
        createdAt: new Date('2026-07-11T09:00:00.000Z'),
      },
    ]);

    const result = await service.listHistory('user-1', { limit: 20 });

    expect(result.items[0].session_title).toBe('세션 3905f650');
  });

  it('deletes an owned history output without deleting its session', async () => {
    repository.findOne.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      outputImageKey: 'renders/job-1.webp',
      session: { userId: 'user-1' },
    });
    repository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.deleteHistoryItem('user-1', 'job-1')).resolves.toBe(
      true,
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'job-1', session: { userId: 'user-1' } },
      relations: { session: true },
    });
    expect(r2Service.deleteObjects).toHaveBeenCalledWith([
      'renders/job-1.webp',
    ]);
    expect(repository.delete).toHaveBeenCalledWith({ id: 'job-1' });
    expect(redisService.del).toHaveBeenCalledWith('render_job:job-1:status');
    expect(redisService.del).toHaveBeenCalledWith('render_job:job-1:progress');
  });

  it('does not delete a history output not owned by the user', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.deleteHistoryItem('user-2', 'job-1')).resolves.toBe(
      false,
    );

    expect(r2Service.deleteObjects).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('does not delete an owned render job that is still running', async () => {
    repository.findOne.mockResolvedValue({
      id: 'job-1',
      status: 'running',
      outputImageKey: null,
      session: { userId: 'user-1' },
    });

    await expect(service.deleteHistoryItem('user-1', 'job-1')).resolves.toBe(
      false,
    );

    expect(r2Service.deleteObjects).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
