# 프론트엔드 Nano Banana 모델 마이그레이션 안내

작성일: 2026-07-12  
대상: Deluxine Frontend

## 1. 변경 목적

백엔드의 이미지 렌더링 모델 3종이 기존 Seedream, FLUX, Riverflow에서 Google Gemini 기반 Nano Banana 모델 3종으로 변경되었습니다.

프론트엔드가 사용하는 API 경로와 요청·응답 필드 구조는 바뀌지 않았습니다. 모델 ID, 표시 이름, 기본 모델만 새 값으로 갱신하면 됩니다.

## 2. 모델 변경표

| 등급 | 기존 모델 | 새 표시 이름 | 새 모델 ID |
| --- | --- | --- | --- |
| `value` | Seedream 4.5 | Nano Banana 2 Lite | `google/gemini-3.1-flash-lite-image` |
| `balanced` | FLUX.2 Pro | Nano Banana 2 | `google/gemini-3.1-flash-image` |
| `premium` | Riverflow V2.5 Pro | Nano Banana Pro | `google/gemini-3-pro-image` |

새 기본 모델은 다음과 같습니다.

```text
google/gemini-3.1-flash-image
```

기존 모델 ID는 더 이상 렌더링 요청에 사용할 수 없습니다.

## 3. 유지되는 API 계약

다음 API 경로와 필드 구조는 그대로 유지됩니다.

```http
GET /sessions/{sessionId}/render/models
Authorization: Bearer {access_token}
```

```http
POST /sessions/{sessionId}/render
Authorization: Bearer {access_token}
Content-Type: application/json
```

- 렌더링 요청의 `model` 필드는 계속 선택 사항입니다.
- `model`을 생략하면 응답의 `default_model`에 해당하는 모델을 백엔드가 사용합니다.
- `prompt`, `poseProjectionImage` 필드의 계약은 변경되지 않았습니다.
- 렌더 작업 상태 응답의 `model` 필드에는 실제 사용한 새 모델 ID가 반환됩니다.
- 사용자별 하루 2회 렌더링 제한은 변경되지 않았습니다.

## 4. 모델 목록 응답 예시

프론트엔드는 모델 ID와 기본값을 직접 하드코딩하지 말고 아래 API 응답을 기준으로 모델 선택 UI를 구성해야 합니다.

```json
{
  "default_model": "google/gemini-3.1-flash-image",
  "models": [
    {
      "id": "google/gemini-3.1-flash-lite-image",
      "name": "Nano Banana 2 Lite",
      "tier": "value",
      "pricing": "payg",
      "description": "빠르고 비용 효율적인 이미지 생성 모델"
    },
    {
      "id": "google/gemini-3.1-flash-image",
      "name": "Nano Banana 2",
      "tier": "balanced",
      "pricing": "payg",
      "description": "품질과 속도의 균형이 좋은 기본 모델"
    },
    {
      "id": "google/gemini-3-pro-image",
      "name": "Nano Banana Pro",
      "tier": "premium",
      "pricing": "payg",
      "description": "복잡한 편집에 적합한 최고 품질 모델"
    }
  ],
  "usage_policy": {
    "requests_per_day": 2,
    "scope": "user",
    "remaining_requests_available": true
  }
}
```

## 5. 렌더링 요청 예시

선택한 모델의 `id`를 기존 `model` 필드에 그대로 전달합니다.

```json
{
  "model": "google/gemini-3.1-flash-image",
  "prompt": "원본 캐릭터 디자인과 선화 스타일을 유지해 주세요.",
  "poseProjectionImage": "data:image/png;base64,..."
}
```

모델을 직접 선택하지 않은 경우 `model`을 보내지 않아도 됩니다.

```json
{
  "prompt": "원본 캐릭터 디자인과 선화 스타일을 유지해 주세요.",
  "poseProjectionImage": "data:image/png;base64,..."
}
```

이 경우 백엔드는 `google/gemini-3.1-flash-image`를 사용합니다.

## 6. 프론트엔드 변경 항목

- 기존 모델 ID를 상수, 타입, 기본 상태, 테스트 fixture에 하드코딩했다면 새 ID로 교체합니다.
- 초기 선택값은 `GET /sessions/{sessionId}/render/models` 응답의 `default_model`을 사용합니다.
- 선택 UI의 항목은 응답의 `models` 배열로 렌더링합니다.
- 렌더링 요청에는 선택한 항목의 `id`를 전달합니다.
- 렌더 작업 상태나 히스토리에 모델명을 표시한다면 새 ID와 표시 이름을 반영합니다.
- 로컬 스토리지에 기존 모델 ID를 저장하고 있다면 현재 `models` 목록에 존재하는지 검사하고, 없으면 `default_model`로 되돌립니다.
- 기존 모델 ID가 포함된 프론트엔드 테스트와 스냅샷을 갱신합니다.

## 7. 적용 확인

프론트엔드 적용 후 다음 동작을 확인합니다.

1. 모델 선택 UI에 Nano Banana 모델 3종만 표시됩니다.
2. 초기 선택 모델이 Nano Banana 2입니다.
3. 각 모델을 선택하면 렌더링 요청의 `model` 값이 해당 ID로 전송됩니다.
4. 저장된 기존 모델 ID가 있어도 화면이 빈 선택 상태가 되지 않고 기본 모델로 복구됩니다.
5. 모델을 생략한 요청은 Nano Banana 2로 생성됩니다.
6. 작업 상태와 렌더링 히스토리에 새 모델 ID가 정상적으로 표시됩니다.
