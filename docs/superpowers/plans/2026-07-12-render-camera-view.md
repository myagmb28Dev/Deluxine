# 렌더링 카메라 시점 전달 구현 계획

> **에이전트 작업자 필수 하위 스킬:** 이 계획을 작업별로 구현할 때 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용한다. 진행 상태는 체크박스(`- [ ]`)로 추적한다.

**목표:** 선택적인 카메라 방위각·고도각을 렌더링 요청에서 OpenRouter 프롬프트까지 전달해 결과물의 정면 구도 편향을 줄인다.

**구조:** `CreateRenderDto`에 검증되는 중첩 `cameraView` 객체를 추가하고, 기존 렌더링 타입을 통해 컨트롤러·서비스·BullMQ 워커·OpenRouter 서비스까지 값을 그대로 전달한다. 카메라 값과 포즈 투영 이미지가 모두 있을 때만 시점 보존 문장을 프롬프트에 추가한다.

**기술 스택:** NestJS 11, TypeScript 5.7, class-validator, class-transformer, BullMQ, Jest 30

## 전체 제약 조건

- 프론트엔드 코드는 수정하지 않는다.
- `cameraView`는 선택 필드이며 기존 요청 계약을 깨지 않는다.
- `azimuthDegrees` 범위는 `-180 ~ 180`, `elevationDegrees` 범위는 `-90 ~ 90`이다.
- 두 값은 유한한 숫자여야 하며 객체가 제공되면 둘 다 필수다.
- 카메라 지시는 `poseProjectionImage`가 함께 있을 때만 프롬프트에 추가한다.
- DB 스키마, 사용량 제한, 재시도, 오류 처리, R2 저장 방식은 변경하지 않는다.
- 백엔드 검증 후 프론트 연동 설계 문서를 별도로 작성한다.

---

## 파일 구성

- 생성: `src/modules/render/dto/render-camera-view.dto.ts` — 카메라 각도 검증 DTO
- 생성: `src/modules/render/dto/create-render.dto.spec.ts` — 중첩 DTO 유효성 테스트
- 수정: `src/modules/render/dto/create-render.dto.ts` — 선택적 `cameraView` 계약
- 수정: `src/modules/render/render-job.types.ts` — 공용 `RenderCameraView`와 전달 타입
- 수정: `src/modules/render/render.controller.ts` — 서비스 입력 전달
- 수정: `src/modules/render/render.controller.spec.ts` — 컨트롤러 전달 회귀 테스트
- 수정: `src/modules/render/render.service.ts` — metadata와 큐 페이로드 저장
- 수정: `src/modules/render/render.service.spec.ts` — 서비스 전달 회귀 테스트
- 수정: `src/modules/render/render.processor.ts` — OpenRouter 요청 전달
- 수정: `src/modules/render/render.processor.spec.ts` — 워커 전달 회귀 테스트
- 수정: `src/modules/render/openrouter-image.service.ts` — 카메라 시점 프롬프트
- 수정: `src/modules/render/openrouter-image.service.spec.ts` — 프롬프트 조건 테스트
- 생성: `docs/FRONTEND_RENDER_CAMERA_VIEW_INTEGRATION.md` — 프론트 후속 설계 문서

### 작업 1: 카메라 시점 DTO 검증

**파일:**
- 생성: `src/modules/render/dto/render-camera-view.dto.ts`
- 생성: `src/modules/render/dto/create-render.dto.spec.ts`
- 수정: `src/modules/render/dto/create-render.dto.ts`

**인터페이스:**
- 제공: `RenderCameraViewDto { azimuthDegrees: number; elevationDegrees: number }`
- 제공: `CreateRenderDto.cameraView?: RenderCameraViewDto`

- [ ] **1단계: 중첩 카메라 값의 성공·실패 조건을 테스트로 작성한다**

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRenderDto } from './create-render.dto';

const validateDto = (cameraView: unknown) =>
  validate(
    plainToInstance(CreateRenderDto, {
      prompt: '',
      cameraView,
    }),
  );

it('accepts a valid camera viewpoint', async () => {
  await expect(
    validateDto({ azimuthDegrees: 38, elevationDegrees: 12 }),
  ).resolves.toHaveLength(0);
});

