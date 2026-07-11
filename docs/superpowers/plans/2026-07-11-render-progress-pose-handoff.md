# Render Progress And Pose Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent pose-uncontrolled render requests while showing only backend-provided progress.

**Architecture:** Pose-analysis progress may use the backend percentage. Render generation has no backend percentage, so it uses an indeterminate animation with no estimated number. Treat the editor pose projection as required input, log capture metadata without logging image contents, and document the remaining backend reference-priority issue.

**Tech Stack:** React, TypeScript, Bun test, Vite

## Global Constraints

- Do not change backend API field names.
- Never log base64 image contents.
- Do not commit; the user will commit.

---

### Task 1: Render Progress Presentation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [x] Remove elapsed-time render progress estimation.
- [x] Keep render progress at zero until the backend reports completion.
- [x] Display an indeterminate animation and `처리 중` instead of a percentage during rendering.

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
- [x] Verify the app build and render presentation without consuming another user render quota.
