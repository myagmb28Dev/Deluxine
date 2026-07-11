# Render History Design

## Goal

Allow an authenticated user to browse all completed render outputs across their sessions, then open an output in its original session. History must come from persisted render jobs rather than browser local storage.

## Backend API

Add `GET /render/history` behind `FirebaseAuthGuard`.

Query parameters:

- `limit`: optional integer, default 20, minimum 1, maximum 50.
- `cursor`: optional opaque cursor representing the last returned job.

Response:

```json
{
  "items": [
    {
      "job_id": "uuid",
      "session_id": "uuid",
      "session_title": "Session title",
      "output_image": "signed R2 URL",
      "model": "provider/model",
      "prompt": "render prompt",
      "created_at": "ISO-8601 timestamp"
    }
  ],
  "next_cursor": "opaque cursor or null"
}
```

Only jobs satisfying all of the following are returned:

- The job belongs to a session owned by the authenticated user.
- The job status is `completed`.
- `outputImageKey` is present.

Items are ordered by `createdAt DESC, id DESC`. The cursor contains both fields so pagination remains deterministic. Output URLs are freshly presigned when the response is built. Failed, pending, running, and quota-exceeded jobs are excluded.

## Backend Boundaries

- `RenderController` exposes the user-scoped endpoint.
- `RenderService` queries completed jobs joined to their sessions and creates signed output URLs.
- A query DTO validates and caps the requested page size.
- The existing job-status endpoint and render creation contract remain unchanged.
- No database migration is required because `render_jobs.sessionId`, status, timestamps, metadata, and output keys already exist.

## Frontend Experience

The sidebar session area becomes a two-tab control:

- `세션`: preserves the current session list and management behavior.
- `히스토리`: shows completed outputs from every session, newest first.

Each history item shows a thumbnail, session title, model name, and Korean-localized creation time. Selecting an item navigates to its `sessionId`, restores the session editor, and displays that exact output as the selected final image. This selection must not depend on the local-storage last-job entry.

The history tab includes loading, empty, error with retry, and `더 보기` states. Newly completed renders are prepended or the first page is refreshed so the user sees the result without reloading the application.

## Frontend Data Flow

1. Opening the history tab requests `GET /render/history?limit=20`.
2. `더 보기` supplies `next_cursor` and appends unique jobs.
3. Selecting a history item sets the URL session query parameter and records the selected history output.
4. Session restoration loads pose and line-art data as it does today.
5. After restoration, the explicitly selected history image takes precedence over local-storage job recovery.
6. A direct session selection without a selected history item may show the newest completed render returned by a session-aware lookup or remain without an output until history is selected. This feature guarantees recovery through the history tab.

## Error Handling

- A failed history request does not block session editing.
- Expired signed image URLs are refreshed by reloading the history page from the API.
- An output that disappears between query and signing is omitted from that response and logged server-side.
- Unauthorized users receive the existing authentication response; cross-user jobs are never returned.

## Verification

Backend tests cover ownership filtering, completed-only filtering, deterministic pagination, page-size validation, and signed URL presentation.

Frontend tests cover tab switching, loading and empty states, pagination append behavior, retry, and selecting an output to restore its session and image. Production builds for both repositories must pass.

