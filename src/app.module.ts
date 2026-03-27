import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import { AuthModule } from './modules/auth/auth.module';
import { PoseModule } from './modules/pose/pose.module';
import { RedisModule } from './modules/redis/redis.module';
import { RenderModule } from './modules/render/render.module';
import { SessionModule } from './modules/session/session.module';
import { FirebaseModule } from './modules/firebase/firebase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, redisConfig],
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1분 (ms 단위)
      limit: 60,  // 1분에 60회 제한
    }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('database.url');
        const ssl = configService.get<boolean>('database.ssl') ?? false;

        if (databaseUrl) {
          return {
            type: 'postgres' as const,
            url: databaseUrl,
            ssl: ssl ? { rejectUnauthorized: false } : false,
            autoLoadEntities: true,
            synchronize: configService.get<boolean>('database.synchronize') ?? false,
            extra: {
              max: 10,
              connectionTimeoutMillis: 10000,
            },
          };
        }

        return {
          type: 'postgres' as const,
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.name'),
          ssl: ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: configService.get<boolean>('database.synchronize') ?? false,
          extra: {
            max: 10,
            connectionTimeoutMillis: 10000,
          },
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        const tls = configService.get<boolean>('redis.tls') ?? false;

        if (redisUrl) {
          const parsed = new URL(redisUrl);
          return {
            connection: {
              host: parsed.hostname,
              port: Number(parsed.port || 6379),
              username: parsed.username || undefined,
              password: parsed.password || undefined,
              tls: parsed.protocol === 'rediss:' || tls ? {} : undefined,
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
            },
          };
        }

        return {
          connection: {
            host: configService.get<string>('redis.host'),
            port: configService.get<number>('redis.port'),
            password: configService.get<string>('redis.password') || undefined,
            db: configService.get<number>('redis.db'),
            tls: tls ? {} : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    CacheModule.register({ isGlobal: true }),
    RedisModule,
    AuthModule,
    SessionModule,
    PoseModule,
    RenderModule,
    FirebaseModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
