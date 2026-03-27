import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { RenderJob } from '../../entities/render-job.entity';
import { NanoBananaService } from './nano-banana.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { R2Service } from '../r2/r2.service';

@Processor('render')
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);
  private readonly STATUS_TTL = 7200; // 2시간

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    private readonly nanoBananaService: NanoBananaService,
    private readonly redisService: RedisService,
    private readonly r2Service: R2Service,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, sessionId, userId, lineArtKey, chosenPose, prompt, poseProjectionImage } = job.data;
    this.logger.log(`Processing render job: ${jobId}`);

    const renderJob = await this.renderJobRepository.findOne({ where: { id: jobId } });
    if (!renderJob) {
      this.logger.error(`Job ${jobId} not found in database`);
      return;
    }

    try {
      // 1. 상태 변경: 실행 중
      renderJob.status = 'running';
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(RedisKeys.renderJobStatus(jobId), 'running', this.STATUS_TTL);

      // 2. Nano Banana AI 엔진 호출 (진짜 연동)
      const lineArtBuffer = await this.r2Service.getObjectBuffer(lineArtKey);
      const lineArtMimeType = String(lineArtKey || '').toLowerCase().endsWith('.jpg') || String(lineArtKey || '').toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';

      const renderResult = await this.nanoBananaService.render({
        lineArtBase64: lineArtBuffer.toString('base64'),
        lineArtMimeType,
        pose_data: chosenPose,
        prompt,
        pose_projection_image: poseProjectionImage,
      });

      const outputKey = this.r2Service.buildKey(['users', userId, 'sessions', sessionId, 'renders', `render-${randomUUID()}.png`]);
      await this.r2Service.putObject(outputKey, Buffer.from(renderResult.outputImageBase64, 'base64'), {
        contentType: 'image/png',
      });

      // 3. 결과 저장 및 상태 변경: 완료
      renderJob.status = 'completed';
      renderJob.outputImageKey = outputKey;
      renderJob.outputImageUrl = null;
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(RedisKeys.renderJobStatus(jobId), 'completed', this.STATUS_TTL);

      this.logger.log(`Render job ${jobId} completed successfully`);
      return { outputImageKey: outputKey, generationTime: renderResult.generationTime };
    } catch (error) {
      this.logger.error(`Render job ${jobId} failed: ${error.message}`);
      
      const isQuotaError = error.message === 'QUOTA_EXCEEDED';
      const status = isQuotaError ? 'quota_exceeded' : 'failed';
      
      renderJob.status = status;
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(RedisKeys.renderJobStatus(jobId), status, this.STATUS_TTL);
      
      // SSE 연동을 위해 세션의 현재 포즈 상태도 업데이트 (필요 시)
      await this.redisService.set(RedisKeys.sessionCurrentPose(renderJob.sessionId), status, 600);
      
      throw error;
    }
  }
}
