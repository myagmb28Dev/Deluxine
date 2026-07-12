import {
  DEFAULT_RENDER_MODEL,
  RENDER_MODEL_OPTIONS,
  RENDER_USER_USAGE_POLICY,
} from './render-model';

describe('render model catalog', () => {
  it('exposes the selected Gemini image models in value, balanced, premium order', () => {
    const modelIds = RENDER_MODEL_OPTIONS.map((model) => model.id);

    expect(DEFAULT_RENDER_MODEL).toBe('google/gemini-3.1-flash-image');
    expect(modelIds).toEqual([
      'google/gemini-3.1-flash-lite-image',
      'google/gemini-3.1-flash-image',
      'google/gemini-3-pro-image',
    ]);
    expect(RENDER_MODEL_OPTIONS.map((model) => model.name)).toEqual([
      'Nano Banana 2 Lite',
      'Nano Banana 2',
      'Nano Banana Pro',
    ]);
    expect(RENDER_MODEL_OPTIONS.map((model) => model.tier)).toEqual([
      'value',
      'balanced',
      'premium',
    ]);
    expect(
      RENDER_MODEL_OPTIONS.every((model) => model.pricing === 'payg'),
    ).toBe(true);
    expect(RENDER_MODEL_OPTIONS.map((model) => model.description)).toEqual([
      '빠르고 비용 효율적인 이미지 생성 모델',
      '품질과 속도의 균형이 좋은 기본 모델',
      '복잡한 편집에 적합한 최고 품질 모델',
    ]);
  });

  it('publishes the per-user render limit for the frontend', () => {
    expect(RENDER_USER_USAGE_POLICY).toEqual({
      requests_per_day: 2,
      scope: 'user',
      remaining_requests_available: true,
    });
  });
});
