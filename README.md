# Deluxine

Deluxine은 유저가 업로드한 원본 선화 일러스트를 기반으로, 자동 도형화(마네킹) 구도를 생성하고 원하는 자세로 조정한 뒤 최종 이미지 생성까지 연결하는 파이프라인 프로젝트입니다.

## 프로젝트 목표

- 원본 선화의 구조와 비율을 유지한 채 도형화 구도 생성
- 유저가 관절/구도를 직접 조정할 수 있는 편집 흐름 제공
- 선택된 구도와 프롬프트(연출/배경/조명/스타일) 기반 최종 이미지 생성
- 전 과정의 세션/히스토리 저장으로 재편집 및 반복 실험 지원

## 핵심 처리 단계

1. 원본 선화 업로드 및 세션 생성
2. 선화 인식 기반 도형화 이미지(포즈 후보) 자동 생성
3. 유저의 구도/관절 수정 및 최종 포즈 선택
4. 선택 포즈 + 원본 선화 + 프롬프트로 최종 이미지 생성
5. 결과 이미지와 이력 데이터 저장

## 기대 결과

- 선택 구도를 충실히 반영한 자연스러운 결과 이미지
- 캐릭터 비율/구조 보존
- 스타일, 조명, 배경의 일관된 연출
- 세션 기반 재실행 및 버전별 비교 가능

## 출력 데이터 형식

프로젝트의 최종 출력은 아래와 같은 세션 기록 중심 JSON 형식을 따릅니다.

- output_image
- line_art
- chosen_pose
- prompt_used
- generation_time
- history

---

## API 문서

프론트엔드 개발자는 [API_SPECIFICATION.md](./API_SPECIFICATION.md)에서 전체 API 명세와 TypeScript 타입을 확인할 수 있습니다.

### 주요 특징

- **Google OAuth 로그인**: Bearer JWT 토큰 발급 및 관리
- **비동기 큐 기반 처리**: BullMQ를 통한 포즈 생성/렌더링
- **상태 폴링**: Redis 캐시로 빠른 상태 조회
- **다단계 히스토리**: 세션 전체 작업 내역 기록

### 좌표계 규약

모든 `keypoints`의 `x, y` 좌표는 **정규화 형식(0~1)**입니다.
- `x=0`: 이미지 좌측 끝
- `x=1`: 이미지 우측 끝
- `y=0`: 이미지 상단 끝
- `y=1`: 이미지 하단 끝

프론트에서는 이를 캔버스 크기에 맞춰 변환하여 사용합니다:
```typescript
const screenX = keypoint.x * canvasWidth;
const screenY = keypoint.y * canvasHeight;
```

### CORS & Origin

기본 개발환경 설정:
- FE origin: `http://localhost:5173`
- BE origin 허용: `.env`의 `CORS_ORIGIN` 설정

### 보안

모든 세션/포즈/렌더 API는 JWT Bearer 토큰으로 보호됩니다.
```http
Authorization: Bearer {access_token}
```

