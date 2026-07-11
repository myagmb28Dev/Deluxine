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

## Frontend Contract Boundary

Frontend implementation is out of scope for this backend change. The backend provides the authenticated history endpoint, stable pagination contract, session identifiers, and fresh signed output URLs. The frontend team owns tab layout, loading and error states, session navigation, and selected-image presentation.

## Error Handling

- A failed history request does not block session editing.
- Expired signed image URLs are refreshed by reloading the history page from the API.
- An output that disappears between query and signing is omitted from that response and logged server-side.
- Unauthorized users receive the existing authentication response; cross-user jobs are never returned.

## Verification

Backend tests cover ownership filtering, completed-only filtering, deterministic pagination, page-size validation, and signed URL presentation.

The backend build and complete backend test suite must pass. The frontend contract is documented separately in `docs/FRONTEND_RENDER_HISTORY_API.md`.
