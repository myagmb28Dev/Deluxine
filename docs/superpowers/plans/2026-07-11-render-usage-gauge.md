# Render Usage Gauge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the backend's per-user daily render usage contract and show an accurate purple neon `used / limit` gauge beside the render button.

**Architecture:** The API layer exposes catalog and usage endpoints, `App` owns usage loading/refresh/error state, and `PromptBar` renders the catalog plus gauge without estimating data. HTTP 429 user exhaustion remains distinct from asynchronous service `quota_exceeded` failures.

**Tech Stack:** React 19, TypeScript, Axios, Vite, Tailwind CSS, Bun test.

## Global Constraints

- Use `usage_policy`, not `free_tier_limits`.
- Load usage from `GET /sessions/{sessionId}/render/usage`.
- Refresh usage after render creation succeeds and after HTTP 429.
- Display `daily.used / daily.limit`; never estimate usage.
- HTTP 429 means user daily exhaustion; job `quota_exceeded` means service/provider exhaustion.
- Keep all provider API keys backend-only.
- Do not commit changes.

---

### Task 1: Contract and Gauge Helpers

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/lib/renderModel.ts`
- Modify: `src/lib/renderModel.test.ts`

- [ ] Add failing tests for clamped usage ratio and exhausted usage.
- [ ] Run `bun test src/lib/renderModel.test.ts` and confirm failure.
- [ ] Replace `RenderFreeTierLimits` with `RenderUsagePolicy`; add `RenderUsageResponse`.
- [ ] Implement `getRenderUsageRatio` and `isRenderUsageExhausted`.
- [ ] Run the focused test and confirm pass.

### Task 2: API and App State

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/App.tsx`

- [ ] Add `renderApi.getUsage(sessionId)`.
- [ ] Load catalog and usage together for the active session.
- [ ] Refresh usage after a successful POST render request.
- [ ] Detect Axios HTTP 429, refresh usage, and show the daily-limit/reset message.
- [ ] Keep `quota_exceeded` service-wide wording unchanged.
- [ ] Disable render when remaining usage is zero.

### Task 3: Purple Neon Composer and Gauge

**Files:**
- Modify: `src/components/layout/PromptBar.tsx`
- Modify: `src/App.tsx`

- [ ] Replace the gray composer surface with the app's black/indigo/purple neon palette.
- [ ] Add a circular SVG gauge immediately left of the render arrow.
- [ ] Render `used/limit` in the gauge and expose remaining/reset details in the title.
- [ ] Preserve model menu, upload, responsive layout, loading, and accessibility behavior.

### Task 4: Verification

- [ ] Run `bun test`.
- [ ] Run `bun run build`.
- [ ] Run targeted ESLint.
- [ ] Run `git diff --check`.
- [ ] Verify the local UI when the local backend is available.
