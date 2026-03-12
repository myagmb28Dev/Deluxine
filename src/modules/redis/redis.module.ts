import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisController } from './redis.controller';
import { RedisService } from './redis.service';

@Global()
@Module({
  controllers: [RedisController],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('redis.url');
        const tls = configService.get<boolean>('redis.tls') ?? false;

        const commonOptions = {
          maxRetriesPerRequest: null as null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            console.warn(`Redis reconnection attempt ${times}, retrying in ${delay}ms...`);
            return delay;
          },
        };

        const client = url
          ? new Redis(url, {
              ...commonOptions,
            })
          : new Redis({
              host: configService.get<string>('redis.host'),
              port: configService.get<number>('redis.port'),
              password: configService.get<string>('redis.password') || undefined,
              db: configService.get<number>('redis.db'),
              tls: tls ? {} : undefined,
              ...commonOptions,
            });
        
        client.on('error', (err) => {
          console.error('Redis connection error:', err?.message || err);
        });

        client.on('connect', () => {
          console.log('Redis connected successfully');
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
