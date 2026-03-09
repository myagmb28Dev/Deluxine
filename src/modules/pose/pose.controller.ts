import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { UpdatePoseDto } from './dto/update-pose.dto';
import { PoseService } from './pose.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('pose')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions/:sessionId/pose')
export class PoseController {
  constructor(
    private readonly poseService: PoseService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: '도형화 포즈 자동 생성 (비동기 큐 처리)' })
  async generate(@Param('sessionId') sessionId: string) {
    const session = await this.sessionService.findById(sessionId);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const response = await this.poseService.generate(sessionId);
    await this.sessionService.appendHistory(sessionId, 'pose.generation_requested');
    return response;
  }

  @Get('status')
  @ApiOperation({ summary: '포즈 생성 작업 상태 조회 (Polling 용도)' })
  async getStatus(@Param('sessionId') sessionId: string) {
    const status = await this.poseService.getPoseGenerationStatus(sessionId);
    if (!status) {
      // Redis 캐시에 없으면 DB에 포즈가 있는지 확인
      const pose = await this.poseService.findBySessionId(sessionId);
      if (pose) {
        return { status: 'completed', pose_id: pose.id };
      }
      throw new NotFoundException('Pose generation status not found or not started');
    }

    // 상태가 완료된 경우(id 반환 시)
    if (status !== 'pending' && status !== 'generating' && status !== 'failed') {
      return { status: 'completed', pose_id: status };
    }

    return { status };
  }

  @Get()
  @ApiOperation({ summary: '현재 포즈 조회' })
  async getCurrent(@Param('sessionId') sessionId: string) {
    const pose = await this.poseService.findBySessionId(sessionId);
    if (!pose) {
      throw new NotFoundException('pose not found');
    }

    return pose;
  }

  @Patch()
  @ApiOperation({ summary: '포즈 키포인트 수정' })
  async update(@Param('sessionId') sessionId: string, @Body() dto: UpdatePoseDto) {
    const session = await this.sessionService.findById(sessionId);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const updated = await this.poseService.update(sessionId, dto.keypoints);
    await this.sessionService.appendHistory(sessionId, 'pose.updated');
    return updated;
  }
}
