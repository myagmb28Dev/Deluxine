import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionService } from '../session/session.service';
import { UpdatePoseDto } from './dto/update-pose.dto';
import { PoseService } from './pose.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { User } from '../../entities/user.entity';

@ApiTags('pose')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('sessions/:sessionId/pose')
export class PoseController {
  constructor(
    private readonly poseService: PoseService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('generate')
  @ApiQuery({ name: 'targetRatio', required: false, type: Number, description: '희망 등신대 (예: 3.0, 7.0)' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'true일 때 기존 포즈가 있어도 재생성' })
  @ApiOperation({ summary: '도형화 포즈 자동 생성 (비동기 큐 처리)' })
  async generate(
    @Param('sessionId') sessionId: string,
    @Query('targetRatio') targetRatio?: number,
    @Query('force') force?: string,
    @Req() req?: { user: User },
  ) {
    const session = await this.sessionService.findById(sessionId, req?.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const response = await this.poseService.generate(sessionId, targetRatio, force === 'true');
    if ((response as { enqueued?: boolean }).enqueued) {
      await this.sessionService.appendHistory(sessionId, 'pose.generation_requested');
    }
    return response;
  }

  @Get('status')
  @ApiOperation({ summary: '포즈 생성 작업 상태 조회 (Polling 용도)' })
  async getStatus(@Param('sessionId') sessionId: string, @Req() req: { user: User }) {
    const session = await this.sessionService.findById(sessionId, req.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const status = await this.poseService.getPoseGenerationStatus(sessionId);
    const progress = await this.poseService.getPoseProgress(sessionId);

    if (!status) {
      // Redis 캐시에 없으면 DB에 포즈가 있는지 확인
      const pose = await this.poseService.findBySessionId(sessionId);
      if (pose) {
        return { status: 'completed', pose_id: pose.id, progress: 100, phase: 'editing' };
      }
      throw new NotFoundException('Pose generation status not found or not started');
    }

    // 상태가 완료된 경우(id 반환 시)
    if (status !== 'pending' && status !== 'generating' && status !== 'failed') {
      return { status: 'completed', pose_id: status, progress: 100, phase: 'editing' };
    }

    // 진행 중: progress 포함
    const progressValue = progress ?? (status === 'generating' ? 20 : 0);
    if (status === 'failed') {
      return { status, progress: -1, phase: 'failed' }; // 프론트엔드 PoseStatusResponse 규격 준수
    }

    return { status, progress: progressValue, phase: 'processing' };
  }

  @Get('guide')
  @ApiOperation({ summary: '관절 라벨/색상/연결 가이드 조회 (UI Legend 용도)' })
  async getGuide() {
    return this.poseService.getGuide();
  }

  @Get('topology')
  @ApiOperation({ summary: '포즈 스켈레톤 topology 조회' })
  async getTopology() {
    return this.poseService.getTopology();
  }

  @Get()
  @ApiOperation({ summary: '현재 포즈 조회' })
  async getCurrent(@Param('sessionId') sessionId: string, @Req() req: { user: User }) {
    const session = await this.sessionService.findById(sessionId, req.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const pose = await this.poseService.findBySessionId(sessionId);
    if (!pose) {
      throw new NotFoundException('pose not found');
    }

    return {
      ...pose,
      coordinateMode: 'normalized',
    };
  }

  @Patch()
  @SkipThrottle()
  @ApiOperation({ summary: '포즈 키포인트 수정' })
  async update(@Param('sessionId') sessionId: string, @Body() dto: UpdatePoseDto, @Req() req: { user: User }) {
    const session = await this.sessionService.findById(sessionId, req.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const updated = await this.poseService.update(sessionId, dto.keypoints, dto.editorState);
    await this.sessionService.appendHistory(sessionId, 'pose.updated');
    return updated;
  }
}
