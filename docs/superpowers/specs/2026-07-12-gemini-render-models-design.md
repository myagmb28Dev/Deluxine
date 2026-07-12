# Gemini Render Model Catalog Design

## Goal

Replace the three existing non-Gemini OpenRouter image models with three distinct, non-preview Gemini image models while preserving the current render API contract and value/balanced/premium selection structure.

## Model Catalog

| Tier | Display name | OpenRouter model ID |
| --- | --- | --- |
| value | Nano Banana 2 Lite | `google/gemini-3.1-flash-lite-image` |
| balanced | Nano Banana 2 | `google/gemini-3.1-flash-image` |
| premium | Nano Banana Pro | `google/gemini-3-pro-image` |

`google/gemini-3.1-flash-image` remains the default selection through `DEFAULT_RENDER_MODEL`.

## Implementation Scope

- Replace the `RenderModel` enum members and values with the three Gemini model IDs.
- Update `RENDER_MODEL_OPTIONS` names and descriptions without changing the existing tier or pay-as-you-go fields.
- Treat all three Gemini models as pose-first when both line-art and pose projection references are supplied.
- Update render-model and OpenRouter service tests to use the new enum members and assert the Gemini pose-first behavior.
- Update README examples and model-selection documentation to match the new catalog and default.

The render endpoints, DTO shape, BullMQ processing, per-user daily usage policy, Redis state, R2 storage, and OpenRouter `/images` transport remain unchanged.

## Data Flow

1. The authenticated client requests `GET /render/models` and receives the three Gemini choices.
2. The client submits one model ID through the existing render DTO.
3. The render job retains the selected ID in its existing metadata field.
4. The worker sends the line art and optional pose projection to OpenRouter `/images` using the selected Gemini model.
5. When a pose projection exists, it is placed before the line-art reference for every supported Gemini model.

## Error Handling

Existing behavior remains in place: a missing API key fails with `OPENROUTER_API_KEY_MISSING`, OpenRouter 402/429 responses map to `QUOTA_EXCEEDED`, and other provider errors retain their current retry and failure flow.

## Verification

- First update the catalog test and reference-order tests and verify that they fail against the old catalog.
- Apply the minimal production changes and rerun the focused tests.
- Run the complete test suite and build.
- Search the repository for the three retired model IDs to ensure no active documentation or code references remain.

Live paid inference is outside this change because it consumes OpenRouter balance; the integration boundary is verified through the existing HTTP service tests.
