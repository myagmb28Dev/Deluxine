# Deluxine Backend (Nest.js) — R2 완전 전환 가이드 (매우 자세함)

이 문서는 **Deluxine 백엔드(Nest.js/TypeORM/BullMQ)**가 현재의 **로컬 `uploads/` 저장 + 정적 서빙** 방식에서, **Cloudflare R2(S3 호환)** 기반으로 **유저 업로드/읽기/렌더 결과 저장까지 전부 전환**하기 위한 변경사항을 “작동 가능한 수준”으로 정리한 것입니다.

프론트는 이미 **presigned PUT 업로드 + 업로드 완료 notify + signed GET로 조회**를 전제로 바뀌었습니다.

---

## 0) TL;DR (결론)

- 로컬 디스크(`uploads/`)에 저장/읽기/서빙하는 로직을 **전부 제거**
- DB에는 “URL”이 아니라 **R2 object key**를 저장
- 응답으로 내려주는 `lineArtUrl`, `output_image` 등은 **짧은 만료의 signed GET URL**로 생성해서 내려줌
- 업로드는 프론트가 R2로 직접 `PUT`:
  1) `POST /sessions/presign` → 세션 생성 + presigned PUT 발급
  2) 프론트가 R2에 `PUT`
  3) `POST /sessions/:id/uploads/complete` → 백엔드가 `HeadObject` 확인 + 포즈 생성 큐 enqueue(기존 로직 유지)

---

## 1) 현재 백엔드 구조에서 “R2 전환”이 필요한 지점

### 1.1 세션 업로드(현재)
- `src/modules/session/session.controller.ts`
  - `POST /sessions`에서 `multipart/form-data`로 선화 파일 업로드
- `src/modules/session/session.service.ts`
  - `attachLineArtFile()`에서 `uploads/users/...`에 `writeFile()` 저장
  - `lineArtUrl`을 `/uploads/...` 로컬 경로로 저장
- `src/app.module.ts`
  - `ServeStaticModule.forRoot({ rootPath: ..., serveRoot: '/uploads' })` 로 로컬 uploads 서빙

### 1.2 렌더 파이프라인(현재)
- `src/modules/render/nano-banana.service.ts`
  - `line_art`를 **로컬 파일 경로**로 가정하고 `readFile()`로 base64 변환
  - 결과 이미지를 로컬 디렉터리에 `writeFile()` 저장하고 `/uploads/...` 경로 반환
- `src/modules/render/render.service.ts`
  - 큐에 `outputDir`을 `/uploads/.../renders`로 넣음
- `src/modules/render/render.processor.ts`
  - `outputImageUrl`을 로컬 `/uploads/...` URL로 저장

### 1.3 포즈 파이프라인(현재)
- `src/modules/pose/pose.service.ts`
  - 큐에 `lineArtUrl`을 넘기지만 실제 `pose.processor.ts`는 현재 그 값을 사용하지 않음(폴백 키포인트 생성)  
  - 다만 “정상적인 파이프라인”을 위해서는 line art가 R2에 있음을 전제로 하는 것이 좋음

---

## 2) 목표 아키텍처

### 2.1 저장 설계 (DB)
**URL 저장 금지** (signed URL은 만료됨)

- `Session`
  - `lineArtKey: string | null` (R2 object key)
  - `lineArtUrl: string` (응답용. DB에 저장해도 되지만 “항상 갱신 필요” → 권장: 저장하지 말고 응답 시 생성)

- `RenderJob`
  - `outputImageKey: string | null` (R2 object key)
  - `outputImageUrl: string | null` (응답용 signed GET URL)

### 2.2 업로드/조회 흐름
- 업로드: presigned `PUT` (브라우저 직접)
- 조회: presigned `GET` (짧은 TTL)
- 서버 내부 처리(렌더 등):
  - R2에서 object를 **버퍼로 가져와서(base64)** 외부 API 호출에 사용
  - 결과는 R2로 `PUT`하고 key 저장

---

## 3) 환경변수(.env) — 필수/권장

**필수**
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`
- `R2_BUCKET=<bucket-name>`

**권장**
- `R2_KEY_PREFIX=uploads` (없으면 기본값 `uploads`)
- `R2_SIGNED_GET_TTL_SEC=600` (10분)
- `R2_SIGNED_PUT_TTL_SEC=60` (1분)

**주의**
- `cfat_...` Cloudflare API Token은 “R2 presign 생성”엔 보통 필요 없습니다. (관리 API 호출할 때만 필요)

---

## 4) 패키지 추가

```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## 5) R2 모듈/서비스 추가 (권장 구현)

