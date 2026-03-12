# Deluxine API Specification (Frontend Integration)

본 문서는 현재 백엔드 구현(NestJS 코드 기준)과 일치하는 프론트엔드 연동 명세입니다.

## 1) 기본 정보

- Base URL: `http://localhost:3000`
- Swagger: `GET /docs`
- 정적 파일: `GET /uploads/*`
- 전역 CORS: `app.corsOrigin` 환경변수 기준(미설정 시 `*`)
- Rate Limit(전역): 1분 60회

## 2) 인증 방식

### 2.1 Google OAuth 로그인

1. 프론트에서 브라우저로 `GET /auth/google` 이동
2. Google 인증 후 `GET /auth/google/callback`으로 복귀
3. 콜백 응답 JSON에서 `app_tokens.access_token`, `app_tokens.refresh_token` 저장

### 2.2 Bearer 토큰

- 보호 API 호출 시 헤더:

```http
Authorization: Bearer {access_token}
```

### 2.3 토큰 재발급

- `POST /auth/refresh`로 refresh token 회전(rotation)
- 성공 시 새 access/refresh를 둘 다 교체 저장

## 3) 공통 에러 응답 포맷

전역 예외 필터로 아래 형태를 반환합니다.

```json
{
  "statusCode": 400,
  "timestamp": "2026-03-11T00:00:00.000Z",
  "path": "/sessions",
  "message": "Bad Request Exception"
}
```

주요 상태코드:
- `400` Validation 실패
- `401` 인증 실패/토큰 오류
- `404` 리소스 없음
- `429` 요청 과다(레이트리밋)
- `500` 서버 내부 오류

---

## 4) Auth API

### 4.1 Google 로그인 시작
- **GET** `/auth/google`
- Auth Guard가 Google OAuth 페이지로 리다이렉트

### 4.2 Google 콜백
- **GET** `/auth/google/callback`
- 응답 예시:

```json
{
  "message": "google login success",
  "user_id": "uuid",
  "google_id": "google-sub",
  "email": "user@example.com",
  "display_name": "User Name",
  "app_tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "Bearer",
    "expires_in": "15m"
  },
  "token_saved": {
    "access_token": true,
    "refresh_token": true,
    "updated_at": "2026-03-11T00:00:00.000Z"
  }
}
```

### 4.3 사용자 저장 상태 확인
- **GET** `/auth/users/:userId/storage-status`
- 404: user not found

### 4.4 로그아웃
- **POST** `/auth/users/:userId/logout`
- Google revoke 시도 + 내부 저장 토큰 제거
- revoke 실패 시 Redis에 재시도 큐 적재

### 4.5 회원 삭제
- **DELETE** `/auth/users/:userId`
- Google revoke 시도 후 유저 레코드 삭제

### 4.6 revoke 재시도
- **POST** `/auth/users/:userId/revoke-retry`

### 4.7 JWT 재발급
- **POST** `/auth/refresh`
- Body:

```json
{
  "userId": "15ebad65-f14d-4f06-b8fc-caf264fced86",
  "refreshToken": "<jwt-refresh-token>"
}
```

### 4.8 내 정보 조회 (보호)
- **GET** `/auth/me`
- Header: Bearer access token

---

## 5) Session API (보호)

모든 `sessions` API는 JWT 필요.

### 5.1 세션 생성 + 선화 업로드
- **POST** `/sessions`
- Content-Type: `multipart/form-data`
- Form field: `file` (binary)
- 응답: `Session` 엔티티

```json
{
  "id": "uuid",
  "lineArtUrl": "/uploads/file-123.png",
  "history": [
    { "timestamp": "2026-03-11T00:00:00.000Z", "action": "session.created" }
  ],
  "createdAt": "2026-03-11T00:00:00.000Z",
  "updatedAt": "2026-03-11T00:00:00.000Z"
}
```

> 파일 미첨부 시 기본값: `/uploads/default-line.png`

### 5.2 세션 조회
- **GET** `/sessions/:id`
- 404: session not found

### 5.3 내 세션 목록 조회
- **GET** `/sessions?limit=30&sort=updatedAt:desc&q=무릎&cursor=...`
- 지원 쿼리:
  - `limit`: 1~100
  - `sort`: `updatedAt:desc` | `updatedAt:asc` | `createdAt:desc` | `createdAt:asc`
  - `q`: 제목 검색
  - `cursor`: 커서 기반 페이지네이션
- 응답:

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

