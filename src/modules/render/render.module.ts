import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { RenderJob } from '../../entities/render-job.entity';
import { PoseModule } from '../pose/pose.module';
import { SessionModule } from '../session/session.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { NanoBananaService } from './nano-banana.service';
import { RenderProcessor } from './render.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenderJob]),
    SessionModule,
    PoseModule,
    HttpModule,
    BullModule.registerQueue({
      name: 'render',
    }),
  ],
  controllers: [RenderController],
  providers: [RenderService, NanoBananaService, RenderProcessor],
})
export class RenderModule {}
