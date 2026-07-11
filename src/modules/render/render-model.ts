export enum RenderModel {
  SEEDREAM_4_5 = 'bytedance-seed/seedream-4.5',
  FLUX_2_PRO = 'black-forest-labs/flux.2-pro',
  RIVERFLOW_2_5_PRO = 'sourceful/riverflow-v2.5-pro',
}

export const DEFAULT_RENDER_MODEL = RenderModel.FLUX_2_PRO;

export const RENDER_USER_USAGE_POLICY = {
  requests_per_day: 2,
  scope: 'user',
  remaining_requests_available: true,
} as const;

export const RENDER_MODEL_OPTIONS = [
  {
    id: RenderModel.SEEDREAM_4_5,
    name: 'Seedream 4.5',
    tier: 'value',
    pricing: 'payg',
    description: '저렴하고 일관성 좋은 이미지 편집 모델',
  },
  {
    id: RenderModel.FLUX_2_PRO,
    name: 'FLUX.2 Pro',
    tier: 'balanced',
    pricing: 'payg',
    description: '품질과 속도의 균형이 좋은 기본 모델',
  },
  {
    id: RenderModel.RIVERFLOW_2_5_PRO,
    name: 'Riverflow V2.5 Pro',
    tier: 'premium',
    pricing: 'payg',
    description: '복잡한 편집에 적합한 고품질 모델',
  },
] as const;
