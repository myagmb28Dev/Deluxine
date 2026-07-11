# Render Model Prompt Bar Integration Design

## Goal

Refactor the frontend render controls to match the backend model-selection contract and the approved bottom composer layout. Users must be able to upload a line-art image from the lower-left `+` control, choose a backend-provided render model from the lower-right control, enter a prompt, and submit a render job without using the current sidebar upload button.

## Scope

- Add the backend render-model catalog types and API call.
- Load the catalog for the active authenticated session.
- Select the API-provided `default_model` initially.
- Send the selected model ID in the render POST body.
- Update render-job response types for nullable fields and model metadata.
- Treat `quota_exceeded` as a terminal state with shared-quota guidance.
- Refactor the bottom prompt bar to include upload, model selection, prompt, and submit controls.
- Remove the sidebar upload control while preserving session navigation and session creation.
- Normalize API error messages when `message` is either a string or a string array.
- Clean up render polling when the active session changes or the component unmounts.

This change does not add OpenRouter credentials to the frontend, estimate remaining quota, or hardcode the model catalog as the primary source of truth.

## Component Responsibilities

### API Types and Client

`src/types/api.ts` will declare the exact backend contract:

- `RenderModelId`
- `RenderModelTier`
- `RenderModelPricing`
- `RenderModelOption`
- `RenderFreeTierLimits`
- `RenderModelListResponse`
- updated `CreateRenderRequest` and `CreateRenderResponse`
- updated `RenderJobResponse` with nullable `model`, `created_at`, and `updated_at`
- `ApiError.message` as `string | string[]`

`src/api/client.ts` will expose:

- `renderApi.getModels(sessionId)`
- `renderApi.request(sessionId, { model, prompt, poseProjectionImage })`
- the existing job-status lookup

Firebase authentication remains centralized in the existing Axios request interceptor. No provider API key is introduced in frontend code or environment variables.

### App State and Data Flow

`src/App.tsx` remains the owner of session, upload, render, and polling state. It will add:

- model catalog state
- selected model ID state
- model-loading and model-error state
- render status text derived from job status

When an authenticated session becomes active, the app requests `GET /sessions/{sessionId}/render/models`. On success it stores the returned catalog and selects `default_model`. If the current selection still exists after a refresh, that selection is preserved. On failure the render action is disabled and a retry action is shown; the frontend will not invent an unsupported model ID.

When rendering, the app saves the current pose, captures the optional pose projection, and submits the selected model, prompt, and projection image. The model selected at submission remains visible while the job runs because in-progress job responses may return `model: null`.

The model catalog and selection reset when the workspace is reset. A session change cancels old polling and loads the new session's catalog.

### Bottom Composer

`src/components/layout/PromptBar.tsx` will become a two-row bottom composer based on the approved reference image:

- The upper area is a multiline prompt input.
- The lower-left `+` icon opens a hidden `input[type=file]` accepting images.
- The lower-right model trigger shows the selected model name and opens a compact menu.
- The far-right circular arrow button submits the render request.
- Error and status messages appear directly above the composer.

The model menu uses the API fields `name`, `tier`, `pricing`, and `description`. The selected model is clearly marked. The common free-tier note states that all models share up to 50 requests per day and 20 per minute, without displaying a fabricated remaining count.

During upload, pose analysis, or rendering, controls that would create conflicting actions are disabled. The menu closes after selection and when clicking outside. Keyboard focus and accessible labels are retained for icon-only controls.

On narrow screens, the composer uses the available width, allows the prompt to wrap, and keeps the lower control row from overlapping.

### Sidebar

`src/components/layout/Sidebar.tsx` will no longer own a file input or upload button. It will keep the new-session button, session list, progress display, generated output, account controls, and session context menu.

The `onFileSelect` prop moves from `Sidebar` to `PromptBar`. Upload behavior itself remains in `App.startSession`, so moving the control does not duplicate upload logic or change the backend upload contract.

## Render States and Errors

- `pending`: show that the render job is queued and continue polling.
- `running`: show that the selected model is generating and continue polling.
- `completed`: stop polling and display `output_image` only when non-null.
- `failed`: stop polling and show a retryable general failure.
- `quota_exceeded`: stop polling and explain that the shared free quota, rate limit, or provider availability may be the cause; changing models is not presented as a guaranteed fix.

HTTP errors distinguish validation, authentication, missing session/upload/pose, missing job, and server failures where the response provides enough information. Error normalization joins `message: string[]` into readable text and retains useful details in development logs.

Polling uses one active job at a time and is aborted or cleared on session changes and unmount. Transient polling failures may be retried within the existing bounded render window, while definitive 404/401 responses terminate polling and surface an actionable message.

## Testing and Verification

Focused tests will cover:

- model catalog response typing and selection of `default_model`
- preservation or reset of a selected model after catalog refresh
- render POST payload containing the exact selected model ID
- string and string-array API error normalization
- terminal handling for `completed`, `failed`, and `quota_exceeded`
- prevention of null `output_image` display
- upload `+` control invoking the existing file-upload path
- sidebar no longer rendering the upload control
- polling cleanup on session change and unmount

Verification will include the repository build, available automated tests, static diff checks, and browser checks at desktop and narrow viewport widths. Browser checks will confirm the lower-left upload button, lower-right model selector, disabled/loading states, menu behavior, and absence of the old sidebar upload button.

## Acceptance Criteria

1. The active session loads its model catalog with Firebase authentication.
2. The backend `default_model` is selected initially.
3. All returned models are selectable by their exact API IDs.
4. The selected model ID is included in the render POST body.
5. The lower composer visually follows the approved reference layout.
6. The lower-left `+` opens image selection and uses the existing upload flow.
7. The sidebar upload button and file input are removed.
8. Shared free-tier limits are explained without showing a remaining count.
9. `quota_exceeded` stops polling and presents accurate shared-quota guidance.
10. Nullable render-job fields do not cause broken images or runtime errors.
11. Polling is cleaned up when leaving a session or unmounting the app.
12. No OpenRouter API key or hardcoded catalog becomes part of the frontend.
