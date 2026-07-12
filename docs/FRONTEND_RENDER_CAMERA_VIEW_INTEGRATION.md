# 프론트엔드 렌더링 카메라 시점 연동 설계

작성일: 2026-07-12
대상: Deluxine Frontend

## 1. 목적과 범위

백엔드 렌더링 요청에 선택적 `cameraView` 계약이 추가되었습니다. 프론트엔드는 포즈 투영 이미지를 캡처할 때 사용한 Three.js 카메라의 수평 방위각과 수직 고도각을 계산해 동일한 렌더링 요청에 포함해야 합니다.

이 문서는 프론트엔드 구현을 위한 설계 문서입니다. 이번 백엔드 작업에서는 프론트엔드 코드를 수정하지 않았습니다.

## 2. 백엔드 요청 계약

기존 렌더링 요청에 다음 객체를 선택적으로 추가합니다.

```ts
export type RenderCameraView = {
  azimuthDegrees: number;
  elevationDegrees: number;
};

export type CreateRenderRequest = {
  model?: string;
  prompt: string;
  poseProjectionImage?: string;
  cameraView?: RenderCameraView;
};
```

요청 예시는 다음과 같습니다.

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

허용 범위:

| 필드 | 최소 | 최대 | 의미 |
| --- | ---: | ---: | --- |
| `azimuthDegrees` | -180 | 180 | 카메라의 수평 회전 각도 |
| `elevationDegrees` | -90 | 90 | 카메라의 수직 높이 각도 |

`cameraView`가 있으면 두 필드는 모두 유한한 숫자여야 합니다. 유효하지 않은 값은 백엔드에서 HTTP 400으로 거절됩니다.

## 3. 각도 기준

현재 에디터의 기본 카메라는 `[0, 0, 10]`에서 원점을 바라봅니다. 이 기본 정면을 다음 기준으로 사용합니다.

- 정면: `azimuthDegrees = 0`
- 카메라가 대상의 오른쪽 방향으로 이동: 양수 방위각
- 카메라가 대상의 왼쪽 방향으로 이동: 음수 방위각
- 카메라가 대상보다 위에 위치: 양수 고도각
- 카메라가 대상보다 아래에 위치: 음수 고도각

카메라의 quaternion이나 모델 회전값을 직접 각도로 변환하지 않습니다. OrbitControls의 target에서 카메라 위치로 향하는 벡터를 기준으로 계산해야 실제 캡처 시점과 일치합니다.

## 4. 각도 계산

```ts
import * as THREE from 'three';

const RAD_TO_DEG = 180 / Math.PI;

export const calculateRenderCameraView = (
  camera: THREE.Camera,
  target: THREE.Vector3,
): RenderCameraView | null => {
  const offset = camera.position.clone().sub(target);
  const horizontalDistance = Math.hypot(offset.x, offset.z);
  const distance = offset.length();

  if (!Number.isFinite(distance) || distance < 1e-6) {
    return null;
  }

  const azimuthDegrees = Math.atan2(offset.x, offset.z) * RAD_TO_DEG;
  const elevationDegrees =
    Math.atan2(offset.y, horizontalDistance) * RAD_TO_DEG;

  return {
    azimuthDegrees: Number(azimuthDegrees.toFixed(2)),
    elevationDegrees: Number(elevationDegrees.toFixed(2)),
  };
};
```

`atan2(offset.x, offset.z)`를 사용하므로 현재 기본 카메라 `[0, 0, 10]`은 방위각 `0`이 됩니다. Orthographic 카메라에서도 위치와 OrbitControls target으로 시선 방향을 계산할 수 있으므로 같은 공식을 사용합니다.

## 5. 캡처 결과 구조

현재 `capturePoseProjection()`이 이미지 문자열만 반환한다면, 캡처에 사용한 이미지와 각도를 한 객체로 묶는 방식이 안전합니다.

```ts
export type PoseProjectionCapture = {
  imageData: string;
  cameraView: RenderCameraView | null;
};

export type CanvasEditorHandle = {
  capturePoseProjection: () => Promise<PoseProjectionCapture | null>;
};
```

캡처 시점의 동일한 `camera`와 OrbitControls `target`을 사용해 두 값을 함께 생성합니다.

```ts
const cameraView = calculateRenderCameraView(
  camera,
  controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0),
);

onCaptured({
  imageData,
  cameraView,
});
```

카메라를 캡처한 뒤 나중에 각도를 다시 읽으면 사용자가 그 사이 카메라를 움직였을 때 이미지와 숫자가 달라질 수 있습니다. 반드시 캡처를 실행한 동일한 렌더 프레임에서 각도를 계산합니다.

## 6. 렌더링 요청 연결

```ts
const capture = await canvasEditorRef.current?.capturePoseProjection();

if (!capture?.imageData) {
  throw new Error('포즈 투영 이미지를 캡처하지 못했습니다.');
}

await renderApi.request(sessionId, {
  model: selectedModel,
  prompt: prompt || '',
  poseProjectionImage: capture.imageData,
  ...(capture.cameraView ? { cameraView: capture.cameraView } : {}),
});
```

`cameraView` 계산에 실패하면 렌더링 전체를 막지 말고 해당 필드만 생략합니다. 백엔드는 `cameraView`가 없는 기존 요청도 계속 지원합니다.

## 7. 적용 시 주의사항

- 모델의 회전값이나 마네킹 루트 회전값을 카메라 각도로 보내지 않습니다.
- OrbitControls target을 항상 원점으로 가정하지 않습니다. 저장된 세션별 target을 사용합니다.
- degree가 아닌 radian 값을 보내지 않습니다.
- `poseProjectionImage` 없이 `cameraView`만 보내지 않습니다. 백엔드는 이 경우 각도를 프롬프트에 사용하지 않습니다.
- 줌, 화면 내 위치, orthographic size는 이번 계약에 포함하지 않습니다.
- 로컬 카메라 상태를 복원한 뒤 OrbitControls가 update된 상태에서 캡처해야 합니다.

## 8. 테스트 항목

단위 테스트:

- 카메라 `[0, 0, 10]`, target `[0, 0, 0]`은 방위각 `0`, 고도각 `0`
- 카메라 `[10, 0, 0]`은 방위각 `90`, 고도각 `0`
- 카메라 `[-10, 0, 0]`은 방위각 `-90`, 고도각 `0`
- 카메라 `[0, 10, 10]`은 방위각 `0`, 고도각 `45`
- target이 원점이 아닐 때도 상대 벡터 기준으로 동일한 결과
- 카메라와 target이 같은 위치면 `null`
- 캡처 결과에 이미지와 같은 프레임의 `cameraView`가 포함됨
- 각도 계산 실패 시 요청에서 `cameraView`만 생략됨

수동 확인:

1. 정면 시점에서 요청 payload가 `0`, `0`에 가깝게 전송됩니다.
2. 좌우 3/4 시점에서 방위각의 부호와 크기가 화면 방향에 맞게 변합니다.
3. 측면 시점에서 방위각이 `90` 또는 `-90`에 가까워집니다.
4. 위·아래 시점에서 고도각의 부호가 올바르게 변합니다.
5. 각 시점의 결과물이 임의로 정면을 향하지 않고 포즈 투영 이미지의 카메라 방향을 유지합니다.
