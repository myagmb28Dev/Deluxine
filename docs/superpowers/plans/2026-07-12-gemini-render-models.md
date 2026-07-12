# Gemini 렌더링 모델 교체 구현 계획

> **에이전트 작업자 필수 하위 스킬:** 이 계획을 작업별로 구현할 때 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용한다. 진행 상태는 체크박스(`- [ ]`)로 추적한다.

**목표:** OpenRouter 이미지 렌더링 모델 3종을 Nano Banana 2 Lite, Nano Banana 2, Nano Banana Pro로 교체한다.

**구조:** 기존 `RenderModel` enum과 `RENDER_MODEL_OPTIONS`를 모델 카탈로그의 단일 진실 공급원으로 유지한다. 렌더링 DTO, 큐 페이로드, 사용량 제한 및 `/images` 전송 구조는 그대로 두고, Gemini 모델에서는 포즈 투영 이미지를 선화보다 먼저 배치한다.

**기술 스택:** NestJS 11, TypeScript 5.7, Jest 30, OpenRouter Images API, BullMQ

## 전체 제약 조건

- 모델은 `google/gemini-3.1-flash-lite-image`, `google/gemini-3.1-flash-image`, `google/gemini-3-pro-image`만 노출한다.
- 기본 모델은 `google/gemini-3.1-flash-image`다.
- `value` / `balanced` / `premium` 등급과 `payg` 과금 표시는 유지한다.
- 기존 API 계약, 일일 2회 제한, Redis, BullMQ, R2 및 OpenRouter `/images` 전송 방식은 변경하지 않는다.
- 실제 유료 추론 호출은 검증 범위에서 제외한다.

---

## 파일 구성

- 수정: `src/modules/render/render-model.ts` — 모델 enum, 기본값, 사용자 노출 카탈로그
- 수정: `src/modules/render/render-model.spec.ts` — 모델 ID, 순서, 기본값 회귀 테스트
- 수정: `src/modules/render/openrouter-image.service.ts` — Gemini 참조 이미지 우선순위
- 수정: `src/modules/render/openrouter-image.service.spec.ts` — 모델 전달과 포즈 우선순위 테스트
- 수정: `src/modules/render/render.service.spec.ts` — 새 enum을 사용하는 서비스 계약 테스트
- 수정: `src/modules/render/render.processor.spec.ts` — 새 enum을 사용하는 워커 계약 테스트
- 수정: `README.md` — 모델 목록, 요청 예시, 기본값 안내

### 작업 1: Gemini 모델 카탈로그로 교체

**파일:**
- 수정: `src/modules/render/render-model.spec.ts`
- 수정: `src/modules/render/render-model.ts`
- 수정: `src/modules/render/render.service.spec.ts`
- 수정: `src/modules/render/render.processor.spec.ts`

**인터페이스:**
- 제공: `RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE`, `RenderModel.GEMINI_3_1_FLASH_IMAGE`, `RenderModel.GEMINI_3_PRO_IMAGE`
- 제공: `DEFAULT_RENDER_MODEL = RenderModel.GEMINI_3_1_FLASH_IMAGE`
- 소비: 렌더링 DTO, 서비스, 큐 페이로드가 기존 `RenderModel` 타입을 그대로 사용한다.

- [ ] **1단계: 새 카탈로그를 요구하도록 테스트를 먼저 변경한다**

```ts
expect(DEFAULT_RENDER_MODEL).toBe('google/gemini-3.1-flash-image');
expect(RENDER_MODEL_OPTIONS.map((model) => model.id)).toEqual([
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3.1-flash-image',
  'google/gemini-3-pro-image',
]);
expect(RENDER_MODEL_OPTIONS.map((model) => model.name)).toEqual([
  'Nano Banana 2 Lite',
  'Nano Banana 2',
  'Nano Banana Pro',
]);
```

- [ ] **2단계: 변경한 테스트가 기존 구현에서 실패하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/render-model.spec.ts`

예상: 기존 기본값 `black-forest-labs/flux.2-pro`와 기존 모델 ID 3개가 반환되어 FAIL.

- [ ] **3단계: 모델 enum과 카탈로그를 최소 변경한다**

```ts
export enum RenderModel {
  GEMINI_3_1_FLASH_LITE_IMAGE = 'google/gemini-3.1-flash-lite-image',
  GEMINI_3_1_FLASH_IMAGE = 'google/gemini-3.1-flash-image',
  GEMINI_3_PRO_IMAGE = 'google/gemini-3-pro-image',
}

