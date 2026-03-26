import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PoseService } from '../pose/pose.service';
import { SessionService } from '../session/session.service';
import { CreateRenderDto } from './dto/create-render.dto';
import { RenderService } from './render.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { User } from '../../entities/user.entity';

@ApiTags('render')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('sessions/:sessionId/render')
export class RenderController {
  constructor(
    private readonly renderService: RenderService,
    private readonly sessionService: SessionService,
    private readonly poseService: PoseService,
  ) {}

  @Post()
  @ApiOperation({ summary: '최종 이미지 생성 (비동기 작업 큐 추가)' })
  async create(@Param('sessionId') sessionId: string, @Body() dto: CreateRenderDto, @Req() req: { user: User }) {
    const session = await this.sessionService.findById(sessionId, req.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    const pose = await this.poseService.findBySessionId(sessionId);
    if (!pose) {
      throw new NotFoundException('pose not found');
    }

    await this.sessionService.appendHistory(sessionId, 'render.requested');
    const latest = await this.sessionService.findById(sessionId);

    return this.renderService.render({
      sessionId,
      userId: req.user.id,
      lineArt: session.lineArtUrl,
      chosenPose: pose, // keypoints 배열이 아닌 pose 객체 전체를 전달
      prompt: dto.prompt,
      poseProjectionImage: dto.poseProjectionImage,
      history: latest?.history ?? session.history,
    });
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: '렌더링 작업 상태 조회 (Polling 용도)' })
  async getJobStatus(@Param('jobId') jobId: string) {
    // 1. 초고속 Redis 캐시 조회
    const statusFromCache = await this.renderService.getJobStatus(jobId);

    // 진행 중인 상태('pending', 'processing' 등)는 DB 조회 없이 캐시에서 바로 반환하여 성능 확보
    if (statusFromCache && !['completed', 'failed', 'quota_exceeded'].includes(statusFromCache)) {
      return {
        job_id: jobId,
        status: statusFromCache,
        output_image: null,
        created_at: null,
        updated_at: null,
      };
    }

    // 2. 캐시에 없거나 작업이 완료/실패한 경우 DB에서 직접 조회 (최종 결과 확인용)
    const job = await this.renderService.findJobById(jobId);
    if (!job) {
      // 캐시에 최종 상태(completed/failed)가 남아있을 수 있으므로, 해당 상태를 우선 반환
      if (statusFromCache) {
        return { job_id: jobId, status: statusFromCache, output_image: null, created_at: null, updated_at: null };
      }
      throw new NotFoundException('Render job not found');
    }

    return {
      job_id: job.id,
      status: statusFromCache || job.status, // 캐시 상태를 DB 상태보다 우선 적용
      output_image: job.outputImageUrl,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }
}
