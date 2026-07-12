import { describe, expect, test } from 'bun:test';
import type { RenderModelId, RenderModelListResponse } from '../types/api';
import {
  getRenderUsageRatio,
  isRenderUsageExhausted,
  normalizeApiMessage,
  selectCatalogModel,
} from './renderModel';

const catalog: RenderModelListResponse = {
  default_model: 'google/gemini-3.1-flash-image',
  models: [
    {
      id: 'google/gemini-3.1-flash-lite-image',
      name: 'Nano Banana 2 Lite',
      tier: 'value',
      pricing: 'payg',
      description: '빠르고 비용 효율적인 이미지 생성 모델',
    },
    {
      id: 'google/gemini-3.1-flash-image',
      name: 'Nano Banana 2',
      tier: 'balanced',
      pricing: 'payg',
      description: '품질과 속도의 균형이 좋은 기본 모델',
    },
    {
      id: 'google/gemini-3-pro-image',
      name: 'Nano Banana Pro',
      tier: 'premium',
      pricing: 'payg',
      description: '복잡한 편집에 적합한 최고 품질 모델',
    },
  ],
  usage_policy: {
    requests_per_day: 2,
    scope: 'user',
    remaining_requests_available: true,
  },
};

describe('selectCatalogModel', () => {
  test('selects Nano Banana 2 when there is no current selection', () => {
    expect(selectCatalogModel(catalog, null)).toBe(
      'google/gemini-3.1-flash-image',
    );
  });

  test('preserves a current Nano Banana selection that exists in the catalog', () => {
    expect(
      selectCatalogModel(catalog, 'google/gemini-3-pro-image'),
    ).toBe('google/gemini-3-pro-image');
  });

  test('replaces a persisted legacy selection with the backend default', () => {
    expect(
      selectCatalogModel(
        catalog,
        'bytedance-seed/seedream-4.5:free' as RenderModelId,
      ),
    ).toBe('google/gemini-3.1-flash-image');
  });

  test('returns null when the backend catalog is empty', () => {
    expect(selectCatalogModel({ ...catalog, models: [] }, null)).toBeNull();
  });
});

describe('normalizeApiMessage', () => {
  test('returns a non-empty string message', () => {
    expect(normalizeApiMessage('Session not found', 'Fallback')).toBe(
      'Session not found',
    );
  });

  test('joins a message array into readable text', () => {
    expect(normalizeApiMessage(['Invalid model', 'Try again'], 'Fallback')).toBe(
      'Invalid model Try again',
    );
  });

  test('uses the fallback for empty or unsupported values', () => {
    expect(normalizeApiMessage([], 'Fallback')).toBe('Fallback');
    expect(normalizeApiMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});

describe('render usage', () => {
  test('calculates a clamped daily usage ratio', () => {
    expect(getRenderUsageRatio({ used: 1, limit: 2 })).toBe(0.5);
    expect(getRenderUsageRatio({ used: 3, limit: 2 })).toBe(1);
    expect(getRenderUsageRatio({ used: -1, limit: 2 })).toBe(0);
  });

  test('treats zero remaining requests as exhausted', () => {
    expect(isRenderUsageExhausted({ remaining: 0 })).toBe(true);
    expect(isRenderUsageExhausted({ remaining: 1 })).toBe(false);
    expect(isRenderUsageExhausted(null)).toBe(false);
  });
});
