# Deluxine BE → FE 전달 문서

작성일: 2026-03-11

프론트에서 바로 반영해야 하는 변경사항만 정리했습니다.

---

## 1) 세션 목록 API 응답 형식 변경

### GET `/sessions`

기존처럼 배열만 오는 형태가 아니라, 이제 아래 객체 형태입니다.

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "무릎 포즈 실험 #1",
      "createdAt": "2026-03-11T00:00:00.000Z",
      "updatedAt": "2026-03-11T00:10:00.000Z"
    }
  ],
  "nextCursor": "base64-cursor-or-null",
  "total": 12
}
```

### 지원 쿼리
- `limit`
- `sort`
  - `updatedAt:desc`
  - `updatedAt:asc`
  - `createdAt:desc`
  - `createdAt:asc`
- `q`
- `cursor`

---

## 2) 세션 삭제 응답 변경

### DELETE `/sessions/:id`

성공 시:
- `204 No Content`
- 본문 없음

프론트에서 JSON 응답을 기대하면 안 됩니다.

---

## 3) 포즈 응답에 좌표계 명시 추가

### GET `/sessions/:sessionId/pose`

응답에 `coordinateMode`가 추가됩니다.

```json
{
  "id": "pose_xyz",
  "sessionId": "session_123",
  "coordinateMode": "normalized",
  "label": "detected-pose",
  "keypoints": [
    { "name": "left_shoulder", "x": 0.38, "y": 0.22, "confidence": 0.95 }
  ]
}
```

현재 좌표계는 `normalized` 고정입니다.

---

## 4) 포즈 Topology API 추가

### GET `/sessions/:sessionId/pose/topology`

응답 예시:

```json
{
  "edges": [["head", "neck"], ["neck", "left_shoulder"]],
  "left_right_pairs": [["left_shoulder", "right_shoulder"]],
  "groups": {
    "head": ["head", "neck"],
    "face": [],
    "torso": ["chest", "abdomen", "spine", "pelvis"],
    "arm": ["left_shoulder", "left_elbow", "left_wrist", "right_shoulder", "right_elbow", "right_wrist"],
    "hand": ["left_thumb", "left_index", "left_middle", "left_ring", "left_pinky", "right_thumb", "right_index", "right_middle", "right_ring", "right_pinky"],
    "leg": ["left_hip", "left_knee", "left_ankle", "left_foot", "right_hip", "right_knee", "right_ankle", "right_foot"]
  }
}
```

기존 하드코딩 alias/neighbor graph 대신 이 응답 기반으로 교체 가능.

---

## 5) 세션 제목 수정 API

### PATCH `/sessions/:id`

요청:

```json
{
  "title": "무릎 포즈 실험 #2"
}
```

규칙:
- 공백 문자열 불가
- 최대 255자

에러:
- `400`: 제목 형식 오류
- `403`: 본인 세션 아님
- `404`: 세션 없음

---

## 6) 세션 삭제 동작

### DELETE `/sessions/:id`

백엔드에서 함께 처리하는 범위:
- 세션 레코드 삭제
- 연관 pose 삭제
- 연관 render job 삭제
- 업로드/렌더 파일 폴더 삭제
- 큐에 등록된 렌더 작업 제거 시도

---

## 7) 로그인 유지 문제 관련

이 문제는 현재 구조상 FE에서 아래를 반영해야 해결됩니다.

- 앱 시작 시 `userId`, `accessToken`, `refreshToken` 먼저 복원
- 복원 완료 전 보호 API 호출 금지
- `401`이면 refresh 1회만 시도
- refresh 실패 시에만 로그아웃 처리

백엔드는 이미 아래를 제공합니다.
- `POST /auth/refresh`
- 동일 구글 계정에 대해 동일 유저 유지
- 인증 실패 시 401 반환

---

## 8) 참고 문서

- 전체 API 문서: `API_SPECIFICATION.md`
- 상세 액션 문서: `FRONTEND_ACTION_ITEMS.md`
