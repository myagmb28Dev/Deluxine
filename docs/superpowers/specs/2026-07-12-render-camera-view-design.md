# 렌더링 카메라 시점 전달 설계

## 목표

프론트엔드에서 계산한 카메라 방위각과 고도각을 선택적인 렌더링 요청 값으로 받아 OpenRouter 이미지 생성 프롬프트까지 전달한다. 포즈 투영 이미지의 카메라 시점을 원본 선화보다 우선하고, 이미지 모델이 결과물을 임의로 정면 구도로 보정하지 않도록 한다.

이번 구현은 백엔드만 수정한다. 프론트엔드 코드는 변경하지 않으며, 백엔드 구현이 끝난 뒤 별도의 프론트엔드 연동 설계 문서를 작성한다.

## API 계약

기존 `POST /sessions/{sessionId}/render` 요청에 선택적 `cameraView` 객체를 추가한다.

```json
{
  "model": "google/gemini-3.1-flash-image",
  "prompt": "",
  "poseProjectionImage": "data:image/jpeg;base64,...",
  "cameraView": {
    "azimuthDegrees": 38,
    "elevationDegrees": 12
  }
}
```

`cameraView` 규칙은 다음과 같다.

- 객체 전체가 선택 사항이므로 기존 요청은 그대로 유효하다.
- `cameraView`가 있으면 `azimuthDegrees`와 `elevationDegrees`는 모두 필수다.
- 두 값은 유한한 숫자여야 한다.
- `azimuthDegrees` 허용 범위는 `-180` 이상 `180` 이하다.
- `elevationDegrees` 허용 범위는 `-90` 이상 `90` 이하다.
- 범위를 벗어나거나 필드가 누락되면 기존 NestJS validation pipe를 통해 HTTP 400으로 거절한다.

## 타입과 전달 경로

공용 렌더링 타입에 다음 구조를 추가한다.

```ts
export interface RenderCameraView {
  azimuthDegrees: number;
  elevationDegrees: number;
}
```

데이터는 다음 경로를 통해 값 변환 없이 전달한다.

```text
CreateRenderDto
  -> RenderController.create()
  -> RenderService.render(CreateRenderJobInput)
  -> RenderQueuePayload
  -> RenderProcessor.process()
  -> OpenRouterImageService.render(OpenRouterRenderRequest)
```

DB 스키마는 변경하지 않는다. 작업 진단을 위해 값이 제공된 경우 기존 `RenderJob.metadata` JSON에 `camera_view`로 저장한다.

## 프롬프트 동작

`poseProjectionImage`와 `cameraView`가 함께 있으면 기존 포즈 우선 지시에 다음 의미를 추가한다.

- 포즈 투영 이미지의 카메라 시점을 그대로 유지한다.
- 수평 방위각과 수직 고도각을 명시한다.
- 원본 선화의 카메라 시점은 캐릭터 디자인 참고에만 사용한다.
- 결과물을 정면 시점으로 정규화하거나 보정하지 않는다.
- 카메라 각도는 바꾸지 않고 캐릭터 디자인만 원본 선화에서 가져온다.

프롬프트에는 다음 형태의 문장을 포함한다.

```text
Preserve the target camera viewpoint from the pose projection image.
Horizontal camera azimuth: 38 degrees.
Vertical camera elevation: 12 degrees.
Do not normalize or rotate the character to a front-facing view.
Ignore the camera viewpoint of the source line art; use it only for character design.
```

`cameraView`가 없으면 기존 프롬프트와 동작을 유지한다. `cameraView`만 있고 `poseProjectionImage`가 없는 경우에는 수치만으로 시점을 강제하지 않고 기존 keypoint 기반 포즈 프롬프트를 유지한다. 카메라 각도는 해당 각도를 보여 주는 포즈 투영 이미지와 함께 있을 때만 신뢰한다.

## 오류 처리와 호환성

- 기존 클라이언트는 수정 없이 계속 렌더링할 수 있다.
- 잘못된 카메라 값은 작업을 생성하거나 사용량을 예약하기 전에 DTO 검증 단계에서 거절한다.
- OpenRouter 오류, 재시도, 사용량 환불 및 렌더링 상태 처리 방식은 변경하지 않는다.
- `cameraView`가 없는 과거 작업과 렌더링 히스토리도 기존 기본값 처리로 계속 조회할 수 있다.

## 테스트

- DTO가 유효한 카메라 시점 객체를 허용하는지 검증한다.
- DTO가 누락된 내부 필드, 문자열 값, `NaN`, 범위 밖 값을 거절하는지 검증한다.
- 컨트롤러가 `cameraView`를 렌더 서비스로 전달하는지 검증한다.
- 렌더 서비스가 큐 페이로드와 작업 metadata에 동일한 값을 저장하는지 검증한다.
- 워커가 OpenRouter 서비스로 동일한 값을 전달하는지 검증한다.
- 포즈 이미지와 카메라 값이 함께 있을 때 프롬프트에 방위각, 고도각, 정면 보정 금지 문장이 포함되는지 검증한다.
- 카메라 값이 없을 때 기존 프롬프트가 불필요한 각도 문장을 포함하지 않는지 검증한다.
- 전체 테스트와 빌드로 기존 렌더링 계약의 회귀가 없는지 확인한다.

## 프론트엔드 후속 문서

백엔드 구현과 검증이 끝나면 프론트엔드 코드 변경 없이 다음 내용을 담은 한국어 연동 설계 문서를 새 파일로 작성한다.

- Three.js 카메라 위치와 OrbitControls target으로 방위각·고도각을 계산하는 방법
- `capturePoseProjection()` 결과와 `cameraView`를 함께 렌더링 요청에 전달하는 타입 변경
- 기존 클라이언트 호환 방식
- 각도 계산 및 요청 payload 테스트 항목
