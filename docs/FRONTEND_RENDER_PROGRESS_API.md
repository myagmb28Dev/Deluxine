# Frontend Render Progress API Contract

## Endpoint

Use the existing authenticated render job polling endpoint.

```http
GET /sessions/:sessionId/render/jobs/:jobId
Authorization: Bearer <Firebase ID token>
```

No new request endpoint is required. The response now includes three additive fields, so existing consumers remain compatible.

## Added Response Fields

```json
{
  "job_id": "46a8ed7d-41ee-4cdb-9df0-ded49b7409d9",
  "status": "running",
  "progress": 35,
  "phase": "generating",
  "progress_message": "AI가 이미지를 생성하고 있습니다.",
  "output_image": null,
  "model": null,
  "created_at": null,
  "updated_at": null
}
```

| Field              | Type   | Description                               |
| ------------------ | ------ | ----------------------------------------- |
| `progress`         | number | Server progress value from `-1` to `100`. |
| `phase`            | string | Current server processing phase.          |
| `progress_message` | string | Korean user-facing phase message.         |

## Server Progress Stages

| Phase        | Progress | Meaning                                                |
| ------------ | -------: | ------------------------------------------------------ |
| `queued`     |        5 | The job is queued or waiting for a retry.              |
| `preparing`  |       15 | The server is preparing signed input and request data. |
| `generating` |       35 | OpenRouter/provider image generation is running.       |
| `uploading`  |       90 | The generated image is being stored in R2.             |
| `completed`  |      100 | The output is stored and available.                    |
| `failed`     |       -1 | The final attempt failed or quota was exhausted.       |

These values represent server pipeline stages, not provider-reported generation percentages. OpenRouter does not provide intermediate image-generation progress.

## Frontend Polling Rules

1. Start polling after `POST /sessions/:sessionId/render` returns `job_id`.
2. Poll the existing job endpoint at the current interval.
3. Render the gauge directly from `progress`.
4. Display `progress_message` as the status label.
5. Stop polling on `completed`, `failed`, or `quota_exceeded`.
6. On `completed`, use `output_image` and set the gauge to 100.
7. On a negative progress value, show the failure state rather than a partially filled gauge.

The frontend may animate visually between the latest value and the next value, but it must not present interpolated values as actual provider progress.

## TypeScript Contract

```ts
export type RenderProgressPhase =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'uploading'
  | 'completed'
  | 'failed';

export type RenderJobResponse = {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'quota_exceeded';
  progress: number;
  phase: RenderProgressPhase;
  progress_message: string;
  output_image: string | null;
  model: string | null;
  created_at: string | null;
  updated_at: string | null;
};
```

## Legacy and Retry Behavior

- Jobs created before this change may not have a Redis progress snapshot. The backend derives a compatible fallback from their status.
- A non-final provider failure returns to `queued` at 5 while BullMQ waits to retry.
- A final failure returns `failed` and `-1`.
- `quota_exceeded` also uses phase `failed` and progress `-1`, with a quota-specific message when the live snapshot is available.
