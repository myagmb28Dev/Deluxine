import { Controller, Sse, Param, MessageEvent } from '@nestjs/common';
import { Observable, interval, map, switchMap, filter, distinctUntilChanged } from 'rxjs';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

type EventStatus = 'pending' | 'generating' | 'completed' | 'failed';

const isPoseId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

@Controller('sessions/:sessionId/events')
export class SessionEventsController {
  constructor(private readonly redisService: RedisService) {}

  @Sse()
  stream(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    return interval(1000).pipe(
      switchMap(async () => {
        const rawStatus = await this.redisService.get<string>(RedisKeys.sessionCurrentPose(sessionId));
        const progress = await this.redisService.get<number>(RedisKeys.poseProgress(sessionId));

        let status: EventStatus | null = null;
        let pose_id: string | undefined;

        if (rawStatus === 'pending' || rawStatus === 'generating' || rawStatus === 'failed') {
          status = rawStatus;
        } else if (rawStatus && isPoseId(rawStatus)) {
          status = 'completed';
          pose_id = rawStatus;
        }

        return JSON.stringify({
          status,
          progress: status === 'completed' ? 100 : (progress ?? 0),
          pose_id,
        });
      }),
      distinctUntilChanged(),
      map((json) => {
        const data = JSON.parse(json);
        return {
          data: {
            sessionId,
            status: data.status,
            progress: data.progress ?? 0,
            ...(data.pose_id ? { pose_id: data.pose_id } : {}),
            timestamp: new Date().toISOString(),
          },
        };
      }),
      filter((evt) => !!evt.data.status),
    );
  }
}
