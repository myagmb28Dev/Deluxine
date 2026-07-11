# 렌더 작업 실패 시 사용자 일일 사용량 미복구 문제

## 요약

렌더 작업이 큐에 정상 등록된 뒤 worker에서 최종 실패하면 결과 이미지가 생성되지 않지만, 사용자 일일 렌더 사용량은 1회 차감된 상태로 남습니다.

프론트는 `GET /sessions/{sessionId}/render/usage` 응답을 그대로 표시하고 있으므로 프론트 표시 오류가 아닙니다. 백엔드의 사용량 예약 및 실패 보상 경계를 수정해야 합니다.

## 재현 정보

- 환경: 로컬 프론트 및 로컬 백엔드
- 세션 ID: `3905f650-2537-47c8-bcd4-ed5283344036`
- 렌더 job ID: `46a8ed7d-41ee-4cdb-9df0-ded49b7409d9`
- 선택 모델: `bytedance-seed/seedream-4.5:free`
- 요청 프롬프트: 빈 문자열
- 요청 전 사용량: `0/2`
- 요청 후 사용량: `1/2`
- 최종 작업 상태: `failed`
- 결과 이미지: 없음
- 프론트 표시 메시지: `렌더링 중 오류가 발생했습니다. 다시 시도해 주세요.`

관찰된 프론트 로그 흐름:

```text
[App] Saving final pose before rendering...
[App] Requesting render with prompt:
[App] Render job created
[App] Render job status: running
[App] Render job status: running
[App] Render job status: failed
[App] Render job failed
```

실제 terminal 응답:

```json
{
  "job_id": "46a8ed7d-41ee-4cdb-9df0-ded49b7409d9",
  "status": "failed",
  "output_image": null,
  "model": "bytedance-seed/seedream-4.5:free",
  "created_at": "2026-07-10T22:07:23.194Z",
  "updated_at": "2026-07-10T22:07:28.370Z"
}
```

job은 약 5.2초 동안 `pending -> running -> failed`로 진행됐습니다. `POST /render`와 polling은 정상 동작했으며, 실패는 큐 등록 이후 backend worker/provider 처리 구간에서 발생했습니다.

응답에는 `error_code`, `message`, `failure_reason` 등이 없어 프론트가 실제 실패 원인을 표시하거나 로그로 남길 수 없습니다.

## 재현 절차

1. 일일 사용량이 `0/2`인 사용자로 로그인합니다.
2. 업로드 및 포즈 생성이 완료된 세션을 엽니다.
3. 모델을 선택하고 렌더 요청을 보냅니다.
4. `POST /sessions/{sessionId}/render`가 `pending` job을 반환하는 것을 확인합니다.
5. `GET /sessions/{sessionId}/render/jobs/{jobId}`를 polling합니다.
6. job이 최종적으로 `failed` 또는 `quota_exceeded`가 되도록 provider 실패를 재현합니다.
7. `GET /sessions/{sessionId}/render/usage`를 다시 호출합니다.

## 실제 결과

- 결과 이미지가 생성되지 않습니다.
- job은 `failed` 또는 `quota_exceeded` terminal status가 됩니다.
- 사용량은 1회 증가한 상태로 유지됩니다.
- 사용자는 실패한 요청 때문에 하루 2회 한도 중 1회를 잃습니다.

## 기대 결과

- 성공적으로 결과 이미지가 생성된 작업만 사용자 일일 사용량에 포함합니다.
- 큐 등록 후 worker가 최종 실패한 경우 예약된 1회를 정확히 한 번 복구합니다.
- BullMQ 재시도 중간 실패에는 복구하지 않고, 모든 재시도가 끝난 최종 실패에만 복구합니다.
- 동일 job의 실패 처리가 중복 실행되더라도 사용량이 두 번 이상 감소하지 않아야 합니다.

## 확인된 원인

### 요청 접수 시 사용량 예약

`src/modules/render/render.controller.ts`

```ts
await this.renderUsageService.reserveUserRequest(req.user.id);

try {
  // history 저장 및 render job enqueue
  return await this.renderService.render(...);
} catch (error: unknown) {
  await this.renderUsageService.releaseUserRequest(req.user.id);
  throw error;
}
```

현재 구조는 DB 저장 또는 BullMQ enqueue 단계에서 예외가 발생한 경우에만 사용량을 복구합니다.

### worker 최종 실패 시 복구 누락

`src/modules/render/render.processor.ts`

worker의 `catch`에서는 job 상태와 오류 metadata만 저장하고 사용량을 복구하지 않습니다.

