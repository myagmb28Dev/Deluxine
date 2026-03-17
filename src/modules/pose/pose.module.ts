import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Pose } from '../../entities/pose.entity';
import { SessionModule } from '../session/session.module';
import { AuthModule } from '../auth/auth.module';
import { PoseController } from './pose.controller';
import { PosesController } from './poses.controller';
import { PoseService } from './pose.service';
import { PoseProcessor } from './pose.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pose]),
    SessionModule,
    AuthModule,
    HttpModule,
    BullModule.registerQueue({
      name: 'pose',
    }),
  ],
  controllers: [PoseController, PosesController],
  providers: [PoseService, PoseProcessor],
  exports: [PoseService],
})
export class PoseModule {}
