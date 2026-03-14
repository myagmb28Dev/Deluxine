import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RenderJob } from '../../entities/render-job.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);
  private readonly STATUS_TTL = 7200; // 2시간

  private getRenderPublicDirectory(userId: string, sessionId: string) {
    return `/uploads/users/${userId}/sessions/${sessionId}/renders`;
  }

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    private readonly redisService: RedisService,
    @InjectQueue('render')
    private readonly renderQueue: Queue,
  ) {}

  async render(input: { sessionId: string; userId: string; lineArt: string; chosenPose: any; prompt: string; history: Array<{ timestamp: string; action: string }> }) {
    const job = this.renderJobRepository.create({
      sessionId: input.sessionId,
      prompt: input.prompt,
      status: 'pending',
      metadata: {
        line_art: input.lineArt,
        chosen_pose: input.chosenPose,
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
      lineArt: input.lineArt,
      chosenPose: input.chosenPose,
      prompt: input.prompt,
      outputDir: this.getRenderPublicDirectory(input.userId, input.sessionId),
    }, {
      jobId: saved.id, // BullMQ 내에서도 고유 ID로 관리
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return {
      job_id: saved.id,
      status: 'pending',
      message: 'Render job has been enqueued successfully.',
      line_art: input.lineArt,
      chosen_pose: input.chosenPose,
      prompt_used: saved.prompt,
      history: input.history,
    };
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
