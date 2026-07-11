# Frontend Render History API Contract

## Purpose

Use this API to show every completed render output owned by the logged-in user, across all sessions. This replaces reliance on the browser's last render job ID when restoring old outputs.

## Endpoint

```http
GET /render/history?limit=20&cursor=<next_cursor>
Authorization: Bearer <Firebase ID token>
```

`cursor` is omitted on the first request. The endpoint uses the same Firebase bearer token as the other authenticated Deluxine APIs.

## Query Parameters

| Name     | Required | Description                                                                 |
| -------- | -------- | --------------------------------------------------------------------------- |
| `limit`  | No       | Number of results. Default `20`, minimum `1`, maximum `50`.                 |
| `cursor` | No       | Opaque `next_cursor` from the previous response. Do not parse or modify it. |

Invalid limits or cursors return HTTP `400`.

## Success Response

```json
{
  "items": [
    {
      "job_id": "46a8ed7d-41ee-4cdb-9df0-ded49b7409d9",
      "session_id": "3905f650-2537-47c8-bcd4-ed5283344036",
      "session_title": "세션 1",
      "output_image": "https://signed-r2-url.example/render.webp",
      "model": "bytedance-seed/seedream-4.5",
      "prompt": "Keep the original line-art style.",
      "created_at": "2026-07-11T09:00:00.000Z"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkQXQiOi..."
}
```

Field behavior:

- `items` is ordered newest first.
- `session_title` always identifies the owning session. A saved title is returned as-is; otherwise the backend returns `세션 <session_id first 8 characters>`.
- `output_image` is a freshly signed R2 URL and should not be persisted as a permanent URL.
- `model` falls back to the backend default model for legacy jobs without model metadata.
- `next_cursor` is `null` when there are no more results.

Only jobs with `status = completed` and a stored output key are returned. Pending, running, failed, and quota-exceeded jobs are excluded. The backend filters by the authenticated user's session ownership; the frontend must not send a user ID.

## Pagination

First page:

```http
GET /render/history?limit=20
```

Next page:

```http
GET /render/history?limit=20&cursor=<previous next_cursor>
```

Append the next page by `job_id` and stop when `next_cursor` is `null`. Reload the first page when signed image URLs expire or after a new render completes.

## Empty and Error Behavior

An account with no completed outputs receives:

```json
{
  "items": [],
  "next_cursor": null
}
```

- `400`: invalid query or cursor.
- `401`: missing, expired, or invalid Firebase token.
- `500`: unexpected server or storage failure.

One output whose R2 URL cannot be signed is omitted from that response; other history items remain available.

## Suggested Frontend Type

```ts
export type RenderHistoryItem = {
  job_id: string;
  session_id: string;
  session_title: string;
  output_image: string;
  model: string;
  prompt: string;
  created_at: string;
};

export type RenderHistoryResponse = {
  items: RenderHistoryItem[];
  next_cursor: string | null;
};
```
