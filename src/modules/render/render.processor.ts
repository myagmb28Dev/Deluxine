import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { RenderJob } from '../../entities/render-job.entity';
import {
  OpenRouterImageError,
  OpenRouterImageService,
} from './openrouter-image.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { R2Service } from '../r2/r2.service';
import { DEFAULT_RENDER_MODEL } from './render-model';
import { RenderProgressSnapshot, RenderQueuePayload } from './render-job.types';
import { RenderUsageService } from './render-usage.service';
import { RENDER_PROGRESS } from './render-progress';

interface RenderQueueResult {
  outputImageKey: string;
  generationTime: string;
}

@Processor('render')
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);
  private readonly STATUS_TTL = 7200;

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    private readonly openRouterImageService: OpenRouterImageService,
    private readonly redisService: RedisService,
    private readonly r2Service: R2Service,
    private readonly renderUsageService: RenderUsageService,
  ) {
    super();
  }

  async process(
    job: Job<RenderQueuePayload, RenderQueueResult | void, string>,
  ): Promise<RenderQueueResult | void> {
    const {
      jobId,
      sessionId,
      userId,
      lineArtKey,
      chosenPose,
      prompt,
      model = DEFAULT_RENDER_MODEL,
      poseProjectionImage,
      cameraView,
      usageDay,
    } = job.data;
    this.logger.log(`Processing render job ${jobId} with ${model}`);

    const renderJob = await this.renderJobRepository.findOne({
      where: { id: jobId },
    });
    if (!renderJob) {
      this.logger.error(`Job ${jobId} not found in database`);
      return;
    }

    try {
      renderJob.status = 'running';
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(
        RedisKeys.renderJobStatus(jobId),
        'running',
        this.STATUS_TTL,
      );
      await this.updateProgress(jobId, RENDER_PROGRESS.preparing);

      // A signed URL keeps large R2 images out of the OpenRouter request body.
      const lineArtImage = (await this.r2Service.presignGet(lineArtKey)).url;
      await this.updateProgress(jobId, RENDER_PROGRESS.generating);
      const renderResult = await this.openRouterImageService.render({
        model,
        lineArtImage,
        poseData: chosenPose,
        prompt,
        poseProjectionImage,
        cameraView,
      });
      await this.updateProgress(jobId, RENDER_PROGRESS.uploading);

      const extension = this.extensionForMimeType(renderResult.outputMimeType);
      const outputKey = this.r2Service.buildKey([
        'users',
        userId,
        'sessions',
        sessionId,
        'renders',
        `render-${randomUUID()}.${extension}`,
      ]);
      await this.r2Service.putObject(
        outputKey,
        Buffer.from(renderResult.outputImageBase64, 'base64'),
        { contentType: renderResult.outputMimeType },
      );

      renderJob.status = 'completed';
      renderJob.outputImageKey = outputKey;
      renderJob.outputImageUrl = null;
      renderJob.metadata = {
        ...(renderJob.metadata ?? {}),
        model,
        generation: {
          provider: 'openrouter',
          cost_usd: renderResult.costUsd,
          completed_at: renderResult.generationTime,
        },
        has_pose_projection_image: Boolean(poseProjectionImage),
        reference_strategy: renderResult.referenceStrategy,
        reference_count: renderResult.referenceCount,
      };
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(
        RedisKeys.renderJobStatus(jobId),
        'completed',
        this.STATUS_TTL,
      );
      await this.updateProgress(jobId, RENDER_PROGRESS.completed);

      this.logger.log(`Render job ${jobId} completed successfully`);
      return {
        outputImageKey: outputKey,
        generationTime: renderResult.generationTime,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const stack = error instanceof Error ? error.stack : undefined;
      const responseData =
        error instanceof OpenRouterImageError ? error.responseData : undefined;
      const details =
        error instanceof OpenRouterImageError ? error.details : undefined;

      this.logger.error(
        `Render job ${jobId} failed: ${message}`,
        stack ?? 'no-stack',
      );

      const status = message === 'QUOTA_EXCEEDED' ? 'quota_exceeded' : 'failed';
      const existingMeta = renderJob.metadata ?? {};
      existingMeta['lastError'] = {
        message,
        stack,
        ...(responseData ? { responseData } : {}),
        ...(details ? { details } : {}),
        timestamp: new Date().toISOString(),
      };

      renderJob.metadata = existingMeta;
      if (this.isFinalAttempt(job)) {
        const reservedUsageDay =
          usageDay ??
          (typeof existingMeta['usage_day'] === 'string'
            ? existingMeta['usage_day']
            : renderJob.createdAt.toISOString().slice(0, 10));
        await this.renderUsageService.releaseUserRequestForFailedJob(
          userId,
          jobId,
          reservedUsageDay,
        );
        renderJob.status = status;
        await this.renderJobRepository.save(renderJob);
        await this.redisService.set(
          RedisKeys.renderJobStatus(jobId),
          status,
          this.STATUS_TTL,
        );
        await this.redisService.set(
          RedisKeys.sessionCurrentPose(renderJob.sessionId),
          status,
          600,
        );
        await this.updateProgress(
          jobId,
          status === 'quota_exceeded'
            ? RENDER_PROGRESS.quotaExceeded
            : RENDER_PROGRESS.failed,
        );
      } else {
        renderJob.status = 'running';
        await this.renderJobRepository.save(renderJob);
        await this.redisService.set(
          RedisKeys.renderJobStatus(jobId),
          'running',
          this.STATUS_TTL,
        );
        await this.updateProgress(jobId, RENDER_PROGRESS.retrying);
      }

      throw error;
    }
  }

  private extensionForMimeType(mimeType: string) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    return 'png';
  }

  private async updateProgress(
    jobId: string,
    snapshot: RenderProgressSnapshot,
  ) {
    await this.redisService.set(
      RedisKeys.renderJobProgress(jobId),
      snapshot,
      this.STATUS_TTL,
    );
  }

  private isFinalAttempt(
    job: Job<RenderQueuePayload, RenderQueueResult | void, string>,
  ) {
    const maxAttempts = job.opts.attempts ?? 1;
    return job.attemptsMade + 1 >= maxAttempts;
  }
}
