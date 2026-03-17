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
        const isUpstash = url?.includes('upstash.io');
        
        const commonOptions: any = {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          // Upstash와 같은 서버리스 환경에서는 IPv4를 강제하는 것이 연결 안정성에 도움이 됩니다.
          family: 4, 
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 200, 5000);
            return delay;
          },
        };

        // Upstash는 반드시 TLS를 사용해야 합니다.
        if (isUpstash || configService.get<boolean>('redis.tls')) {
          commonOptions.tls = {
            rejectUnauthorized: false, // Upstash 인증서 호환성을 위해 추가
          };
        }

        const client = url
          ? new Redis(url, commonOptions)
          : new Redis({
              host: configService.get<string>('redis.host'),
              port: configService.get<number>('redis.port'),
              password: configService.get<string>('redis.password') || undefined,
              db: configService.get<number>('redis.db') || 0,
              ...commonOptions,
            });

        console.log(`[Redis] Connecting to ${isUpstash ? 'Upstash' : 'Redis'}...`);
        
        client.on('error', (err) => {
          console.error(`[Redis] Error: ${err.message}`);
          if (err.message.includes('ECONNREFUSED')) {
            console.error('[Redis] Check if your Upstash URL/Host is correct and your IP is allowed.');
          }
        });

        client.on('connect', () => {
          console.log('[Redis] Socket connected');
        });

        client.on('ready', () => {
          console.log('[Redis] Server is ready (Upstash)');
        });

        client.on('close', () => {
          console.warn('[Redis] Connection closed');
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