### 5.1 `R2Service` (S3Client + 버킷)
`src/modules/r2/r2.service.ts` (예시)

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class R2Service {
  readonly client: S3Client;
  readonly bucket: string;
  readonly prefix: string;
  readonly signedGetTtlSec: number;
  readonly signedPutTtlSec: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET')!;
    this.prefix = (this.config.get<string>('R2_KEY_PREFIX') || 'uploads').replace(/\/+$/, '');
    this.signedGetTtlSec = Number(this.config.get<string>('R2_SIGNED_GET_TTL_SEC') || 600);
    this.signedPutTtlSec = Number(this.config.get<string>('R2_SIGNED_PUT_TTL_SEC') || 60);

    this.client = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true,
    });
  }
}
```

### 5.2 presign 헬퍼
`src/modules/r2/r2.presign.ts` (예시)

```ts
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';

export async function presignPut(params: {
  client: S3Client;
  bucket: string;
  key: string;
  contentType: string;
  expiresInSec: number;
}) {
  const cmd = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });
  return getSignedUrl(params.client, cmd, { expiresIn: params.expiresInSec });
}

export async function presignGet(params: {
  client: S3Client;
  bucket: string;
  key: string;
  expiresInSec: number;
}) {
  const cmd = new GetObjectCommand({ Bucket: params.bucket, Key: params.key });
  return getSignedUrl(params.client, cmd, { expiresIn: params.expiresInSec });
}
```

### 5.3 object read/write (서버 내부 처리용)
렌더 엔진이 라인아트를 base64로 읽어야 하므로, `GetObject` 스트림을 버퍼로 바꾸는 유틸을 권장합니다.

```ts
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function getObjectAsBuffer(client: S3Client, bucket: string, key: string) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error('R2_NO_BODY');
  return streamToBuffer(res.Body as any);
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function headObject(client: S3Client, bucket: string, key: string) {
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}
```

---

## 6) 엔티티/마이그레이션 변경

### 6.1 `Session` 엔티티 변경
현재: `lineArtUrl: string` (로컬 URL)

권장:
- `lineArtKey: string | null` (DB 저장)
- `lineArtUrl: string`는 “응답용”으로만 만들고 DB에서 제거하거나 nullable로 유지

예시:
```ts
@Column({ type: 'varchar', length: 800, nullable: true })
lineArtKey: string | null;

@Column({ type: 'varchar', length: 800, nullable: true })
lineArtUrl: string | null; // (선택) 임시 호환용, 최종적으로 제거 권장
```

### 6.2 `RenderJob` 엔티티 변경(권장)
`outputImageUrl`만 저장하면 signed URL 만료로 문제 발생 → `outputImageKey` 추가 권장

예시:
```ts
@Column({ type: 'varchar', length: 800, nullable: true })
outputImageKey: string | null;
```

### 6.3 DB 마이그레이션
TypeORM의 `synchronize`를 쓰지 않는 환경이면 migration 생성/적용 필요.
- 기존 로컬 경로 데이터는 “이행”이 어렵습니다(파일이 로컬 디스크에만 있음).
- 운영 전환 시점에 기존 세션은 “마이그레이션 스크립트로 R2 업로드” 또는 “legacy 유지” 중 선택이 필요.

---

## 7) API 변경 (Controller/DTO/Service)

프론트가 기대하는 계약은 FE 문서에 이미 반영되어 있습니다.
- `Deluxine_FE/docs/r2-backend-contract.md`

여기서는 백엔드 구현 관점에서 “파일/코드 레벨로” 정리합니다.

### 7.1 DTO 추가
`src/modules/session/dto/session-presign.dto.ts` (예시)

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class SessionPresignRequestDto {
  @ApiProperty({ example: 'lineart.png' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ example: 123456 })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size: number;
}
```

