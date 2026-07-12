export enum RenderModel {
  GEMINI_3_1_FLASH_LITE_IMAGE = 'google/gemini-3.1-flash-lite-image',
  GEMINI_3_1_FLASH_IMAGE = 'google/gemini-3.1-flash-image',
  GEMINI_3_PRO_IMAGE = 'google/gemini-3-pro-image',
}

export const DEFAULT_RENDER_MODEL = RenderModel.GEMINI_3_1_FLASH_IMAGE;

export const RENDER_USER_USAGE_POLICY = {
  requests_per_day: 2,
  scope: 'user',
  remaining_requests_available: true,
} as const;

export const RENDER_MODEL_OPTIONS = [
  {
    id: RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
    name: 'Nano Banana 2 Lite',
    tier: 'value',
    pricing: 'payg',
    description: '빠르고 비용 효율적인 이미지 생성 모델',
  },
  {
    id: RenderModel.GEMINI_3_1_FLASH_IMAGE,
    name: 'Nano Banana 2',
    tier: 'balanced',
    pricing: 'payg',
    description: '품질과 속도의 균형이 좋은 기본 모델',
  },
  {
    id: RenderModel.GEMINI_3_PRO_IMAGE,
    name: 'Nano Banana Pro',
    tier: 'premium',
    pricing: 'payg',
    description: '복잡한 편집에 적합한 최고 품질 모델',
  },
] as const;
