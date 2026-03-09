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

        if (url) {
          return new Redis(url, {
            tls: tls ? {} : undefined,
          });
        }

        return new Redis({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db'),
          tls: tls ? {} : undefined,
        });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
