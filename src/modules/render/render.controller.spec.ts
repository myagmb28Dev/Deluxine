import { User } from '../../entities/user.entity';
import { PoseService } from '../pose/pose.service';
import { SessionService } from '../session/session.service';
import { RenderController, RenderHistoryController } from './render.controller';
import { RenderService } from './render.service';
import { RenderUsageService } from './render-usage.service';

describe('RenderController usage reservation', () => {
  const renderService = {
    render: jest.fn(),
    listHistory: jest.fn(),
    deleteHistoryItem: jest.fn(),
    findJobByIdForUser: jest.fn(),
    getJobStatus: jest.fn(),
    getJobProgress: jest.fn(),
  };
  const sessionService = {
    findById: jest.fn(),
    appendHistory: jest.fn(),
  };
  const poseService = { findBySessionId: jest.fn() };
  const renderUsageService = {
    reserveUserRequest: jest.fn(),
    releaseUserRequest: jest.fn(),
  };
  const controller = new RenderController(
    renderService as unknown as RenderService,
    sessionService as unknown as SessionService,
    poseService as unknown as PoseService,
    renderUsageService as unknown as RenderUsageService,
  );
  const historyController = new RenderHistoryController(
    renderService as unknown as RenderService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    sessionService.findById.mockResolvedValue({
      id: 'session-1',
      lineArtKey: 'line-art.png',
      history: [],
    });
    sessionService.appendHistory.mockResolvedValue(undefined);
    poseService.findBySessionId.mockResolvedValue({ keypoints: [] });
    renderUsageService.reserveUserRequest.mockResolvedValue({
      used: 1,
      usageDay: '2026-07-10',
    });
    renderUsageService.releaseUserRequest.mockResolvedValue(undefined);
  });

  it('releases the reserved usage day when enqueueing fails', async () => {
    renderService.render.mockRejectedValue(new Error('QUEUE_UNAVAILABLE'));

    await expect(
      controller.create(
        'session-1',
        { prompt: '' },
        { user: { id: 'user-1' } as User },
      ),
    ).rejects.toThrow('QUEUE_UNAVAILABLE');

    expect(renderUsageService.releaseUserRequest).toHaveBeenCalledWith(
      'user-1',
      '2026-07-10',
    );
  });

  it('passes the camera viewpoint to the render service', async () => {
    renderService.render.mockResolvedValue({ job_id: 'job-1' });

    await controller.create(
      'session-1',
      {
        prompt: '',
        cameraView: { azimuthDegrees: 38, elevationDegrees: 12 },
      },
      { user: { id: 'user-1' } as User },
    );

    expect(renderService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraView: { azimuthDegrees: 38, elevationDegrees: 12 },
      }),
    );
  });

  it('lists render history for the authenticated user', async () => {
    renderService.listHistory.mockResolvedValue({
      items: [],
      next_cursor: null,
    });

    await expect(
      historyController.listHistory(
        { limit: 20 },
        { user: { id: 'user-1' } as User },
      ),
    ).resolves.toEqual({ items: [], next_cursor: null });

    expect(renderService.listHistory).toHaveBeenCalledWith('user-1', {
      limit: 20,
    });
  });

  it('includes server progress in a running render job response', async () => {
    renderService.findJobByIdForUser.mockResolvedValue({
      id: 'job-1',
      status: 'running',
      outputImageKey: null,
      metadata: {},
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:00:01.000Z'),
    });
    renderService.getJobStatus.mockResolvedValue('running');
    renderService.getJobProgress.mockResolvedValue({
      progress: 35,
      phase: 'generating',
      message: 'AI가 이미지를 생성하고 있습니다.',
    });

    await expect(
      controller.getJobStatus('session-1', 'job-1', {
        user: { id: 'user-1' } as User,
      }),
    ).resolves.toEqual({
      job_id: 'job-1',
      status: 'running',
      progress: 35,
      phase: 'generating',
      progress_message: 'AI가 이미지를 생성하고 있습니다.',
      output_image: null,
      model: expect.any(String),
      created_at: new Date('2026-07-11T09:00:00.000Z'),
      updated_at: new Date('2026-07-11T09:00:01.000Z'),
    });
    expect(renderService.findJobByIdForUser).toHaveBeenCalledWith(
      'job-1',
      'session-1',
      'user-1',
    );
  });

  it('does not expose another users render job status', async () => {
    renderService.findJobByIdForUser.mockResolvedValue(null);

    await expect(
      controller.getJobStatus('session-2', 'job-1', {
        user: { id: 'user-2' } as User,
      }),
    ).rejects.toThrow('Render job not found');

    expect(renderService.getJobStatus).not.toHaveBeenCalled();
  });

  it('deletes an owned render history item', async () => {
    renderService.deleteHistoryItem.mockResolvedValue(true);

    await expect(
      historyController.deleteHistoryItem('job-1', {
        user: { id: 'user-1' } as User,
      }),
    ).resolves.toBeUndefined();

    expect(renderService.deleteHistoryItem).toHaveBeenCalledWith(
      'user-1',
      'job-1',
    );
  });

  it('returns not found when deleting another users history item', async () => {
    renderService.deleteHistoryItem.mockResolvedValue(false);

    await expect(
      historyController.deleteHistoryItem('job-1', {
        user: { id: 'user-2' } as User,
      }),
    ).rejects.toThrow('render history item not found');
  });
});