### 5.4 세션 제목 수정
- **PATCH** `/sessions/:id`
- Body:

```json
{
  "title": "무릎 포즈 실험 #2"
}
```

- 상태코드:
  - `200` 성공
  - `400` title 공백/255자 초과
  - `403` 본인 세션 아님
  - `404` 세션 없음

### 5.5 세션 삭제
- **DELETE** `/sessions/:id`
- 응답: `204 No Content`
- 동작:
  - 세션 삭제
  - 관련 `poses`, `render_jobs` 삭제
  - 세션 업로드/렌더 폴더 삭제
  - 큐에 등록된 렌더 작업 제거 시도

---

## 6) Pose API (보호)

Base path: `/sessions/:sessionId/pose`

### 6.1 포즈 생성 요청 (비동기 큐)
- **POST** `/sessions/:sessionId/pose/generate`
- 동작:
  - Redis 상태를 `pending`으로 설정
  - BullMQ `pose` 큐에 작업 등록
  - 세션 `history`에 `pose.generation_requested` 추가
- 응답:

```json
{
  "status": "pending",
  "message": "Pose generation has been enqueued. Please check back later.",
  "sessionId": "uuid"
}
```

### 6.2 포즈 생성 상태 폴링 (진행률 포함)
- **GET** `/sessions/:sessionId/pose/status`
- 응답 케이스:

1) **진행 중** (진행률 포함)
```json
{ "status": "pending", "progress": 0 }
```
또는
```json
{ "status": "generating", "progress": 45 }
```

진행률 단계:
- `0%`: 작업 대기 중
- `20%`: AI 엔진 호출 시작
- `60%`: AI 처리 완료, DB 저장 중
- `90%`: 캐시 저장 중
- `100%`: 완료

2) **실패**
```json
{ "status": "failed", "progress": -1 }
```

3) **완료** (진행률 100%)
```json
{ "status": "completed", "pose_id": "uuid", "progress": 100 }
```

4) **시작 안 됨/없음**
- 404: `Pose generation status not found or not started`

### 6.3 현재 포즈 조회
- **GET** `/sessions/:sessionId/pose`
- 응답: `Pose` 엔티티

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "coordinateMode": "normalized",
  "label": "detected-pose",
  "keypoints": [
    { "name": "head", "x": 0.5, "y": 0.25, "confidence": 0.99 }
  ],
  "isChosen": false,
  "createdAt": "2026-03-11T00:00:00.000Z",
  "updatedAt": "2026-03-11T00:00:00.000Z"
}
```

### 6.3-1 포즈 Topology 조회
- **GET** `/sessions/:sessionId/pose/topology`
- 응답:

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

### 6.4 포즈 키포인트 수정
- **PATCH** `/sessions/:sessionId/pose`
- Body:

```json
{
  "keypoints": [
    { "name": "left_shoulder", "x": 120.5, "y": 210.3 }
  ]
}
```

- 동작:
  - 입력 keypoints를 임시 저장 후 DB 반영
  - 저장 시 `confidence: 1.0`으로 보정
  - 세션 `history`에 `pose.updated` 추가
- 주의:
  - 선행 생성 포즈가 없으면 내부 에러 발생 가능(현재 구현)

---

## 7) Render API (보호)

Base path: `/sessions/:sessionId/render`

### 7.1 렌더 요청 (비동기 큐)
- **POST** `/sessions/:sessionId/render`
- Body:

```json
{
  "prompt": "비 오는 도시 배경, 조명 강조"
}
```

- 선행 조건:
  - session 존재
  - pose 존재
- 동작:
  - 세션 `history`에 `render.requested` 추가
  - BullMQ `render` 큐에 작업 등록
- 응답:

```json
{
  "job_id": "uuid",
  "status": "pending",
  "message": "Render job has been enqueued successfully.",
  "line_art": "/uploads/file-123.png",
  "chosen_pose": "detected-pose",
  "prompt_used": "비 오는 도시 배경, 조명 강조",
  "history": [
    { "timestamp": "...", "action": "session.created" },
    { "timestamp": "...", "action": "pose.generation_requested" },
    { "timestamp": "...", "action": "pose.updated" },
    { "timestamp": "...", "action": "render.requested" }
  ]
}
```

### 7.2 렌더 상태 폴링
- **GET** `/sessions/:sessionId/render/jobs/:jobId`
- 응답:

```json
{
  "job_id": "uuid",
  "status": "pending",
  "output_image": null,
  "created_at": "2026-03-11T00:00:00.000Z",
  "updated_at": "2026-03-11T00:00:00.000Z"
}
```

`status` 값: `pending` | `running` | `completed` | `failed`

완료 시 `output_image` 예시:

```json
{
  "job_id": "uuid",
  "status": "completed",
  "output_image": "/uploads/render-xxxx.png",
  "created_at": "2026-03-11T00:00:00.000Z",
  "updated_at": "2026-03-11T00:00:12.000Z"
}
```

---

## 8) Redis Debug API

운영/개발 디버깅 목적(보호되지 않음).

- **GET** `/redis/ping`
- **GET** `/redis/keys/:pattern`
- **GET** `/redis/stats`

---

## 9) 프론트 연동 권장 순서

1. OAuth 로그인: `/auth/google`
2. 콜백 응답의 `app_tokens` 저장
3. Bearer로 세션 생성: `/sessions` (multipart 파일 업로드)
4. 포즈 생성 요청: `/sessions/{sessionId}/pose/generate`
5. 상태 폴링: `/sessions/{sessionId}/pose/status` (2초 간격 권장)
6. 완료 후 포즈 조회/편집: `GET/PATCH /sessions/{sessionId}/pose`
7. 렌더 요청: `POST /sessions/{sessionId}/render`
8. 렌더 폴링: `/sessions/{sessionId}/render/jobs/{jobId}` (3~5초 간격 권장)
9. 완료 시 `output_image` URL 표시

---

## 10) 현재 구현상 주의사항

- `POST /auth/google/callback`은 JSON을 반환합니다(프론트 URL로 자동 리다이렉트 없음).
- Swagger 문서에는 Bearer 보안 스키마가 완전 자동 연결되지 않을 수 있으므로 실제 호출은 헤더를 직접 넣어야 합니다.
- 포즈 생성/렌더는 비동기 큐 기반이므로 반드시 폴링 UI가 필요합니다.
- 렌더 시 `chosen_pose`는 현재 `pose.label`을 사용합니다(키포인트 전체가 직접 전달되는 구조 아님).
- 최종 출력 URL은 정적 경로(`/uploads/...`)이며, 프론트는 Base URL을 붙여 접근해야 합니다.

---

## 11) 프론트엔드 TypeScript 타입 정의

```ts
export type ApiError = {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string;
};

