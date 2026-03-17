import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../entities/session.entity';
import { Pose } from '../../entities/pose.entity';
import { RenderJob } from '../../entities/render-job.entity';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Pose, RenderJob]),
    BullModule.registerQueue({ name: 'render' }),
    AuthModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