`uploads/complete` DTO도 간단히:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SessionUploadCompleteDto {
  @ApiProperty({ example: 'line_art' })
  @IsIn(['line_art'])
  kind: 'line_art';
}
```

### 7.2 Controller 변경 (핵심)
`src/modules/session/session.controller.ts`

#### (A) 기존 `POST /sessions` 멀티파트 업로드 제거/비활성화
- 프론트는 더 이상 `multipart`를 보내지 않습니다.
- 안전하게 하려면:
  - `POST /sessions`는 410(Gone) 또는 404로 막거나,
  - title만 받는 세션 생성으로 재정의(권장하지 않음: 프론트 플로우가 presign 기반이라 불일치)

#### (B) 새 엔드포인트 추가
1) `POST /sessions/presign`
2) `POST /sessions/:id/uploads/complete`

대략 컨트롤러는 이런 느낌입니다:
```ts
@Post('presign')
async presign(@Body() dto: SessionPresignRequestDto, @Req() req: { user: User }) {
  return this.sessionService.createWithPresignedLineArt({
    userId: req.user.id,
    filename: dto.filename,
    contentType: dto.contentType,
    size: dto.size,
  });
}

@Post(':id/uploads/complete')
async complete(@Param('id') id: string, @Body() dto: SessionUploadCompleteDto, @Req() req: { user: User }) {
  return this.sessionService.completeUploadAndStartPipeline({
    sessionId: id,
    userId: req.user.id,
    kind: dto.kind,
  });
}
```

### 7.3 SessionService 변경 (핵심)
`src/modules/session/session.service.ts`에서 아래는 모두 제거:
- `getSessionDirectory()`
- `getSessionPublicPath()`
- `attachLineArtFile()`의 파일 시스템 로직
- `deleteSession()`의 `rm(sessionDirectory...)`

대신 아래 메서드를 추가/구현:

#### (A) createWithPresignedLineArt()
해야 할 일:
1) 세션 생성(DB 저장) — `lineArtKey`는 미리 생성해도 되고, complete 때 확정해도 됨(권장: presign 시 확정)
2) R2 object key 생성 규칙
3) presigned PUT URL 생성
4) 응답으로 `{ session, upload }` 반환

**오브젝트 키 규칙 권장**
```
{prefix}/users/{userId}/sessions/{sessionId}/line-art{ext}
```
예: `uploads/users/uuid/sessions/uuid/line-art.png`

ext는 `filename`에서 유도하되, contentType 기반으로 강제하는 것도 안전합니다.

#### (B) completeUploadAndStartPipeline()
해야 할 일:
1) 세션 소유자 검증
2) R2 `HeadObject`로 실제 업로드 완료 확인(권장)
3) history 기록: `session.line_art_uploaded`
4) 기존 자동 포즈 생성 로직 수행:
   - 지금 `SessionController.create()`에서 업로드 후 바로 `poseService.generate()`를 호출하던 부분을 이쪽으로 옮김
5) SSE/상태는 기존 로직(레디스 키 등)을 그대로 사용 가능

#### (C) findById() 응답 시 signed GET URL을 “생성해서” 넣기
현재 `findById()`는 캐시/DB에서 `Session` 엔티티를 그대로 반환합니다.
하지만 이제 `lineArtUrl`은 signed URL이어야 하므로:
- DB에는 `lineArtKey`만 저장
- 응답 시점에:
  - `session.lineArtUrl = presignGet(...)`로 생성

**주의:** 지금은 Redis 캐시에 `Session` 엔티티를 통째로 저장합니다. signed URL을 캐시에 저장하면 TTL 만료와 충돌합니다.

권장 해결:
- 캐시에는 **엔티티 원본(lineArtKey 포함)**만 저장
- 응답을 만들 때만 `lineArtUrl`을 “동적으로 생성”

즉, `findById()` 내부에서 캐시를 그대로 반환하지 말고:
1) cached/db 엔티티 획득
2) user 권한 체크
3) 반환 직전에 `lineArtKey`가 있으면 signed GET 붙여서 반환

---

## 8) Render 파이프라인 R2 전환 (매우 중요)

현재 `NanoBananaService`는 로컬 파일 경로를 read/write 합니다. 이를 “완전 제거”해야 합니다.

### 8.1 Render 입력: line art를 “signed URL”로 넘기지 말 것
렌더 내부 처리는 서버가 수행하므로, 안정적으로는:
- `RenderService.render()`에 `lineArtKey`를 넘기는 구조로 변경
- `RenderController.create()`에서 세션 조회 후 `session.lineArtKey`를 전달

### 8.2 NanoBananaService 변경 방향
#### (A) line art 읽기
- `request.line_art`를 로컬 경로로 해석하지 말고,
- `R2Service`로 `GetObject` → buffer → base64 변환

#### (B) 결과 이미지 저장
- 더 이상 `output_dir`에 `mkdir/writeFile` 하지 않음
- Gemini 응답 base64를 그대로 `Buffer.from(base64, 'base64')`로 바꿔서 R2에 `PutObject`
- `outputImageKey`를 만들고 DB에 저장

권장 output key:
```
{prefix}/users/{userId}/sessions/{sessionId}/renders/render-{uuid}.png
```

### 8.3 RenderJobStatus 응답 (signed GET)
`GET /sessions/:id/render/jobs/:jobId`가 반환하는 `output_image`는 이제:
- `outputImageKey`가 있으면 `presignGet()` 해서 내려줌
- `RenderJob.outputImageUrl`을 DB에 영구 저장하는 방식은 권장하지 않음(만료)

---

## 9) ServeStaticModule 제거

`src/app.module.ts`에서:
```ts
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'uploads'),
  serveRoot: '/uploads',
}),
```
이 블록을 제거합니다.

또한 레포 루트의 `uploads/` 디렉터리는 더 이상 필요 없습니다(단, 임시 호환 기간이 있으면 남겨도 됨).

---

## 10) CORS (R2)

브라우저에서 presigned `PUT`을 호출하므로 R2 bucket에 CORS 설정이 필요합니다.

필수 개념:
- AllowedOrigins: FE 도메인 (dev: `http://localhost:5173`)
- AllowedMethods: `PUT`, `GET`, `HEAD`
- AllowedHeaders: `Content-Type`, `x-amz-*` (환경에 따라 필요)
- ExposeHeaders: `ETag` (선택)

