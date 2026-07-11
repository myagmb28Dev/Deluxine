import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PoseService } from '../pose/pose.service';
import { SessionService } from '../session/session.service';
import { CreateRenderDto } from './dto/create-render.dto';
import { RenderService } from './render.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { User } from '../../entities/user.entity';
import {
  DEFAULT_RENDER_MODEL,
  RENDER_MODEL_OPTIONS,
  RENDER_USER_USAGE_POLICY,
} from './render-model';
import { RenderUsageService } from './render-usage.service';
import { ListRenderHistoryDto } from './dto/list-render-history.dto';
import { RenderProgressSnapshot } from './render-job.types';

@ApiTags('render')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('render')
export class RenderHistoryController {
  constructor(private readonly renderService: RenderService) {}

  @Get('history')
  @ApiOperation({ summary: 'List completed render outputs owned by the user' })
  listHistory(
    @Query() query: ListRenderHistoryDto,
    @Req() req: { user: User },
  ) {
    return this.renderService.listHistory(req.user.id, query);
  }

  @Delete('history/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one completed render history output' })
  async deleteHistoryItem(
    @Param('jobId') jobId: string,
    @Req() req: { user: User },
  ) {
    const deleted = await this.renderService.deleteHistoryItem(
      req.user.id,
      jobId,
    );
    if (!deleted) {
      throw new NotFoundException('render history item not found');
    }
  }
}

@ApiTags('render')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('sessions/:sessionId/render')
export class RenderController {
  constructor(
    private readonly renderService: RenderService,
    private readonly sessionService: SessionService,
    private readonly poseService: PoseService,
    private readonly renderUsageService: RenderUsageService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'List available image generation models' })
  listModels() {
    return {
      default_model: DEFAULT_RENDER_MODEL,
      models: RENDER_MODEL_OPTIONS,
      usage_policy: RENDER_USER_USAGE_POLICY,
    };
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get authenticated user render usage' })
  getUsage(@Req() req: { user: User }) {
    return this.renderUsageService.getUserUsage(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: '최종 이미지 생성 (비동기 작업 큐 추가)' })
  async create(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateRenderDto,
    @Req() req: { user: User },
  ) {
    const session = await this.sessionService.findById(sessionId, req.user.id);
    if (!session) {
      throw new NotFoundException('session not found');
    }
    if (!session.lineArtKey) {
      throw new NotFoundException('line art not uploaded');
    }

    const pose = await this.poseService.findBySessionId(sessionId);
    if (!pose) {
      throw new NotFoundException('pose not found');
    }

    const reservation = await this.renderUsageService.reserveUserRequest(
      req.user.id,
    );

    try {
      await this.sessionService.appendHistory(sessionId, 'render.requested');
      const latest = await this.sessionService.findById(sessionId);

      return await this.renderService.render({
        sessionId,
        userId: req.user.id,
        lineArtKey: session.lineArtKey,
        chosenPose: pose, // keypoints 배열이 아닌 pose 객체 전체를 전달
        prompt: dto.prompt,
        model: dto.model ?? DEFAULT_RENDER_MODEL,
        poseProjectionImage: dto.poseProjectionImage,
        usageDay: reservation.usageDay,
        history: latest?.history ?? session.history,
      });
    } catch (error: unknown) {
      await this.renderUsageService.releaseUserRequest(
        req.user.id,
        reservation.usageDay,
      );
      throw error;
    }
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: '렌더링 작업 상태 조회 (Polling 용도)' })
  async getJobStatus(@Param('jobId') jobId: string) {
    // 1. 초고속 Redis 캐시 조회
    const statusFromCache = await this.renderService.getJobStatus(jobId);
    const cachedProgress = await this.renderService.getJobProgress(jobId);

    // 진행 중인 상태('pending', 'processing' 등)는 DB 조회 없이 캐시에서 바로 반환하여 성능 확보
    if (
      statusFromCache &&
      !['completed', 'failed', 'quota_exceeded'].includes(statusFromCache)
    ) {
      return {
        job_id: jobId,
        status: statusFromCache,
        ...this.presentProgress(statusFromCache, cachedProgress),
        output_image: null,
        model: null,
        created_at: null,
        updated_at: null,
      };
    }

    // 2. 캐시에 없거나 작업이 완료/실패한 경우 DB에서 직접 조회 (최종 결과 확인용)
    const job = await this.renderService.findJobById(jobId);
    if (!job) {
      // 캐시에 최종 상태(completed/failed)가 남아있을 수 있으므로, 해당 상태를 우선 반환
      if (statusFromCache) {
        return {
          job_id: jobId,
          status: statusFromCache,
          ...this.presentProgress(statusFromCache, cachedProgress),
          output_image: null,
          model: null,
          created_at: null,
          updated_at: null,
        };
      }
      throw new NotFoundException('Render job not found');
    }

    return {
      job_id: job.id,
      status: statusFromCache || job.status, // 캐시 상태를 DB 상태보다 우선 적용
      ...this.presentProgress(statusFromCache || job.status, cachedProgress),
      output_image: job.outputImageKey
        ? await this.renderService.presignOutputGet(job.outputImageKey)
        : null,
      model: job.metadata?.model ?? DEFAULT_RENDER_MODEL,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }

  private presentProgress(
    status: string,
    snapshot: RenderProgressSnapshot | null,
  ) {
    const fallback = this.fallbackProgress(status);
    const current = snapshot ?? fallback;
    return {
      progress: current.progress,
      phase: current.phase,
      progress_message: current.message,
    };
  }

  private fallbackProgress(status: string): RenderProgressSnapshot {
    if (status === 'completed') {
      return {
        progress: 100,
        phase: 'completed',
        message: '이미지 생성이 완료되었습니다.',
      };
    }
    if (status === 'failed' || status === 'quota_exceeded') {
      return {
        progress: -1,
        phase: 'failed',
        message: '이미지 생성에 실패했습니다.',
      };
    }
    if (status === 'pending') {
      return {
        progress: 5,
        phase: 'queued',
        message: '렌더링 작업이 대기열에 등록되었습니다.',
      };
    }
    return {
      progress: 35,
      phase: 'generating',
      message: 'AI가 이미지를 생성하고 있습니다.',
    };
  }
}
