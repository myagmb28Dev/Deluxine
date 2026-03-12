# Deluxine FE → BE 요청 목록

> 작성일: 2026-03-11
> 작성자: 프론트엔드팀
> 상태: FE 선반영 완료, BE 구현 대기 중

---

## 배경 — FE 선반영 현황

백엔드 준비 전에 프론트엔드에서 다음 기능을 먼저 구현한 상태입니다.
BE API가 올라오면 아래 FE 임시 코드가 실제 API 호출로 교체됩니다.

| 기능 | FE 현재 상태 | BE 연동 후 상태 |
|------|-------------|----------------|
| 세션 이름 변경 | localStorage 로컬 저장, PATCH /sessions/:id 낙관적 업데이트 시도 | BE 응답으로 서버 영구 저장 |
| 세션 삭제 | 목록에서 숨김 처리, DELETE /sessions/:id 요청 시도 | BE에서 실제 레코드 삭제 |
| 자동 포즈 보정 | 픽셀 분석 + 대칭 제약 + 사지 길이 제약 + 손발가락 도달 제약 | 스켈레톤 topology API로 정확도 향상 |
| 키포인트 이름 매핑 | alias 테이블로 퍼지 매칭 | BE 스키마 고정 후 직접 매핑 |

---

## 1. 필수 API (기능 완결을 위해 반드시 필요)

### 1-1. 세션 이름 영구 수정

```
PATCH /sessions/:id
Authorization: Bearer <access_token>
Content-Type: application/json
```

**요청 본문**
```json
{
  "title": "무릎 포즈 실험 #2"
}
```

**성공 응답 200 OK**
```json
{
  "id": "abc123",
  "title": "무릎 포즈 실험 #2",
  "lineArtUrl": "https://...",
  "createdAt": "2026-03-10T12:00:00.000Z",
  "updatedAt": "2026-03-11T09:30:00.000Z"
}
```

**에러 케이스**

| 상태코드 | 조건 |
|---------|------|
| 400 | title이 빈 문자열이거나 255자 초과 |
| 403 | 본인 세션이 아닐 때 |
| 404 | 세션 없음 |

**FE 연동 포인트**: `src/App.tsx` → `renameSession()` 내부에서 이미 `sessionApi.update(id, { title })` 호출 중.
BE API가 올라오면 자동으로 동작함.

---

### 1-2. 세션 영구 삭제

```
DELETE /sessions/:id
Authorization: Bearer <access_token>
```

**성공 응답** `204 No Content` (본문 없음)

**BE 구현 범위**
1. 세션 레코드 삭제
2. 해당 세션의 포즈(pose), 렌더 히스토리(render jobs) 연관 레코드 삭제
3. 업로드된 라인아트 파일 삭제 (스토리지 정책에 따라)
4. 진행 중인 렌더 job이 있다면 취소 처리

**에러 케이스**

| 상태코드 | 조건 |
|---------|------|
| 403 | 본인 세션이 아닐 때 |
| 404 | 세션 없음 |

**FE 연동 포인트**: `src/App.tsx` → `deleteSessionFromPanel()` 내부에서 이미 `sessionApi.delete(id)` 호출 중.
BE API가 올라오면 서버에서 완전 제거됨.

---

## 2. 정확도 계약 (자동 포즈 보정 품질 향상)

### 2-1. 키포인트 네이밍 스키마 고정 (필수)

**현재 문제**: 모델/버전에 따라 `left_shoulder`, `l_shoulder`, `shoulder_left` 등 이름이 다르게
내려와 FE가 alias 퍼지매칭으로 대응 중. 정확도와 유지보수에 취약.

**요청**: 아래 스키마를 버전에 관계없이 고정해주세요.

**표준 키포인트 이름 목록 (snake_case)**

| 부위 | name 값 |
|-----|---------|
| 머리 | head |
| 목 | neck |
| 가슴(흉추) | chest |
| 복부(요추) | abdomen |
| 척추 중앙 | spine |
| 골반 | pelvis |
| 왼 어깨 | left_shoulder |
| 오른 어깨 | right_shoulder |
| 왼 팔꿈치 | left_elbow |
| 오른 팔꿈치 | right_elbow |
| 왼 손목 | left_wrist |
| 오른 손목 | right_wrist |
| 왼 골반 | left_hip |
| 오른 골반 | right_hip |
| 왼 무릎 | left_knee |
| 오른 무릎 | right_knee |
| 왼 발목 | left_ankle |
| 오른 발목 | right_ankle |
| 왼 발끝 | left_foot |
| 오른 발끝 | right_foot |
| 왼손 손가락 | left_thumb, left_index, left_middle, left_ring, left_pinky |
| 오른손 손가락 | right_thumb, right_index, right_middle, right_ring, right_pinky |
| 왼발 발가락 | left_toe |
| 오른발 발가락 | right_toe |

**좌표계**: 정규화(normalized) 0.0–1.0 권장.
픽셀 좌표일 경우 세션 생성 응답이나 pose 응답에 `imageWidth`, `imageHeight` 함께 제공 필요.

