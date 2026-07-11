# Render Model Prompt Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the backend render-model catalog and replace the sidebar upload control with a reference-style bottom composer containing upload, model selection, prompt, and submit controls.

**Architecture:** `App` remains the workflow owner, `PromptBar` owns only composer interaction, and `Sidebar` returns to session/navigation responsibilities. API contracts live in `types/api.ts` and `api/client.ts`; small pure render helpers make selection and error behavior testable with Bun's built-in test runner.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Axios, Tailwind CSS 4, Lucide React, Bun test.

## Global Constraints

- Use `GET /sessions/{sessionId}/render/models` as the model catalog source of truth.
- Send the exact selected model ID in POST `/sessions/{sessionId}/render`.
- Never add an OpenRouter API key to frontend code or environment variables.
- Never display an estimated remaining request count.
- Keep `quota_exceeded` terminal and explain shared free-tier limits.
- Preserve the existing presigned line-art upload flow.
- Do not create git commits; the user will commit the finished work.

---

### Task 1: Render Contract Helpers and Types

**Files:**
- Create: `src/lib/renderModel.ts`
- Create: `src/lib/renderModel.test.ts`
- Modify: `src/types/api.ts`

**Interfaces:**
- Produces: `selectCatalogModel(catalog, current): RenderModelId | null`
- Produces: `normalizeApiMessage(value, fallback): string`
- Produces: exact backend model catalog and render job types.

- [ ] **Step 1: Write failing Bun tests**

Test default selection, preservation of a valid current selection, replacement of an invalid selection, string-array normalization, and fallback handling.

- [ ] **Step 2: Run tests and verify failure**

Run: `bun test src/lib/renderModel.test.ts`

Expected: FAIL because `src/lib/renderModel.ts` does not exist.

- [ ] **Step 3: Add exact backend contract types**

Add `RenderModelId`, `RenderModelOption`, `RenderFreeTierLimits`, `RenderModelListResponse`, nullable render status metadata, `model` in create request/response, and `ApiError.message: string | string[]`.

- [ ] **Step 4: Implement minimal helpers**

`selectCatalogModel` must only return IDs present in `catalog.models`; `normalizeApiMessage` joins non-empty arrays with a space and otherwise returns the fallback.

- [ ] **Step 5: Run focused tests**

Run: `bun test src/lib/renderModel.test.ts`

Expected: all tests PASS.

### Task 2: API Client Contract

**Files:**
- Modify: `src/api/client.ts`

**Interfaces:**
- Consumes: `RenderModelListResponse`, `CreateRenderRequest`, `CreateRenderResponse`.
- Produces: `renderApi.getModels(sessionId)` and `renderApi.request(sessionId, request)`.

- [ ] **Step 1: Add model catalog import and request**

Implement `GET /sessions/${sessionId}/render/models` using the shared authenticated Axios instance.

- [ ] **Step 2: Change render request to an object payload**

Replace positional prompt/projection arguments with a typed `CreateRenderRequest`, preserving exact property names `model`, `prompt`, and `poseProjectionImage`.

- [ ] **Step 3: Type-check the contract**

Run: `bun run build`

Expected: compilation may fail only at old `renderApi.request` call sites, proving the API boundary changed as intended.

### Task 3: App Model and Polling State

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `renderApi.getModels`, `selectCatalogModel`, selected `RenderModelId`.
- Produces: props for `PromptBar`: catalog, selection, loading/error/status state, upload callback, retry callback.

- [ ] **Step 1: Add model catalog state and loader**

Load models whenever the authenticated active session changes. Ignore stale async responses and select `default_model` through `selectCatalogModel`.

- [ ] **Step 2: Reset catalog state with workspace state**

Clear models, selection, and model errors in `resetWorkspace`; do not leak one session's catalog state into another session.

- [ ] **Step 3: Submit selected model**

Disable rendering when no model is selected. Call `renderApi.request(sessionId, { model: selectedModel, prompt, poseProjectionImage })` and retain the submitted model while pending/running responses return `model: null`.

- [ ] **Step 4: Harden terminal status handling**

Display a completed image only when `output_image` is non-null. Normalize `message: string | string[]`. For `quota_exceeded`, stop polling and show shared quota/rate/provider guidance. Clear active polling on session change and unmount.

- [ ] **Step 5: Run focused helper tests and build**

Run: `bun test src/lib/renderModel.test.ts`

Run: `bun run build`

Expected: tests and build PASS after PromptBar props are updated in Task 4.

### Task 4: Bottom Composer and Sidebar Cleanup

**Files:**
- Modify: `src/components/layout/PromptBar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- PromptBar consumes upload, model catalog, selection, retry, prompt, loading, and render callbacks.
- Sidebar no longer consumes `onFileSelect`.

- [ ] **Step 1: Refactor PromptBar markup**

Build a rounded two-row composer: multiline prompt above, `+` file picker at lower left, model trigger at lower right, and circular submit arrow at far right. Use icon tooltips and accessible labels.

- [ ] **Step 2: Add model menu behavior**

Render API model names, tier/pricing metadata, descriptions, selected state, shared free-tier note, loading state, error state, and retry action. Close on selection and outside click.

- [ ] **Step 3: Move upload ownership in the UI**

Connect the hidden file input to the existing `App.startSession` callback. Reset the input value after selection so the same file can be selected twice.

- [ ] **Step 4: Remove sidebar upload UI**

Delete the sidebar file input, upload button, upload ref/handlers, and `onFileSelect` prop. Keep new-session, progress, sessions, output, and account controls unchanged.

- [ ] **Step 5: Verify responsive and disabled states**

Confirm the composer fits desktop and narrow widths without overlap. Disable upload, model selection, and submit while analyzing/rendering; keep status/error copy visible above the composer.

### Task 5: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run tests**

Run: `bun test`

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run: `bun run build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 3: Run static checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Inspect scope**

Run: `git status --short`

Expected: only the approved docs and frontend integration files are modified or added.

- [ ] **Step 5: Browser verification**

Run the Bun dev server and verify at desktop and narrow viewport widths: old sidebar upload absent, `+` opens the picker, model menu appears at lower right, default model is selected from the API, render controls disable during work, and errors remain visible.
