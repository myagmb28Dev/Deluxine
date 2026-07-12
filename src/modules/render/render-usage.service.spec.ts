import { HttpException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { RenderUsageService } from './render-usage.service';

describe('RenderUsageService', () => {
  const redisService = {
    incr: jest.fn(),
    expire: jest.fn(),
    get: jest.fn(),
    eval: jest.fn(),
  };
  const service = new RenderUsageService(
    redisService as unknown as RedisService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reserves one of the authenticated user daily render requests', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T03:04:05.000Z'));
    redisService.incr.mockResolvedValue(1);
    redisService.expire.mockResolvedValue(true);

    await expect(service.reserveUserRequest('user-1')).resolves.toEqual({
      used: 1,
      usageDay: '2026-07-11',
    });

    expect(redisService.incr).toHaveBeenCalledWith(
      'render:usage:user:user-1:day:2026-07-11',
    );
    expect(redisService.expire).toHaveBeenCalledTimes(1);
  });

  it('rejects and rolls back a request above the user daily limit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T03:04:05.000Z'));
    redisService.incr.mockResolvedValue(3);
    redisService.eval.mockResolvedValue(1);

    await expect(service.reserveUserRequest('user-1')).rejects.toMatchObject({
      status: 429,
      message: 'Daily render limit exceeded',
    } satisfies Partial<HttpException>);
    expect(redisService.eval).toHaveBeenCalledWith(
      expect.any(String),
      ['render:usage:user:user-1:day:2026-07-11'],
      [],
    );
  });

  it('refunds a failed job only once and uses its reservation day', async () => {
    redisService.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      service.releaseUserRequestForFailedJob('user-1', 'job-1', '2026-07-10'),
    ).resolves.toBe(true);
    await expect(
      service.releaseUserRequestForFailedJob('user-1', 'job-1', '2026-07-10'),
    ).resolves.toBe(false);

    expect(redisService.eval).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      [
        'render:usage:refund:job:job-1',
        'render:usage:user:user-1:day:2026-07-10',
      ],
      [expect.any(String)],
    );
  });

  it('does not reduce a usage counter below zero', async () => {
    redisService.eval.mockResolvedValue(0);

    await expect(
      service.releaseUserRequestForFailedJob('user-1', 'job-1', '2026-07-10'),
    ).resolves.toBe(false);
  });

  it('returns only the authenticated user daily usage for the gauge', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T03:04:05.000Z'));
    redisService.get.mockResolvedValue(1);

    await expect(service.getUserUsage('user-1')).resolves.toEqual({
      scope: 'user',
      daily: {
        used: 1,
        limit: 2,
        remaining: 1,
        resets_at: '2026-07-12T00:00:00.000Z',
      },
      tracked_at: '2026-07-11T03:04:05.000Z',
    });
  });
});
