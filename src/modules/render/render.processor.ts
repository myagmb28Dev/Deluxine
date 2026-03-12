import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RenderJob } from '../../entities/render-job.entity';
import { NanoBananaService } from './nano-banana.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

@Processor('render')
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);
  private readonly STATUS_TTL = 7200; // 2시간

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    private readonly nanoBananaService: NanoBananaService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, lineArt, chosenPose, prompt, outputDir } = job.data;
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
      const renderResult = await this.nanoBananaService.render({
        line_art: lineArt,
        pose_data: chosenPose,
        prompt: prompt,
        output_dir: outputDir,
      });

      // 3. 결과 저장 및 상태 변경: 완료
      renderJob.status = 'completed';
      renderJob.outputImageUrl = renderResult.outputImage;
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(RedisKeys.renderJobStatus(jobId), 'completed', this.STATUS_TTL);

      this.logger.log(`Render job ${jobId} completed successfully`);
      return renderResult;
    } catch (error) {
      this.logger.error(`Render job ${jobId} failed: ${error.message}`, error.stack);
      
      renderJob.status = 'failed';
      await this.renderJobRepository.save(renderJob);
      await this.redisService.set(RedisKeys.renderJobStatus(jobId), 'failed', this.STATUS_TTL);
      
      throw error;
    }
  }
}
