import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { RenderJob } from '../../entities/render-job.entity';
import { PoseModule } from '../pose/pose.module';
import { SessionModule } from '../session/session.module';
import { AuthModule } from '../auth/auth.module';
import { R2Module } from '../r2/r2.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { OpenRouterImageService } from './openrouter-image.service';
import { RenderProcessor } from './render.processor';
import { RenderUsageService } from './render-usage.service';

const enableQueueProcessors =
  (process.env.ENABLE_QUEUE_PROCESSORS ?? 'true') !== 'false';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenderJob]),
    SessionModule,
    PoseModule,
    AuthModule,
    R2Module,
    HttpModule,
    BullModule.registerQueue({
      name: 'render',
    }),
  ],
  controllers: [RenderController],
  providers: [
    RenderService,
    RenderUsageService,
    OpenRouterImageService,
    ...(enableQueueProcessors ? [RenderProcessor] : []),
  ],
})
export class RenderModule {}
