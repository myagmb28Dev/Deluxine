import { User } from '../../entities/user.entity';
import { PoseService } from '../pose/pose.service';
import { SessionService } from '../session/session.service';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { RenderUsageService } from './render-usage.service';

describe('RenderController usage reservation', () => {
  const renderService = { render: jest.fn() };
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
});