**주의:** presigned PUT에서 `Content-Type`을 서명에 포함했으면, 브라우저 PUT에도 동일하게 보내야 합니다.

---

## 11) 보안/운영 체크리스트

- Access Key/Secret은 **절대 프론트에 두지 말 것**
- 키가 이미 채팅/로그에 노출되었으면 **즉시 폐기/재발급**
- signed GET TTL은 짧게(5~10분) 권장
- object key에는 사용자 식별자를 포함(권한 검증/정리 용이)
- `DELETE session` 시:
  - DB 삭제 + (권장) R2 객체도 삭제(`DeleteObjects`)해서 비용/누적 방지

---

## 12) 프론트와의 인터페이스(최종 확인)

프론트는 다음을 이미 사용합니다:
- `POST /sessions/presign` (세션 생성 + presigned PUT)
- R2 `PUT` (브라우저)
- `POST /sessions/:id/uploads/complete` (파이프라인 시작 트리거)
- `GET /sessions/:id`의 `lineArtUrl`은 **signed GET URL**이어야 함
- `GET /sessions/:id/render/jobs/:jobId`의 `output_image`도 **signed GET URL**이어야 함

추가로, 프론트에서 렌더 완료 후 표시하는 `finalImage`도 `output_image`에 의존합니다.

---

## 13) 구현 순서(추천)

1) 엔티티 변경 (`Session.lineArtKey`, `RenderJob.outputImageKey`)
2) R2 모듈 추가 (`R2Service`, presign/helper)
3) `SessionController/Service`에 presign + complete 구현
4) `findById()` 반환에서 signed GET URL 생성
5) Render 파이프라인 수정:
   - line art를 key로 읽기
   - 결과를 R2에 저장하고 key 저장
   - jobs status 응답에 signed GET 붙이기
6) `ServeStaticModule` 제거 + 로컬 uploads 의존 제거
7) 통합 테스트:
   - 업로드 → complete → 세션 조회(lineArtUrl 표시)
   - 렌더 요청 → polling → completed 시 output_image 표시

---

## 14) “이 문서대로 했는데도 안 붙을 때” 체크 포인트

- presigned PUT 요청이 브라우저에서 CORS에 막혔는지 (Network 탭)
- PUT 요청에 `Content-Type`이 presign 생성 시점과 동일한지
- `uploads/complete`가 R2 `HeadObject`에서 404 나는지 (key 불일치)
- `findById()`가 캐시된 “옛 URL”을 그대로 반환하고 있지 않은지 (signed URL은 동적 생성 필요)
- `render` 경로에서 아직 로컬 파일을 읽거나 쓰고 있지 않은지 (`readFile`, `writeFile`, `mkdir` 검색)

