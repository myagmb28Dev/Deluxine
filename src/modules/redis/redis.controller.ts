import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedisService } from '../redis/redis.service';

@ApiTags('redis')
@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Redis 연결 확인' })
  async ping() {
    const result = await this.redisService.ping();
    return { status: 'ok', response: result };
  }

  @Get('keys/:pattern')
  @ApiOperation({ summary: 'Redis 키 조회 (디버깅용)' })
  async keys(@Param('pattern') pattern: string) {
    const keys = await this.redisService.keys(pattern);
    return { pattern, count: keys.length, keys };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Redis 통계' })
  async stats() {
    const patterns = ['session:*', 'cache:*', 'temp:*', 'render_job:*', 'ratelimit:*'];
    const results = await Promise.all(
      patterns.map(async (pattern) => ({
        pattern,
        count: (await this.redisService.keys(pattern)).length,
      })),
    );

    return { stats: results };
  }
}