export type JwtTokens = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string; // 예: '15m'
};

export type HistoryItem = {
  timestamp: string;
  action: string;
  payload?: Record<string, unknown>;
};

export type SessionDto = {
  id: string;
  lineArtUrl: string;
  history: HistoryItem[];
  createdAt: string;
  updatedAt: string;
};

export type Keypoint = {
  name: string;
  x: number;
  y: number;
  confidence?: number;
};

export type PoseDto = {
  id: string;
  sessionId: string;
  label: string;
  keypoints: Array<Keypoint & { confidence: number }>;
  isChosen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoseGenerateResponse = {
  status: 'pending';
  message: string;
  sessionId: string;
};

export type PoseStatusResponse =
  | { status: 'pending' | 'generating'; progress: number }
  | { status: 'failed'; progress: -1 }
  | { status: 'completed'; pose_id: string; progress: 100 };

export type UpdatePoseRequest = {
  keypoints: Array<{
    name: string;
    x: number;
    y: number;
  }>;
};

export type CreateRenderRequest = {
  prompt: string;
};

export type CreateRenderResponse = {
  job_id: string;
  status: 'pending';
  message: string;
  line_art: string;
  chosen_pose: string;
  prompt_used: string;
  history: HistoryItem[];
};

export type RenderJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type RenderJobResponse = {
  job_id: string;
  status: RenderJobStatus;
  output_image: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleCallbackResponse = {
  message: 'google login success';
  user_id: string;
  google_id: string;
  email: string;
  display_name: string | null;
  app_tokens: JwtTokens;
  token_saved: {
    access_token: boolean;
    refresh_token: boolean;
    updated_at: string | null;
  };
};

export type RefreshTokenRequest = {
  userId: string;
  refreshToken: string;
};

export type RefreshTokenResponse = {
  user_id: string;
  email: string;
  app_tokens: JwtTokens;
};

export type MeResponse = {
  user_id: string;
  google_id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  picture: string | null;
  created_at: string;
  updated_at: string;
};
```

### 업로드 요청 타입(프론트)

```ts
export type CreateSessionInput = {
  file: File;
};
```

### 클라이언트 저장 권장 타입

```ts
export type AuthStore = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  email: string;
};
```
