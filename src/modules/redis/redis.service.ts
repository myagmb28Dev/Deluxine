import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  get client() {
    return this.redisClient;
  }

  async ping() {
    return this.redisClient.ping();
  }

  async set(key: string, value: string | number | object, ttl?: number) {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (ttl) {
      return this.redisClient.set(key, serialized, 'EX', ttl);
    }
    return this.redisClient.set(key, serialized);
  }

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async del(key: string): Promise<number> {
    return this.redisClient.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.redisClient.ttl(key);
  }

  async incr(key: string): Promise<number> {
    return this.redisClient.incr(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.redisClient.expire(key, seconds);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  async flushPattern(pattern: string): Promise<number> {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;
    return this.redisClient.del(...keys);
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
