import type { RenderHistoryItem } from '../types/api';

export const mergeRenderHistory = (
  current: RenderHistoryItem[],
  incoming: RenderHistoryItem[],
) => {
  const seen = new Set(current.map((item) => item.job_id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.job_id)) return false;
      seen.add(item.job_id);
      return true;
    }),
  ];
};

export const removeRenderHistoryItem = (items: RenderHistoryItem[], jobId: string) =>
  items.filter((item) => item.job_id !== jobId);