it.each([
  [{ elevationDegrees: 12 }],
  [{ azimuthDegrees: 38 }],
  [{ azimuthDegrees: '38', elevationDegrees: 12 }],
  [{ azimuthDegrees: Number.NaN, elevationDegrees: 12 }],
  [{ azimuthDegrees: 181, elevationDegrees: 12 }],
  [{ azimuthDegrees: 38, elevationDegrees: 91 }],
])('rejects an invalid camera viewpoint: %o', async (cameraView) => {
  expect(await validateDto(cameraView)).not.toHaveLength(0);
});
```

- [ ] **2단계: 테스트가 새 계약 부재로 실패하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/dto/create-render.dto.spec.ts`

예상: 잘못된 `cameraView`가 검증되지 않아 실패하거나 새 DTO 타입이 없어 컴파일 FAIL.

- [ ] **3단계: 카메라 DTO와 중첩 검증을 최소 구현한다**

```ts
export class RenderCameraViewDto {
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  azimuthDegrees: number;

  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  elevationDegrees: number;
}
```

`CreateRenderDto`에는 다음 필드를 추가한다.

```ts
@ApiPropertyOptional({ type: RenderCameraViewDto })
@IsOptional()
@ValidateNested()
@Type(() => RenderCameraViewDto)
cameraView?: RenderCameraViewDto;
```

- [ ] **4단계: DTO 테스트를 다시 실행한다**

실행: `bun run test -- --runInBand modules/render/dto/create-render.dto.spec.ts`

예상: PASS.

### 작업 2: 컨트롤러·큐·워커 전달

**파일:**
- 수정: `src/modules/render/render-job.types.ts`
- 수정: `src/modules/render/render.controller.ts`
- 수정: `src/modules/render/render.controller.spec.ts`
- 수정: `src/modules/render/render.service.ts`
- 수정: `src/modules/render/render.service.spec.ts`
- 수정: `src/modules/render/render.processor.ts`
- 수정: `src/modules/render/render.processor.spec.ts`

**인터페이스:**
- 제공: `RenderCameraView`
- 소비: 작업 1의 `CreateRenderDto.cameraView`
- 제공: `CreateRenderJobInput.cameraView?`, `RenderQueuePayload.cameraView?`

- [ ] **1단계: 각 경계에서 동일한 카메라 값이 전달되는 실패 테스트를 추가한다**

컨트롤러 테스트:

```ts
expect(renderService.render).toHaveBeenCalledWith(
  expect.objectContaining({
    cameraView: { azimuthDegrees: 38, elevationDegrees: 12 },
  }),
);
```

서비스 테스트:

```ts
expect(repository.create).toHaveBeenCalledWith(
  expect.objectContaining({
    metadata: expect.objectContaining({
      camera_view: { azimuthDegrees: 38, elevationDegrees: 12 },
    }),
  }),
);
expect(renderQueue.add).toHaveBeenCalledWith(
  'process-render',
  expect.objectContaining({
    cameraView: { azimuthDegrees: 38, elevationDegrees: 12 },
  }),
  expect.any(Object),
);
```

워커 테스트:

```ts
expect(openRouterImageService.render).toHaveBeenCalledWith(
  expect.objectContaining({
    cameraView: { azimuthDegrees: 38, elevationDegrees: 12 },
  }),
);
```

