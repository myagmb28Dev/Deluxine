# 렌더 결과 포즈 불일치 문제 기술서

## 증상

- 프론트 에디터의 마네킹은 정면을 향하고 팔을 몸 가까이에 둔 포즈다.
- Seedream 4.5 결과는 원본 선화의 달리는 자세와 뻗은 팔을 강하게 유지한다.
- 결과적으로 두 번째 참조인 마네킹 포즈보다 첫 번째 참조인 원본 선화의 포즈가 우선된다.

## 확인된 프론트 동작

1. 렌더 직전에 현재 `keypoints`와 `editorState`를 `PUT /poses`로 저장한다.
2. Three.js 캔버스에서 조작 핸들과 배경 선화를 제외한 마네킹 투영 이미지를 캡처한다.
3. 캡처 결과를 JPEG data URL로 `POST /sessions/{sessionId}/render`의 `poseProjectionImage`에 전달한다.
4. 캡처 실패 시에는 렌더 요청을 전송하지 않는다.
5. 콘솔에는 이미지 본문을 제외한 MIME 타입과 문자열 길이만 기록한다.

## 현재 백엔드 경로

- `render.controller.ts`: `dto.poseProjectionImage`를 렌더 작업 입력에 전달
- `render.service.ts`: BullMQ payload에 `poseProjectionImage` 저장
- `render.processor.ts`: `OpenRouterImageService.render()`에 전달
- `openrouter-image.service.ts`: 원본 선화를 첫 번째 `input_references`, 포즈 투영을 두 번째 참조로 전달

따라서 프론트 필드 누락보다는 OpenRouter 모델의 다중 참조 우선순위 또는 프롬프트 준수 문제가 유력하다.

## 백엔드에 요청하는 진단 정보

작업별로 다음 항목을 로그 또는 metadata에 남겨야 한다. base64 본문은 기록하지 않는다.

- `job_id`
- 선택 모델
- `has_pose_projection_image`
- 포즈 이미지 MIME 타입
- 포즈 이미지 base64 또는 data URL 길이
- OpenRouter에 전달한 참조 이미지 개수와 순서
- 최종 `prompt`의 포즈 우선 지시 포함 여부

## 요청하는 수정

1. 두 번째 참조가 목표 포즈이며 첫 번째 참조의 기존 자세는 무시해야 한다는 지시를 프롬프트 첫 부분에 배치한다.
2. `poseProjectionImage`가 있는 요청은 원본의 캐릭터 디자인만 보존하고 원본의 팔·다리 방향과 몸통 각도는 보존하지 않도록 명시한다.
3. 모델별로 다중 이미지 편집 입력 형식이 실제 지원되는지 OpenRouter 요청/응답을 확인한다.
4. Seedream이 참조 순서에 민감하면 포즈 이미지를 첫 번째 참조로 두거나, 원본과 포즈를 라벨이 포함된 단일 합성 참조 이미지로 전달하는 A/B 테스트를 수행한다.
5. 완료된 작업 metadata에 `has_pose_projection_image`와 참조 전략을 남겨 결과와 비교할 수 있게 한다.

## 성공 기준

- 정면 마네킹 입력에서 결과의 몸통이 측면으로 회전하지 않는다.
- 양팔과 양다리의 방향이 마네킹 실루엣과 일치한다.
- 원본 선화의 캐릭터 디자인과 선화 스타일은 유지한다.
- 같은 입력을 모델별로 비교해 포즈 준수율 차이를 확인할 수 있다.
