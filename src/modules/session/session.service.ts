import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../../entities/session.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SessionService {
  private readonly CACHE_TTL = 3600; // 1시간

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly redisService: RedisService,
  ) {}

  async create(lineArtUrl?: string) {
    const session = this.sessionRepository.create({
      lineArtUrl: lineArtUrl ?? 'line.png',
      history: [{ timestamp: new Date().toISOString(), action: 'session.created' }],
    });

    const saved = await this.sessionRepository.save(session);
    
    // 캐시 저장
    await this.redisService.set(RedisKeys.sessionCache(saved.id), saved, this.CACHE_TTL);
    
    return saved;
  }

  async findById(id: string) {
    // 캐시 확인
    const cached = await this.redisService.get<Session>(RedisKeys.sessionCache(id));
    if (cached) {
      return cached;
    }

    // DB 조회
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (session) {
      await this.redisService.set(RedisKeys.sessionCache(id), session, this.CACHE_TTL);
    }

    return session;
  }

  async appendHistory(id: string, action: string) {
    const session = await this.findById(id);
    if (!session) {
      return null;
    }

    session.history.push({ timestamp: new Date().toISOString(), action });
    const updated = await this.sessionRepository.save(session);

    // 캐시 갱신
    await this.redisService.set(RedisKeys.sessionCache(id), updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(id: string) {
    await this.redisService.del(RedisKeys.sessionCache(id));
  }
}