export const DEFAULT_RENDER_MODEL = RenderModel.GEMINI_3_1_FLASH_IMAGE;
```

`RENDER_MODEL_OPTIONS`는 위 순서대로 표시 이름을 `Nano Banana 2 Lite`, `Nano Banana 2`, `Nano Banana Pro`로 설정하고 등급과 `pricing: 'payg'`는 유지한다. 설명은 각각 비용 효율, 품질과 속도의 균형, 최고 품질 용도를 한국어로 작성한다.

- [ ] **4단계: 서비스 및 워커 테스트의 제거된 enum 참조를 새 enum으로 교체한다**

모델 선택을 검증하는 서비스 테스트에는 `RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE`를 사용하고, 워커 페이로드에는 `RenderModel.GEMINI_3_1_FLASH_IMAGE`를 사용한다. 테스트의 의미와 assertion 구조는 변경하지 않는다.

- [ ] **5단계: 관련 테스트가 통과하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/render-model.spec.ts modules/render/render.service.spec.ts modules/render/render.processor.spec.ts`

예상: 3개 테스트 파일 모두 PASS.

- [ ] **6단계: 카탈로그 변경을 커밋한다**

```powershell
git add src/modules/render/render-model.ts src/modules/render/render-model.spec.ts src/modules/render/render.service.spec.ts src/modules/render/render.processor.spec.ts
git commit -m "feat: replace render catalog with Gemini models"
```

### 작업 2: 모든 Gemini 모델에서 포즈 참조를 우선 처리

**파일:**
- 수정: `src/modules/render/openrouter-image.service.spec.ts`
- 수정: `src/modules/render/openrouter-image.service.ts`

**인터페이스:**
- 소비: 작업 1의 `RenderModel` enum 3종
- 제공: 포즈 투영 이미지가 있으면 `referenceStrategy()`가 모든 지원 모델에 대해 `pose_first`를 반환한다.

- [ ] **1단계: Gemini 모델 3종의 참조 순서를 검증하는 실패 테스트를 작성한다**

```ts
it.each([
  RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
  RenderModel.GEMINI_3_1_FLASH_IMAGE,
  RenderModel.GEMINI_3_PRO_IMAGE,
])('prioritizes the pose reference for %s', async (model) => {
  post.mockReturnValue(of({ data: { data: [{ b64_json: 'generated-image' }] } }));

  const result = await service.render({ ...request, model });
  const payload = post.mock.calls[0][1] as {
    input_references: Array<{ image_url: { url: string } }>;
  };

  expect(payload.input_references.map((item) => item.image_url.url)).toEqual([
    'data:image/png;base64,pose-base64',
    'https://cdn.example.com/line-art.png',
  ]);
  expect(result.referenceStrategy).toBe('pose_first');
});
```

기본 요청 모델과 payload assertion도 새 Gemini enum을 사용하도록 변경한다.

- [ ] **2단계: 테스트가 일부 Gemini 모델에서 실패하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/openrouter-image.service.spec.ts`

예상: 기존 Seedream 전용 조건 때문에 Gemini 모델이 `line_art_first`를 반환하여 FAIL.

- [ ] **3단계: 참조 전략을 단순화한다**

```ts
private referenceStrategy(
  request: OpenRouterRenderRequest,
): OpenRouterRenderResult['referenceStrategy'] {
  if (!request.poseProjectionImage) return 'line_art_only';
  return 'pose_first';
}
```

- [ ] **4단계: OpenRouter 서비스 테스트를 다시 실행한다**

실행: `bun run test -- --runInBand modules/render/openrouter-image.service.spec.ts`

예상: 모든 테스트 PASS.

- [ ] **5단계: 참조 전략 변경을 커밋한다**

```powershell
git add src/modules/render/openrouter-image.service.ts src/modules/render/openrouter-image.service.spec.ts
git commit -m "feat: prioritize pose references for Gemini renders"
```

### 작업 3: README 동기화 및 전체 검증

**파일:**
- 수정: `README.md`

**인터페이스:**
- 소비: 작업 1의 모델 ID와 기본값
- 제공: 프론트엔드 및 API 사용자가 참고할 최신 모델 목록과 요청 예시

- [ ] **1단계: README의 모델 목록과 요청 예시를 변경한다**

```md
- `google/gemini-3.1-flash-lite-image` (value)
- `google/gemini-3.1-flash-image` (default, balanced)
- `google/gemini-3-pro-image` (premium)
```

JSON 요청 예시와 모델 생략 시 기본값 설명은 `google/gemini-3.1-flash-image`를 사용한다.

- [ ] **2단계: 제거된 모델 ID가 활성 코드와 문서에 남지 않았는지 확인한다**

실행: `rg -n "bytedance-seed/seedream-4.5|black-forest-labs/flux.2-pro|sourceful/riverflow-v2.5-pro|SEEDREAM_4_5|FLUX_2_PRO|RIVERFLOW_2_5_PRO" src README.md`

예상: 출력 없음, 종료 코드 1.

- [ ] **3단계: 전체 테스트와 빌드를 실행한다**

실행: `bun run test -- --runInBand`

예상: 전체 테스트 PASS.

실행: `bun run build`

예상: 종료 코드 0.

- [ ] **4단계: 문서 변경을 커밋한다**

```powershell
git add README.md
git commit -m "feat: document Gemini render model options"
```
