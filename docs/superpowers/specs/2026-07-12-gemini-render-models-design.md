# Gemini 렌더링 모델 카탈로그 설계

## 목표

현재 사용 중인 Gemini 계열이 아닌 OpenRouter 이미지 모델 3개를 서로 다른 정식 Gemini 이미지 모델 3개로 교체한다. 기존 렌더링 API 계약과 `value` / `balanced` / `premium` 선택 구조는 그대로 유지한다.

## 모델 카탈로그

| 등급 | 표시 이름 | OpenRouter 모델 ID |
| --- | --- | --- |
| `value` | Nano Banana 2 Lite | `google/gemini-3.1-flash-lite-image` |
| `balanced` | Nano Banana 2 | `google/gemini-3.1-flash-image` |
| `premium` | Nano Banana Pro | `google/gemini-3-pro-image` |

기본 모델은 `DEFAULT_RENDER_MODEL`을 통해 `google/gemini-3.1-flash-image`로 설정한다.

## 구현 범위

- `RenderModel` enum의 멤버와 값을 Gemini 모델 3종으로 교체한다.
- 기존 등급과 종량제 필드는 유지하면서 `RENDER_MODEL_OPTIONS`의 이름과 설명을 갱신한다.
- 선화와 포즈 투영 이미지가 함께 전달되면 Gemini 모델 3종 모두 포즈 이미지를 첫 번째 참조 이미지로 사용한다.
- 렌더링 모델 및 OpenRouter 서비스 테스트에서 새 enum 멤버를 사용하고 Gemini의 포즈 우선 동작을 검증한다.
- README의 예시와 모델 선택 문서를 새 카탈로그 및 기본 모델에 맞춘다.

렌더링 엔드포인트, DTO 형식, BullMQ 처리, 사용자별 일일 사용량 정책, Redis 상태 관리, R2 저장 방식, OpenRouter `/images` 호출 방식은 변경하지 않는다.

## 데이터 흐름

1. 인증된 클라이언트가 `GET /render/models`를 호출해 Gemini 모델 3종을 받는다.
2. 클라이언트가 기존 렌더링 DTO를 통해 모델 ID 하나를 제출한다.
3. 렌더링 작업은 선택한 모델 ID를 기존 메타데이터 필드에 저장한다.
4. 워커가 선택한 Gemini 모델을 사용해 선화와 선택적인 포즈 투영 이미지를 OpenRouter `/images`로 전송한다.
5. 포즈 투영 이미지가 있으면 모든 지원 Gemini 모델에서 선화보다 먼저 배치한다.

## 오류 처리

기존 동작을 유지한다. API 키가 없으면 `OPENROUTER_API_KEY_MISSING`으로 실패하고, OpenRouter의 402 및 429 응답은 `QUOTA_EXCEEDED`로 변환한다. 그 밖의 공급자 오류에는 현재의 재시도 및 실패 처리 흐름을 그대로 적용한다.

## 검증

- 먼저 카탈로그 테스트와 참조 이미지 순서 테스트를 갱신하고 기존 카탈로그에서 의도대로 실패하는지 확인한다.
- 필요한 최소 프로덕션 코드를 변경하고 관련 테스트를 다시 실행한다.
- 전체 테스트와 빌드를 실행한다.
- 저장소 전체에서 교체 전 모델 ID 3개를 검색해 활성 코드나 문서에 남아 있지 않은지 확인한다.

실제 유료 추론 호출은 OpenRouter 잔액을 사용하므로 이번 변경 범위에서 제외한다. 외부 연동 경계는 기존 HTTP 서비스 테스트로 검증한다.
