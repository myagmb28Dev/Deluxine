# Render History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-scoped backend API that lists all persisted completed render outputs across the authenticated user's sessions.

**Architecture:** `RenderController` accepts a validated cursor query and passes the Firebase user ID to `RenderService`. The service joins `render_jobs` to `sessions`, filters by session owner and completed output availability, applies deterministic keyset pagination, and presigns each R2 key before returning the API page.

**Tech Stack:** NestJS 11, TypeORM 0.3, class-validator, Jest, Cloudflare R2 presigned URLs.

## Global Constraints

- Backend only; do not modify frontend files.
- Preserve existing render creation and job status contracts.
- Return only completed jobs with output keys from sessions owned by the authenticated user.
- Use a maximum page size of 50 and deterministic `createdAt DESC, id DESC` cursor pagination.

---

### Task 1: History Query and Service

**Files:**

- Create: `src/modules/render/dto/list-render-history.dto.ts`
- Test: `src/modules/render/render.service.spec.ts`
- Modify: `src/modules/render/render.service.ts`

**Interfaces:**

- Produces: `RenderService.listHistory(userId: string, query: ListRenderHistoryDto)` returning `{ items, next_cursor }`.

- [ ] Write failing tests for ownership filtering query parameters, deterministic cursor predicates, limit-plus-one pagination, and signed output presentation.
- [ ] Run `bun test src/modules/render/render.service.spec.ts --runInBand` and confirm the missing method failure.
- [ ] Implement DTO validation, opaque cursor encoding/decoding, TypeORM query-builder filtering, and R2 URL signing.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Authenticated Controller Contract

**Files:**

- Test: `src/modules/render/render.controller.spec.ts`
- Modify: `src/modules/render/render.controller.ts`

**Interfaces:**

- Produces: `GET /render/history?limit=20&cursor=...` guarded by the controller's existing Firebase authentication guard.

- [ ] Write a failing controller test proving the authenticated user ID and query are delegated to the service.
- [ ] Run the focused controller test and confirm the route method is missing.
- [ ] Add the top-level history route without changing `/sessions/:sessionId/render` routes.
- [ ] Re-run focused controller tests.

### Task 3: Frontend Contract Documentation and Verification

**Files:**

- Create: `docs/FRONTEND_RENDER_HISTORY_API.md`
- Modify: `docs/superpowers/specs/2026-07-11-render-history-design.md`

**Interfaces:**

- Documents the exact request, response, pagination, ownership, empty/error behavior, and signed URL expiry expectations for frontend implementers.

- [ ] Remove frontend implementation scope from the design document.
- [ ] Add the reusable frontend API contract with JSON examples.
- [ ] Run `bun test --runInBand` and `bun run build`.
- [ ] Review `git diff --check` and commit only backend repository changes.