- [ ] **2단계: 전달 테스트가 기존 구현에서 실패하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/render.controller.spec.ts modules/render/render.service.spec.ts modules/render/render.processor.spec.ts`

예상: 각 경계에서 `cameraView` 또는 `camera_view`가 없어 FAIL.

- [ ] **3단계: 공용 타입과 전달 경로를 최소 구현한다**

```ts
export interface RenderCameraView {
  azimuthDegrees: number;
  elevationDegrees: number;
}
```

`cameraView?: RenderCameraView`를 큐 페이로드와 OpenRouter 요청에 추가하고 다음 위치에서 값만 전달한다.

```ts
cameraView: dto.cameraView,
camera_view: input.cameraView,
cameraView: input.cameraView,
cameraView,
```

- [ ] **4단계: 전달 테스트를 다시 실행한다**

실행: `bun run test -- --runInBand modules/render/render.controller.spec.ts modules/render/render.service.spec.ts modules/render/render.processor.spec.ts`

예상: PASS.

### 작업 3: OpenRouter 카메라 시점 프롬프트

**파일:**
- 수정: `src/modules/render/openrouter-image.service.ts`
- 수정: `src/modules/render/openrouter-image.service.spec.ts`

**인터페이스:**
- 소비: `OpenRouterRenderRequest.cameraView?: RenderCameraView`
- 제공: 포즈 이미지와 카메라 값이 함께 있을 때 시점 보존 문장이 포함된 prompt

- [ ] **1단계: 카메라 프롬프트의 포함·미포함 조건을 실패 테스트로 추가한다**

```ts
expect(payload.prompt).toContain(
  'Preserve the target camera viewpoint from the pose projection image.',
);
expect(payload.prompt).toContain('Horizontal camera azimuth: 38 degrees.');
expect(payload.prompt).toContain('Vertical camera elevation: 12 degrees.');
expect(payload.prompt).toContain(
  'Do not normalize or rotate the character to a front-facing view.',
);
```

별도 요청에서 `cameraView`를 제거하고 다음을 검증한다.

```ts
expect(payload.prompt).not.toContain('Horizontal camera azimuth:');
expect(payload.prompt).not.toContain('Vertical camera elevation:');
```

- [ ] **2단계: 새 프롬프트 테스트가 실패하는지 확인한다**

실행: `bun run test -- --runInBand modules/render/openrouter-image.service.spec.ts`

예상: 각도 및 정면 보정 금지 문장이 없어 FAIL.

- [ ] **3단계: 포즈 이미지와 카메라 값이 함께 있을 때만 문장을 추가한다**

```ts
const cameraInstruction =
  request.poseProjectionImage && request.cameraView
    ? [
        'Preserve the target camera viewpoint from the pose projection image.',
        `Horizontal camera azimuth: ${request.cameraView.azimuthDegrees} degrees.`,
        `Vertical camera elevation: ${request.cameraView.elevationDegrees} degrees.`,
        'Do not normalize or rotate the character to a front-facing view.',
        'Ignore the camera viewpoint of the source line art; use it only for character design.',
      ].join(' ')
    : '';
```

`cameraInstruction`을 기존 pose instruction 뒤에 추가한다.

- [ ] **4단계: OpenRouter 서비스 테스트를 다시 실행한다**

실행: `bun run test -- --runInBand modules/render/openrouter-image.service.spec.ts`

예상: PASS.

### 작업 4: 전체 검증과 프론트 후속 설계 문서

**파일:**
- 생성: `docs/FRONTEND_RENDER_CAMERA_VIEW_INTEGRATION.md`

**인터페이스:**
- 소비: 최종 백엔드 `cameraView` 계약
- 제공: 프론트 개발자가 구현할 카메라 각도 계산과 요청 전달 설계

- [ ] **1단계: 백엔드 전체 테스트와 빌드를 실행한다**

실행: `bun run test -- --runInBand`

예상: 전체 PASS.

실행: `bun run build`

예상: 종료 코드 0.

- [ ] **2단계: 프론트 연동 설계 문서를 작성한다**

문서에는 다음을 정확히 포함한다.

- 프론트 코드는 이번 작업에서 수정되지 않았다는 범위
- Three.js 카메라 위치에서 OrbitControls target을 뺀 방향 벡터로 방위각·고도각을 계산하는 공식
- 각도를 degree로 변환하고 허용 범위에 맞추는 방법
- `capturePoseProjection()` 결과와 `cameraView`를 동일 요청에 담는 타입과 JSON 예시
- 기존 클라이언트 호환성 및 실패 시 `cameraView` 생략 규칙
- 단위 테스트와 실제 3/4·측면 시점 확인 항목

- [ ] **3단계: 문서와 코드 변경 검사를 실행한다**

실행: `git diff --check`

예상: 출력 없음, 종료 코드 0.