```ts
const status = message === 'QUOTA_EXCEEDED' ? 'quota_exceeded' : 'failed';
renderJob.status = status;
await this.renderJobRepository.save(renderJob);
await this.redisService.set(...);
throw error;
```

따라서 enqueue가 성공한 뒤 provider 호출, R2 읽기/쓰기 또는 후속 처리에서 실패하면 예약된 사용량이 그대로 남습니다.

## 권장 수정 방향

### 1. worker에서 최종 실패 여부 판별

BullMQ job은 현재 `attempts: 5`로 설정되어 있으므로 매 실패마다 사용량을 복구하면 안 됩니다.

예시 판별 기준:

```ts
const maxAttempts = job.opts.attempts ?? 1;
const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
```

BullMQ 버전에 따라 processor 실행 중 `attemptsMade` 의미가 다를 수 있으므로 실제 버전 동작을 테스트로 고정해야 합니다.

### 2. 최종 실패 시에만 예약 사용량 복구

`RenderProcessor`에 `RenderUsageService`를 주입하고, 최종 `failed` 또는 `quota_exceeded` 처리 시 해당 `userId`의 예약을 복구합니다.

### 3. job 단위 멱등성 보장

단순히 `DECR`만 호출하면 worker 재실행, stalled job 복구 또는 중복 실패 이벤트에서 여러 번 환불될 수 있습니다.

권장 방식:

- Redis에 `render:usage:refund:job:{jobId}` 같은 job 단위 키를 둡니다.
- `SET NX` 또는 Lua script/transaction으로 환불 여부 확인과 카운터 감소를 원자적으로 처리합니다.
- 카운터는 절대 0 미만으로 내려가지 않게 보장합니다.
- 환불 키 TTL은 일일 사용량 키보다 같거나 길게 설정합니다.

예시 API:

```ts
releaseUserRequestForFailedJob(userId: string, jobId: string): Promise<boolean>
```

반환값은 실제 환불이 적용됐는지 여부로 사용할 수 있습니다.

### 4. 실패 원인 노출 개선

현재 job 상태 응답에는 `status: failed`만 있고 worker가 저장한 `metadata.lastError`가 포함되지 않습니다. 민감한 stack이나 provider 원문 전체를 노출하지 않는 범위에서 안전한 `error_code` 또는 사용자용 `message`를 추가하면 프론트가 일반 오류 대신 원인을 구분해 표시할 수 있습니다.

## 주의 사항

- 첫 번째 worker 실패에서 환불하면 이후 retry가 성공했을 때 무료 성공 요청이 됩니다.
- 각 retry마다 환불하면 카운터가 음수가 될 수 있습니다.
- `quota_exceeded`도 사용자 일일 한도와 별개인 provider 문제이므로 결과 이미지가 생성되지 않았다면 동일하게 복구 대상이어야 합니다.
- worker가 성공한 뒤 프론트가 결과 이미지를 표시하지 못한 경우는 백엔드 생성 실패가 아니므로 환불 대상에 포함하면 안 됩니다.
- 날짜가 UTC 자정을 넘어간 장시간 job은 예약 당시 날짜의 카운터를 복구해야 합니다. 현재 `releaseUserRequest(userId)`는 호출 시점의 날짜를 사용하므로 잘못된 날짜 키를 감소시킬 수 있습니다. 예약 날짜 또는 usage key를 job payload/metadata에 저장하는 것이 안전합니다.

## 필수 테스트

1. enqueue 전에 실패하면 controller가 사용량을 1회 복구합니다.
2. worker 첫 실패 후 retry 예정이면 사용량을 복구하지 않습니다.
3. worker 최종 `failed`이면 사용량을 정확히 1회 복구합니다.
4. worker 최종 `quota_exceeded`이면 사용량을 정확히 1회 복구합니다.
5. 최종 실패 보상 로직이 두 번 호출돼도 카운터는 한 번만 감소합니다.
6. 성공한 job은 사용량을 복구하지 않습니다.
7. 사용량 카운터는 0 미만으로 내려가지 않습니다.
8. UTC 자정을 넘긴 job도 예약 당시 날짜의 카운터를 복구합니다.
9. 환불 직후 usage API의 `used`와 `remaining`이 올바르게 반환됩니다.

## 완료 조건

- 실패한 렌더 job으로 사용량이 소모되지 않습니다.
- 성공한 렌더 job만 하루 2회 한도에 반영됩니다.
- retry 및 중복 처리 상황에서도 정확히 한 번만 복구됩니다.
- 기존 `POST /render`, job status, usage API 응답 계약은 유지됩니다.
- 이번 재현 사용자의 잘못 차감된 1회가 운영 또는 로컬 Redis에서 복구됩니다.
