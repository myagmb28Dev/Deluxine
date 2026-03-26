import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { mkdir, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { Session } from '../../entities/session.entity';
import { Pose } from '../../entities/pose.entity';
import { RenderJob } from '../../entities/render-job.entity';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SessionService {
  private readonly CACHE_TTL = 3600; // 1시간

  private getSessionDirectory(userId: string, sessionId: string) {
    return join(process.cwd(), 'uploads', 'users', userId, 'sessions', sessionId);
  }

  private getSessionPublicPath(userId: string, sessionId: string) {
    return `/uploads/users/${userId}/sessions/${sessionId}`;
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
  ) {}

  async create(input: { userId: string; lineArtUrl?: string; title?: string }) {
    const session = this.sessionRepository.create({
      userId: input.userId,
      title: input.title?.trim() || null,
      lineArtUrl: input.lineArtUrl ?? 'line.png',
      history: [{ timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T'), action: 'session.created' }],
    });

    const saved = await this.sessionRepository.save(session);
    
    // 캐시 저장
    await this.redisService.set(RedisKeys.sessionCache(saved.id), saved, this.CACHE_TTL);
    
    return saved;
  }

  async attachLineArtFile(session: Session, file: Express.Multer.File) {
    if (!session.userId) {
      return session;
    }

    const sessionDirectory = this.getSessionDirectory(session.userId, session.id);
    await mkdir(sessionDirectory, { recursive: true });

    const fileExtension = extname(file.originalname || '') || '.png';
    const fileName = `line-art${fileExtension}`;
    const filePath = join(sessionDirectory, fileName);

    await writeFile(filePath, file.buffer);

    session.lineArtUrl = `${this.getSessionPublicPath(session.userId, session.id)}/${fileName}`;
    const toKSTISO = () => new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00');
    session.history.push({ timestamp: toKSTISO(), action: 'session.line_art_uploaded' });

    const updated = await this.sessionRepository.save(session);
    await this.redisService.set(RedisKeys.sessionCache(session.id), updated, this.CACHE_TTL);

    return updated;
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

    session.history.push({ timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T'), action: 'session.updated' });
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

    if (session.userId) {
      const sessionDirectory = this.getSessionDirectory(session.userId, id);
      await rm(sessionDirectory, { recursive: true, force: true });
    }

    await this.invalidateCache(id);
    return true;
  }

  async appendHistory(id: string, action: string) {
    const session = await this.findById(id);
    if (!session) {
      return null;
    }

    session.history.push({ timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T'), action });
    const updated = await this.sessionRepository.save(session);

    // 캐시 갱신
    await this.redisService.set(RedisKeys.sessionCache(id), updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(id: string) {
    await this.redisService.del(RedisKeys.sessionCache(id));
  }
}