---

### 2-2. 포즈 스켈레톤 Topology API (선택, 정확도 크게 향상)

```
GET /sessions/:sessionId/pose/topology
Authorization: Bearer <access_token>
```

**성공 응답 200 OK**
```json
{
  "edges": [
    ["head", "neck"],
    ["neck", "left_shoulder"],
    ["neck", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["neck", "chest"],
    ["chest", "abdomen"],
    ["abdomen", "pelvis"],
    ["pelvis", "left_hip"],
    ["pelvis", "right_hip"],
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["left_ankle", "left_foot"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
    ["right_ankle", "right_foot"]
  ],
  "left_right_pairs": [
    ["left_shoulder", "right_shoulder"],
    ["left_elbow", "right_elbow"],
    ["left_wrist", "right_wrist"],
    ["left_hip", "right_hip"],
    ["left_knee", "right_knee"],
    ["left_ankle", "right_ankle"],
    ["left_foot", "right_foot"]
  ],
  "groups": {
    "head":  ["head", "neck"],
    "face":  [],
    "torso": ["chest", "abdomen", "spine", "pelvis"],
    "arm":   ["left_shoulder", "left_elbow", "left_wrist",
               "right_shoulder", "right_elbow", "right_wrist"],
    "hand":  ["left_index", "left_middle", "left_ring", "left_pinky", "left_thumb",
               "right_index", "right_middle", "right_ring", "right_pinky", "right_thumb"],
    "leg":   ["left_hip", "left_knee", "left_ankle", "left_foot",
               "right_hip", "right_knee", "right_ankle", "right_foot"]
  }
}
```

**FE 활용**: 이 응답을 받으면 현재 하드코딩된 `JOINT_ALIASES` 테이블과 `buildNeighborGraph`를
topology 기반 동적 구성으로 교체함. 좌우 뒤집힘 감지, 사지 길이 제약이 모델 변경에도 자동 추적됨.

---

## 3. 기존 API 응답 보완 요청

### 3-1. GET /sessions 응답에 title 필드 포함

**현재 문제**: `SessionListItem`에 `title` 필드가 없거나 `null`로 내려옴.

**요청**: 사용자가 지정한 `title`을 항상 포함해주세요. 없으면 `null`.

```json
[
  {
    "id": "abc123",
    "title": "무릎 포즈 실험",
    "createdAt": "2026-03-10T12:00:00.000Z",
    "updatedAt": "2026-03-11T09:30:00.000Z"
  }
]
```

---

### 3-2. GET /sessions/:id/pose 응답 좌표계 명시

**현재 문제**: 키포인트 좌표가 정규화(0–1)인지 픽셀(0–600, 0–800)인지 응답만으로 판단 불가.
FE가 런타임에 추론(`kp.x > 1 || kp.y > 1`)으로 판별 중.

**요청**: 응답에 `coordinateMode` 필드 추가 또는 API 문서에 명확히 명시.

```json
{
  "id": "pose_xyz",
  "sessionId": "abc123",
  "coordinateMode": "normalized",
  "keypoints": [
    { "name": "left_shoulder", "x": 0.38, "y": 0.22, "confidence": 0.95 }
  ]
}
```

---

## 4. Session Panel UX 확장 (선택)

**현재**: `GET /sessions?limit=30`

**요청 파라미터 추가**

| 파라미터 | 타입 | 설명 | 예시 |
|---------|------|------|------|
| sort | string | 정렬 기준 | updatedAt:desc, createdAt:asc |
| q | string | 세션 이름 검색 | q=무릎 |
| cursor | string | 커서 기반 페이지네이션 | 이전 응답의 nextCursor |
| limit | number | 한 번에 가져올 수 (기본 30, 최대 100) | limit=20 |

**확장 응답 구조**
```json
{
  "items": [
    {
      "id": "abc123",
      "title": "무릎 포즈 실험",
      "createdAt": "2026-03-10T12:00:00.000Z",
      "updatedAt": "2026-03-11T09:30:00.000Z"
    }
  ],
  "nextCursor": "eyJpZCI6ImFiYzEyMyJ9",
  "total": 150
}
```

---

## 우선순위 요약

| 우선순위 | 항목 | 이유 |
|---------|------|------|
| P0 (필수) | PATCH /sessions/:id 이름 수정 | 사용자 데이터 영구성 |
| P0 (필수) | DELETE /sessions/:id 세션 삭제 | 사용자 데이터 영구성 |
| P1 (권장) | 키포인트 네이밍 스키마 고정 | 자동 보정 정확도 직결 |
| P1 (권장) | GET /sessions 응답에 title 포함 | Session Panel 표시 정확도 |
| P1 (권장) | 포즈 좌표계 명시 (coordinateMode) | FE 파싱 안정성 |
| P2 (선택) | GET /pose/topology API | 자동 보정 품질 대폭 향상 |
| P2 (선택) | 세션 목록 정렬/검색/페이지네이션 | UX 확장 |