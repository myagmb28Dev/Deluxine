import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RenderJob } from '../../entities/render-job.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { R2Service } from '../r2/r2.service';

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
    private readonly renderQueue: Queue,
  ) {}

  async render(input: {
    sessionId: string;
    userId: string;
    lineArtKey: string;
    chosenPose: any;
    prompt: string;
    poseProjectionImage?: string;
    history: Array<{ timestamp: string; action: string }>;
  }) {
    const job = this.renderJobRepository.create({
      sessionId: input.sessionId,
      prompt: input.prompt,
      status: 'pending',
      outputImageKey: null,
      outputImageUrl: null,
      metadata: {
        line_art_key: input.lineArtKey,
        chosen_pose: input.chosenPose,
        has_pose_projection_image: Boolean(input.poseProjectionImage),
        history: input.history,
      },
    });

    const saved = await this.renderJobRepository.save(job);
    await this.updateJobStatus(saved.id, 'pending');

    this.logger.log(`Enqueuing render job ${saved.id} for session ${input.sessionId}`);

    // 큐에 작업 추가 (비동기 처리)
    await this.renderQueue.add('process-render', {
      jobId: saved.id,
      sessionId: input.sessionId,
      userId: input.userId,
      lineArtKey: input.lineArtKey,
      chosenPose: input.chosenPose,
      prompt: input.prompt,
      poseProjectionImage: input.poseProjectionImage,
    }, {
      jobId: saved.id,
      attempts: 5, // 재시도 횟수 증가
      backoff: {
        type: 'exponential',
        delay: 10000, // 기본 대기 시간을 10초로 늘림 (429 대응)
      },
    });

    return {
      job_id: saved.id,
      status: 'pending',
      message: 'Render job has been enqueued successfully.',
      line_art_key: input.lineArtKey,
      chosen_pose: input.chosenPose,
      prompt_used: saved.prompt,
      history: input.history,
    };
  }

  async presignOutputGet(outputKey: string) {
    return (await this.r2Service.presignGet(outputKey)).url;
  }

  async updateJobStatus(jobId: string, status: string) {
    await this.redisService.set(RedisKeys.renderJobStatus(jobId), status, this.STATUS_TTL);
  }

  async getJobStatus(jobId: string): Promise<string | null> {
    return this.redisService.get<string>(RedisKeys.renderJobStatus(jobId));
  }

  async findJobById(jobId: string) {
    return this.renderJobRepository.findOne({ where: { id: jobId } });
  }
}
