import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PoseService } from '../pose/pose.service';
import { SessionService } from '../session/session.service';
import { CreateRenderDto } from './dto/create-render.dto';
import { RenderService } from './render.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('render')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions/:sessionId/render')
export class RenderController {
  constructor(
    private readonly renderService: RenderService,
    private readonly sessionService: SessionService,
    private readonly poseService: PoseService,
  ) {}

  @Post()
  @ApiOperation({ summary: '최종 이미지 생성 (비동기 작업 큐 추가)' })
  async create(@Param('sessionId') sessionId: string, @Body() dto: CreateRenderDto, @Req() req: { user: JwtPayload }) {
    const session = await this.sessionService.findById(sessionId, req.user.sub);
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
      userId: req.user.sub,
      lineArt: session.lineArtUrl,
      chosenPose: pose.label,
      prompt: dto.prompt,
      history: latest?.history ?? session.history,
    });
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: '렌더링 작업 상태 조회 (Polling 용도)' })
  async getJobStatus(@Param('jobId') jobId: string) {
    // 1. 초고속 Redis 캐시 조회
    const cachedStatus = await this.renderService.getJobStatus(jobId);
    
    // 2. 캐시에 없으면 DB에서 직접 조회 (최종 결과 확인용)
    const job = await this.renderService.findJobById(jobId);
    if (!job) {
      throw new NotFoundException('Render job not found');
    }

    return {
      job_id: job.id,
      status: cachedStatus || job.status,
      output_image: job.outputImageUrl,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }
}
