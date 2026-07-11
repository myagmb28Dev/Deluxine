import type {
  RenderModelId,
  RenderModelListResponse,
} from '../types/api';

export const selectCatalogModel = (
  catalog: RenderModelListResponse,
  current: RenderModelId | null,
): RenderModelId | null => {
  if (current && catalog.models.some((model) => model.id === current)) {
    return current;
  }

  if (catalog.models.some((model) => model.id === catalog.default_model)) {
    return catalog.default_model;
  }

  return catalog.models[0]?.id ?? null;
};

export const normalizeApiMessage = (
  value: unknown,
  fallback: string,
): string => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const messages = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (messages.length > 0) return messages.join(' ');
  }

  return fallback;
};

export const getRenderUsageRatio = (usage: {
  used: number;
  limit: number;
}): number => {
  if (usage.limit <= 0) return 0;
  return Math.min(1, Math.max(0, usage.used / usage.limit));
};

export const isRenderUsageExhausted = (
  usage: { remaining: number } | null,
): boolean => usage !== null && usage.remaining <= 0;
