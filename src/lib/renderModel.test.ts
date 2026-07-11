import { describe, expect, test } from 'bun:test';
import type { RenderModelListResponse } from '../types/api';
import {
  getRenderUsageRatio,
  isRenderUsageExhausted,
  normalizeApiMessage,
  selectCatalogModel,
} from './renderModel';

const catalog: RenderModelListResponse = {
  default_model: 'black-forest-labs/flux.2-pro:free',
  models: [
    {
      id: 'black-forest-labs/flux.2-pro:free',
      name: 'FLUX.2 Pro',
      tier: 'balanced',
      pricing: 'free',
      description: 'Balanced quality and speed.',
    },
    {
      id: 'bytedance-seed/seedream-4.5:free',
      name: 'Seedream 4.5',
      tier: 'value',
      pricing: 'free',
      description: 'Strong spatial consistency.',
    },
  ],
  usage_policy: {
    requests_per_day: 2,
    scope: 'user',
    remaining_requests_available: true,
  },
};

describe('selectCatalogModel', () => {
  test('selects the backend default when there is no current selection', () => {
    expect(selectCatalogModel(catalog, null)).toBe(catalog.default_model);
  });

  test('preserves a current selection that still exists in the catalog', () => {
    expect(selectCatalogModel(catalog, 'bytedance-seed/seedream-4.5:free')).toBe(
      'bytedance-seed/seedream-4.5:free',
    );
  });

  test('replaces an unsupported current selection with the backend default', () => {
    expect(
      selectCatalogModel(
        catalog,
        'sourceful/riverflow-v2.5-pro:free',
      ),
    ).toBe(catalog.default_model);
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
