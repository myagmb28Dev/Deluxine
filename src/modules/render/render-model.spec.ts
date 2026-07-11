import {
  DEFAULT_RENDER_MODEL,
  RENDER_MODEL_OPTIONS,
  RENDER_USER_USAGE_POLICY,
} from './render-model';

describe('render model catalog', () => {
  it('exposes the selected OpenRouter image models in value, balanced, premium order', () => {
    const modelIds = RENDER_MODEL_OPTIONS.map((model) => model.id);

    expect(DEFAULT_RENDER_MODEL).toBe('black-forest-labs/flux.2-pro');
    expect(modelIds).toEqual([
      'bytedance-seed/seedream-4.5',
      'black-forest-labs/flux.2-pro',
      'sourceful/riverflow-v2.5-pro',
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
      '저렴하고 일관성 좋은 이미지 편집 모델',
      '품질과 속도의 균형이 좋은 기본 모델',
      '복잡한 편집에 적합한 고품질 모델',
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
