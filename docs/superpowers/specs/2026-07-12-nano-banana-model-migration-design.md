# Nano Banana Model Migration Design

**Date:** 2026-07-12

## Goal

Migrate the frontend render model contract from Seedream, FLUX, and Riverflow to the three Nano Banana models described by the backend migration guide, while preserving the existing API-driven model selection flow.

## Scope

The migration changes executable frontend code, API types, model selection copy, and active test fixtures. Historical incident records in `docs/BACKEND_*.md` and existing design or implementation-plan documents remain unchanged because they describe earlier system behavior.

## Architecture

The backend model catalog remains the single source of truth. The frontend continues to fetch `GET /sessions/{sessionId}/render/models`, renders the returned `models` array, initializes or repairs the selection with `default_model`, and sends the selected model `id` in the existing optional `model` request field.

No frontend fallback catalog or default model constant will be introduced. This avoids duplicating backend configuration and keeps future catalog changes data-driven.

## Contract Changes

`RenderModelId` will accept only the following current model identifiers:

- `google/gemini-3.1-flash-lite-image`
- `google/gemini-3.1-flash-image`
- `google/gemini-3-pro-image`

`RenderModelPricing` will change from `free` to `payg`, matching the new model catalog response. The existing tiers (`value`, `balanced`, and `premium`), API routes, request fields, response shape, and daily request policy remain unchanged.

## UI Behavior

The selector continues to display the model names returned by the API and sorts entries by value, balanced, then premium tier. Model descriptions will come directly from each catalog entry's `description` field instead of a frontend name-to-description map.

The initial selection is the catalog's `default_model`. If the current selection is absent from a newly loaded catalog, `selectCatalogModel` falls back to a valid `default_model`, then to the first catalog entry when necessary. An empty catalog still produces no selection and disables rendering.

The application currently does not persist the selected render model in local storage, so no storage migration is required. The same selection repair function covers stale in-memory values during catalog reloads.

## Render and History Flow

Rendering continues to require a valid UI selection and sends that selected ID through `CreateRenderRequest.model`. The API client paths and payload fields remain unchanged.

Render job status and history already carry model identifiers as API data rather than translating them through a legacy name map. Their active test fixtures will be updated to use a Nano Banana model ID; production flow requires no structural change.

## Error Handling

Existing catalog loading failures, empty-catalog handling, retry controls, and disabled render state remain unchanged. The migration adds no client-side fallback model because silently hardcoding a value would conflict with the backend catalog contract.

## Testing and Verification

Tests will verify that:

- the backend Nano Banana default is selected when no current selection exists;
- a valid Nano Banana selection is preserved;
- a legacy model ID is rejected at runtime by catalog validation and replaced by the backend default;
- an empty catalog produces a null selection;
- render history fixtures use the current model contract.

After the focused tests pass, the full Bun test suite, ESLint, and the production TypeScript/Vite build will run. No historical documentation will be rewritten.
