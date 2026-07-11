# Render Progress And Pose Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show useful render progress without a backend percentage and prevent pose-uncontrolled render requests.

**Architecture:** Keep elapsed-time progress calculation in a pure utility and use it only for non-terminal render states. Treat the editor pose projection as required input, log capture metadata without logging image contents, and document the remaining backend reference-priority issue.

**Tech Stack:** React, TypeScript, Bun test, Vite

## Global Constraints

- Do not change backend API field names.
- Never log base64 image contents.
- Do not commit; the user will commit.

---

### Task 1: Render Progress Estimator

**Files:**
- Create: `src/lib/renderProgress.ts`
- Create: `src/lib/renderProgress.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `estimateRenderProgress(status, elapsedMs, currentProgress): number`

- [x] Write tests proving pending/running progress is monotonic, bounded below 100, and terminal completion remains handled by the app.
- [x] Run `bun test src/lib/renderProgress.test.ts` and verify the tests fail before implementation.
- [x] Implement the estimator with a pending range of 8-20 and a running range of 20-90.
- [x] Replace render polling's unconditional `setProgress(0)` with the estimator.
- [x] Run `bun test src/lib/renderProgress.test.ts` and verify it passes.

### Task 2: Required Pose Projection

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CanvasEditorHandle.capturePoseProjection(): Promise<string | null>`

- [x] Reject rendering before the POST when capture returns null.
- [x] Log only the captured data URL MIME type and character count.
- [x] Preserve the existing request field `poseProjectionImage`.

### Task 3: Backend Handoff And Verification

**Files:**
- Create: `docs/BACKEND_POSE_REFERENCE_PRIORITY_ISSUE.md`

- [x] Document reproduction, confirmed frontend payload path, observed model behavior, and requested backend changes.
- [x] Run `bun test`, `bun run build`, and `git diff --check`.
- [x] Verify progress calculation with automated tests; avoid consuming a user render quota for a visual-only check.
