import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RenderJob } from '../../entities/render-job.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { R2Service } from '../r2/r2.service';
import {
  CreateRenderJobInput,
  RenderProgressSnapshot,
  RenderQueuePayload,
} from './render-job.types';
import { ListRenderHistoryDto } from './dto/list-render-history.dto';
import { DEFAULT_RENDER_MODEL } from './render-model';
import { RENDER_PROGRESS } from './render-progress';

type RenderHistoryCursor = {
  createdAt: string;
  id: string;
};

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);
  private readonly STATUS_TTL = 7200; // 2시간

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    private readonly redisService: RedisService,
    private readonly r2Service: R2Service,
    @InjectQueue('render')
    private readonly renderQueue: Queue<RenderQueuePayload>,
  ) {}

  async render(input: CreateRenderJobInput) {
    const job = this.renderJobRepository.create({
      sessionId: input.sessionId,
      prompt: input.prompt,
      status: 'pending',
      outputImageKey: null,
      outputImageUrl: null,
      metadata: {
        line_art_key: input.lineArtKey,
        chosen_pose: input.chosenPose,
        model: input.model,
        usage_day: input.usageDay,
        has_pose_projection_image: Boolean(input.poseProjectionImage),
        ...(input.cameraView ? { camera_view: input.cameraView } : {}),
        history: input.history,
      },
    });

    const saved = await this.renderJobRepository.save(job);
    try {
      await this.updateJobStatus(saved.id, 'pending');
      await this.updateJobProgress(saved.id, RENDER_PROGRESS.queued);

      this.logger.log(
        `Enqueuing render job ${saved.id} for session ${input.sessionId}`,
      );

      // 큐에 작업 추가 (비동기 처리)
      await this.renderQueue.add(
        'process-render',
        {
          jobId: saved.id,
          sessionId: input.sessionId,
          userId: input.userId,
          lineArtKey: input.lineArtKey,
          chosenPose: input.chosenPose,
          prompt: input.prompt,
          model: input.model,
          poseProjectionImage: input.poseProjectionImage,
          cameraView: input.cameraView,
          usageDay: input.usageDay,
        },
        {
          jobId: saved.id,
          attempts: 5, // 재시도 횟수 증가
          backoff: {
            type: 'exponential',
            delay: 10000, // 기본 대기 시간을 10초로 늘림 (429 대응)
          },
        },
      );
    } catch (error) {
      await Promise.allSettled([
        this.renderJobRepository.delete({ id: saved.id }),
        this.redisService.del(RedisKeys.renderJobStatus(saved.id)),
        this.redisService.del(RedisKeys.renderJobProgress(saved.id)),
      ]);
      throw error;
    }

    return {
      job_id: saved.id,
      status: 'pending',
      message: 'Render job has been enqueued successfully.',
      line_art_key: input.lineArtKey,
      chosen_pose: input.chosenPose,
      prompt_used: saved.prompt,
      model: input.model,
      history: input.history,
    };
  }

  async presignOutputGet(outputKey: string) {
    return (await this.r2Service.presignGet(outputKey)).url;
  }

  async updateJobStatus(jobId: string, status: string) {
    await this.redisService.set(
      RedisKeys.renderJobStatus(jobId),
      status,
      this.STATUS_TTL,
    );
  }

  async getJobStatus(jobId: string): Promise<string | null> {
    return this.redisService.get<string>(RedisKeys.renderJobStatus(jobId));
  }

  async updateJobProgress(jobId: string, snapshot: RenderProgressSnapshot) {
    await this.redisService.set(
      RedisKeys.renderJobProgress(jobId),
      snapshot,
      this.STATUS_TTL,
    );
  }

  async getJobProgress(jobId: string) {
    return this.redisService.get<RenderProgressSnapshot>(
      RedisKeys.renderJobProgress(jobId),
    );
  }

  async findJobByIdForUser(jobId: string, sessionId: string, userId: string) {
    return this.renderJobRepository.findOne({
      where: { id: jobId, sessionId, session: { userId } },
      relations: { session: true },
    });
  }

  async listHistory(userId: string, query: ListRenderHistoryDto) {
    const limit = query.limit ?? 20;
    const builder = this.renderJobRepository
      .createQueryBuilder('job')
      .innerJoinAndSelect('job.session', 'session')
      .where('session.userId = :userId', { userId })
      .andWhere('job.status = :completedStatus', {
        completedStatus: 'completed',
      })
      .andWhere('job.outputImageKey IS NOT NULL');

    if (query.cursor) {
      const cursor = this.decodeHistoryCursor(query.cursor);
      builder.andWhere(
        '(job.createdAt < :cursorCreatedAt OR (job.createdAt = :cursorCreatedAt AND job.id < :cursorId))',
        {
          cursorCreatedAt: new Date(cursor.createdAt),
          cursorId: cursor.id,
        },
      );
    }

    const jobs = await builder
      .orderBy('job.createdAt', 'DESC')
      .addOrderBy('job.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const hasNextPage = jobs.length > limit;
    const pageJobs = jobs.slice(0, limit);

    const presented = await Promise.all(
      pageJobs.map(async (job) => {
        try {
          const output = await this.r2Service.presignGet(job.outputImageKey!);
          return {
            job_id: job.id,
            session_id: job.sessionId,
            session_title:
              job.session?.title?.trim() || `세션 ${job.sessionId.slice(0, 8)}`,
            output_image: output.url,
            model:
              (job.metadata?.model as string | undefined) ??
              DEFAULT_RENDER_MODEL,
            prompt: job.prompt,
            created_at: job.createdAt.toISOString(),
          };
        } catch (error) {
          this.logger.warn(
            `Unable to sign render history output for job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        }
      }),
    );

    const lastJob = hasNextPage ? pageJobs.at(-1) : undefined;
    return {
      items: presented.filter((item) => item !== null),
      next_cursor: lastJob
        ? this.encodeHistoryCursor({
            createdAt: lastJob.createdAt.toISOString(),
            id: lastJob.id,
          })
        : null,
    };
  }

  async deleteHistoryItem(userId: string, jobId: string) {
    const job = await this.renderJobRepository.findOne({
      where: { id: jobId, session: { userId } },
      relations: { session: true },
    });
    if (!job || job.status !== 'completed' || !job.outputImageKey) {
      return false;
    }

    if (job.outputImageKey) {
      await this.r2Service.deleteObjects([job.outputImageKey]);
    }
    await this.renderJobRepository.delete({ id: jobId });
    await Promise.all([
      this.redisService.del(RedisKeys.renderJobStatus(jobId)),
      this.redisService.del(RedisKeys.renderJobProgress(jobId)),
    ]);
    return true;
  }

  private encodeHistoryCursor(cursor: RenderHistoryCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeHistoryCursor(value: string): RenderHistoryCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<RenderHistoryCursor>;
      if (
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime()) ||
        typeof parsed.id !== 'string' ||
        parsed.id.length === 0
      ) {
        throw new Error('invalid cursor payload');
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('invalid render history cursor');
    }
  }
}
