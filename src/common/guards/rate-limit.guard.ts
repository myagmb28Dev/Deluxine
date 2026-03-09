import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisKeys } from '../../modules/redis/redis.keys';
import { RedisService } from '../../modules/redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly MAX_REQUESTS = 10;
  private readonly WINDOW_SECONDS = 60;

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionId = request.params?.sessionId || request.body?.sessionId || 'anonymous';
    const endpoint = request.route?.path || 'unknown';

    const key = RedisKeys.rateLimitSession(sessionId, endpoint);
    const current = await this.redisService.incr(key);

    if (current === 1) {
      await this.redisService.expire(key, this.WINDOW_SECONDS);
    }

    if (current > this.MAX_REQUESTS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: await this.redisService.ttl(key),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
