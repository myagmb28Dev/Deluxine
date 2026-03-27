import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../entities/session.entity';
import { Pose } from '../../entities/pose.entity';
import { RenderJob } from '../../entities/render-job.entity';
import { SessionController } from './session.controller';
import { SessionEventsController } from './session-events.controller';
import { SessionService } from './session.service';
import { AuthModule } from '../auth/auth.module';
import { PoseModule } from '../pose/pose.module';
import { R2Module } from '../r2/r2.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Pose, RenderJob]),
    BullModule.registerQueue({ name: 'render' }),
    AuthModule,
    R2Module,
    forwardRef(() => PoseModule),
  ],
  controllers: [SessionController, SessionEventsController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
