export type ActiveRenderStatus = 'pending' | 'running';

export const estimateRenderProgress = (
  status: ActiveRenderStatus,
  elapsedMs: number,
  currentProgress: number,
) => {
  const safeElapsed = Math.max(0, elapsedMs);
  const estimated = status === 'pending'
    ? 8 + 12 * Math.min(safeElapsed / 60_000, 1)
    : 20 + 70 * Math.min(safeElapsed / 120_000, 1);

  return Math.max(currentProgress, Math.round(estimated));
};
