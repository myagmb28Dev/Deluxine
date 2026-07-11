import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { RENDER_USER_USAGE_POLICY } from './render-model';

const DAY_COUNTER_TTL_SECONDS = 172800;
const REFUND_MARKER_TTL_SECONDS = 172800;

const DECREMENT_IF_POSITIVE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 0 then
  return 0
end
redis.call('DECR', KEYS[1])
return 1
`;

const REFUND_FAILED_JOB_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
if current <= 0 then
  return 0
end
redis.call('DECR', KEYS[2])
return 1
`;

@Injectable()
export class RenderUsageService {
  constructor(private readonly redisService: RedisService) {}

  async reserveUserRequest(userId: string) {
    const now = new Date();
    const usageDay = this.dayBucket(now);
    const key = RedisKeys.renderUserUsageDay(userId, usageDay);
    const used = await this.redisService.incr(key);

    if (used === 1) {
      await this.redisService.expire(key, DAY_COUNTER_TTL_SECONDS);
    }

    if (used > RENDER_USER_USAGE_POLICY.requests_per_day) {
      await this.decrementIfPositive(key);
      throw new HttpException(
        'Daily render limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { used, usageDay };
  }

  async releaseUserRequest(userId: string, usageDay: string): Promise<void> {
    await this.decrementIfPositive(
      RedisKeys.renderUserUsageDay(userId, usageDay),
    );
  }

  async releaseUserRequestForFailedJob(
    userId: string,
    jobId: string,
    usageDay: string,
  ): Promise<boolean> {
    const result = await this.redisService.eval<number>(
      REFUND_FAILED_JOB_SCRIPT,
      [
        RedisKeys.renderUsageRefundJob(jobId),
        RedisKeys.renderUserUsageDay(userId, usageDay),
      ],
      [String(REFUND_MARKER_TTL_SECONDS)],
    );
    return result === 1;
  }

  async getUserUsage(userId: string) {
    const now = new Date();
    const value = await this.redisService.get<number>(
      this.userDailyKey(userId, now),
    );
    const used = Math.max(Number(value ?? 0), 0);

    return {
      scope: 'user' as const,
      daily: {
        used,
        limit: RENDER_USER_USAGE_POLICY.requests_per_day,
        remaining: Math.max(
          RENDER_USER_USAGE_POLICY.requests_per_day - used,
          0,
        ),
        resets_at: this.nextUtcDay(now).toISOString(),
      },
      tracked_at: now.toISOString(),
    };
  }

  private userDailyKey(userId: string, date: Date): string {
    return RedisKeys.renderUserUsageDay(userId, this.dayBucket(date));
  }

  private dayBucket(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private async decrementIfPositive(key: string): Promise<boolean> {
    const result = await this.redisService.eval<number>(
      DECREMENT_IF_POSITIVE_SCRIPT,
      [key],
      [],
    );
    return result === 1;
  }

  private nextUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      ),
    );
  }
}
