import { RenderProgressSnapshot } from './render-job.types';

export const RENDER_PROGRESS = {
  queued: {
    progress: 5,
    phase: 'queued',
    message: '렌더링 작업이 대기열에 등록되었습니다.',
  },
  retrying: {
    progress: 5,
    phase: 'queued',
    message: '이미지 생성을 다시 시도하기 위해 대기 중입니다.',
  },
  preparing: {
    progress: 15,
    phase: 'preparing',
    message: '렌더링 입력을 준비하고 있습니다.',
  },
  generating: {
    progress: 35,
    phase: 'generating',
    message: 'AI가 이미지를 생성하고 있습니다.',
  },
  uploading: {
    progress: 90,
    phase: 'uploading',
    message: '생성된 이미지를 저장하고 있습니다.',
  },
  completed: {
    progress: 100,
    phase: 'completed',
    message: '이미지 생성이 완료되었습니다.',
  },
  failed: {
    progress: -1,
    phase: 'failed',
    message: '이미지 생성에 실패했습니다.',
  },
  quotaExceeded: {
    progress: -1,
    phase: 'failed',
    message: '이미지 생성 한도가 소진되었습니다.',
  },
} as const satisfies Record<string, RenderProgressSnapshot>;

export function fallbackRenderProgress(status: string): RenderProgressSnapshot {
  if (status === 'completed') return RENDER_PROGRESS.completed;
  if (status === 'quota_exceeded') return RENDER_PROGRESS.quotaExceeded;
  if (status === 'failed') return RENDER_PROGRESS.failed;
  if (status === 'pending') return RENDER_PROGRESS.queued;
  return RENDER_PROGRESS.generating;
}
