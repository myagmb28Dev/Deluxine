import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Session } from '../../entities/session.entity';
import { Pose } from '../../entities/pose.entity';
import { RenderJob } from '../../entities/render-job.entity';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { R2Service } from '../r2/r2.service';

@Injectable()
export class SessionService {
  private readonly CACHE_TTL = 3600; // 1시간

  private toKSTISO() {
    return new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00');
  }

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Pose)
    private readonly poseRepository: Repository<Pose>,
    @InjectRepository(RenderJob)
    private readonly renderJobRepository: Repository<RenderJob>,
    @InjectQueue('render')
    private readonly renderQueue: Queue,
    private readonly redisService: RedisService,
    private readonly r2Service: R2Service,
  ) {}

  private buildLineArtKey(userId: string, sessionId: string, extension: string) {
    const ext = extension?.startsWith('.') ? extension : `.${extension || 'png'}`;
    return this.r2Service.buildKey(['users', userId, 'sessions', sessionId, `line-art-${randomUUID()}${ext}`]);
  }

  async create(input: { userId: string; title?: string }) {
    const session = this.sessionRepository.create({
      userId: input.userId,
      title: input.title?.trim() || null,
      lineArtKey: null,
      lineArtUrl: null,
      history: [{ timestamp: this.toKSTISO(), action: 'session.created' }],
    });

    const saved = await this.sessionRepository.save(session);
    
    // 캐시 저장
    await this.redisService.set(RedisKeys.sessionCache(saved.id), saved, this.CACHE_TTL);
    
    return saved;
  }

  async createLineArtPresign(input: {
    userId: string;
    title?: string;
    contentType?: string;
    originalFilename?: string;
  }) {
    const session = await this.create({ userId: input.userId, title: input.title });

    const extension = extname(input.originalFilename || '') || (input.contentType === 'image/jpeg' ? '.jpg' : '.png');
    session.lineArtKey = this.buildLineArtKey(input.userId, session.id, extension);
    session.history.push({ timestamp: this.toKSTISO(), action: 'session.line_art_presigned' });

    const updated = await this.sessionRepository.save(session);
    await this.redisService.set(RedisKeys.sessionCache(session.id), updated, this.CACHE_TTL);

    const upload = await this.r2Service.presignPut(updated.lineArtKey!, input.contentType);
    return { session: updated, upload };
  }

  async confirmLineArtUpload(sessionId: string, userId: string) {
    const session = await this.findById(sessionId, userId);
    if (!session) {
      return null;
    }
    if (!session.lineArtKey) {
      throw new Error('NO_LINE_ART_KEY');
    }

    await this.r2Service.headObject(session.lineArtKey);
    session.history.push({ timestamp: this.toKSTISO(), action: 'session.line_art_upload_confirmed' });

    const updated = await this.sessionRepository.save(session);
    await this.redisService.set(RedisKeys.sessionCache(sessionId), updated, this.CACHE_TTL);
    return updated;
  }

  async presentSession(session: Session) {
    const lineArtUrl = session.lineArtKey ? (await this.r2Service.presignGet(session.lineArtKey)).url : null;
    return { ...session, lineArtUrl };
  }

  async findById(id: string, userId?: string) {
    // 캐시 확인
    const cached = await this.redisService.get<Session>(RedisKeys.sessionCache(id));
    if (cached) {
      if (!userId || !cached.userId || cached.userId === userId) {
        return cached;
      }

      return null;
    }

    // DB 조회
    const where = userId
      ? [{ id, userId }, { id, userId: null }]
      : [{ id }];

    const session = await this.sessionRepository.findOne({ where: where as any });
    if (session) {
      await this.redisService.set(RedisKeys.sessionCache(id), session, this.CACHE_TTL);
    }

    return session;
  }

  async exists(id: string) {
    return this.sessionRepository.exists({ where: { id } });
  }

  async findByUser(userId: string, limit = 30) {
    return this.sessionRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async findSummaryByUser(userId: string, query: ListSessionsDto = {}) {
    const limit = Math.max(1, Math.min(query.limit ?? 30, 100));
    const sort = query.sort ?? 'updatedAt:desc';
    const [sortField, sortDirection] = sort.split(':') as ['updatedAt' | 'createdAt', 'asc' | 'desc'];

    const qb = this.sessionRepository
      .createQueryBuilder('session')
      .where('session.userId = :userId', { userId });

    if (query.q?.trim()) {
      qb.andWhere('session.title ILIKE :query', { query: `%${query.q.trim()}%` });
    }

    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf8')) as {
          value: string;
          id: string;
        };

        const operator = sortDirection === 'desc' ? '<' : '>';
        qb.andWhere(
          new Brackets((subQb) => {
            subQb
              .where(`session.${sortField} ${operator} :cursorValue`, { cursorValue: decoded.value })
              .orWhere(
                new Brackets((tieQb) => {
                  tieQb
                    .where(`session.${sortField} = :cursorValue`, { cursorValue: decoded.value })
                    .andWhere(`session.id ${operator} :cursorId`, { cursorId: decoded.id });
                }),
              );
          }),
        );
      } catch {
        // invalid cursor는 무시하고 첫 페이지로 처리
      }
    }

    qb.orderBy(`session.${sortField}`, sortDirection.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('session.id', sortDirection.toUpperCase() as 'ASC' | 'DESC')
      .take(limit + 1);

    const totalQb = this.sessionRepository
      .createQueryBuilder('session')
      .where('session.userId = :userId', { userId });

    if (query.q?.trim()) {
      totalQb.andWhere('session.title ILIKE :query', { query: `%${query.q.trim()}%` });
    }

    const [sessions, total] = await Promise.all([qb.getMany(), totalQb.getCount()]);
    const hasNext = sessions.length > limit;
    const items = sessions.slice(0, limit).map((session) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const toKSTString = (d: Date) => {
        const offsetDate = new Date(d.getTime() + (9 * 60 * 60 * 1000));
        return offsetDate.toISOString().replace('Z', '+09:00');
      };
      
      return {
        id: session.id,
        title: session.title,
        createdAt: toKSTString(session.createdAt),
        updatedAt: toKSTString(session.updatedAt),
      };
    });

    const last = sessions.slice(0, limit).at(-1);
    const nextCursor = hasNext && last
      ? Buffer.from(
          JSON.stringify({
            value: last[sortField] instanceof Date ? last[sortField].toISOString() : String(last[sortField]),
            id: last.id,
          }),
          'utf8',
        ).toString('base64')
      : null;

    return {
      items,
      nextCursor,
      total,
    };
  }

  async updateSession(id: string, userId: string, input: { title?: string }) {
    const session = await this.findById(id, userId);
    if (!session) {
      return null;
    }

    if (typeof input.title === 'string') {
      session.title = input.title.trim() || null;
    }

    session.history.push({ timestamp: this.toKSTISO(), action: 'session.updated' });
    const updated = await this.sessionRepository.save(session);
    await this.redisService.set(RedisKeys.sessionCache(id), updated, this.CACHE_TTL);

    return updated;
  }

  async deleteSession(id: string, userId: string) {
    const session = await this.findById(id, userId);
    if (!session) {
      return false;
    }

    const renderJobs = await this.renderJobRepository.find({ where: { sessionId: id } });
    for (const job of renderJobs) {
      const queuedJob = await this.renderQueue.getJob(job.id);
      if (queuedJob) {
        await queuedJob.remove();
      }
    }

    await this.poseRepository.delete({ sessionId: id });
    await this.renderJobRepository.delete({ sessionId: id });
    await this.sessionRepository.delete({ id });

    const keysToDelete: string[] = [];
    if (session.lineArtKey) {
      keysToDelete.push(session.lineArtKey);
    }
    for (const job of renderJobs) {
      if (job.outputImageKey) {
        keysToDelete.push(job.outputImageKey);
      }
    }
    await this.r2Service.deleteObjects(keysToDelete);

    await this.invalidateCache(id);
    return true;
  }

  async appendHistory(id: string, action: string) {
    const session = await this.findById(id);
    if (!session) {
      return null;
    }

    session.history.push({ timestamp: this.toKSTISO(), action });
    const updated = await this.sessionRepository.save(session);

    // 캐시 갱신
    await this.redisService.set(RedisKeys.sessionCache(id), updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(id: string) {
    await this.redisService.del(RedisKeys.sessionCache(id));
  }
}
