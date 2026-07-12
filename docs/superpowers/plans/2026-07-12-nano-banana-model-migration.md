# Nano Banana Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the frontend model contract, selector copy, and active fixtures to use the backend-provided Nano Banana catalog.

**Architecture:** Keep `GET /sessions/{sessionId}/render/models` as the only model catalog and preserve `selectCatalogModel` for default selection and stale-value recovery. Restrict API types to the three current IDs, display each API-provided description directly, and leave routes, payload shape, quota behavior, historical incident records, and earlier planning documents unchanged.

**Tech Stack:** React 19, TypeScript 5.9, Bun test, ESLint, Vite 7

## Global Constraints

- Current model IDs are exactly `google/gemini-3.1-flash-lite-image`, `google/gemini-3.1-flash-image`, and `google/gemini-3-pro-image`.
- The backend default is `google/gemini-3.1-flash-image`; do not introduce a frontend default constant.
- Model pricing is `payg`; tiers remain `value`, `balanced`, and `premium`.
- Keep the existing API paths and `model`, `prompt`, and `poseProjectionImage` request fields unchanged.
- Keep the user-scoped daily request limit at exactly 2.
- Do not modify `docs/BACKEND_*.md` or existing design and implementation-plan documents.

---

## File Map

- `src/types/api.ts`: declares current render model IDs and pricing values used by API payloads and responses.
- `src/lib/renderModel.test.ts`: proves default selection, valid selection preservation, stale legacy selection recovery, and empty-catalog behavior using the Nano Banana response.
- `src/components/layout/PromptBar.tsx`: renders model names and descriptions supplied by the backend catalog.
- `src/lib/renderHistory.test.ts`: keeps active render history fixtures aligned with a current model ID.

### Task 1: Migrate the typed model catalog and selection fixtures

**Files:**
- Modify: `src/lib/renderModel.test.ts`
- Modify: `src/types/api.ts`

**Interfaces:**
- Consumes: `selectCatalogModel(catalog: RenderModelListResponse, current: RenderModelId | null): RenderModelId | null`
- Produces: `RenderModelId` containing the three Nano Banana IDs and `RenderModelPricing` containing `payg`

- [ ] **Step 1: Replace the model catalog fixture with the new backend response and add an explicit legacy-ID recovery case**

Update the fixture and the first four `selectCatalogModel` tests in `src/lib/renderModel.test.ts` to:

```ts
const catalog: RenderModelListResponse = {
  default_model: 'google/gemini-3.1-flash-image',
  models: [
    {
      id: 'google/gemini-3.1-flash-lite-image',
      name: 'Nano Banana 2 Lite',
      tier: 'value',
      pricing: 'payg',
      description: '빠르고 비용 효율적인 이미지 생성 모델',
    },
    {
      id: 'google/gemini-3.1-flash-image',
      name: 'Nano Banana 2',
      tier: 'balanced',
      pricing: 'payg',
      description: '품질과 속도의 균형이 좋은 기본 모델',
    },
    {
      id: 'google/gemini-3-pro-image',
      name: 'Nano Banana Pro',
      tier: 'premium',
      pricing: 'payg',
      description: '복잡한 편집에 적합한 최고 품질 모델',
    },
  ],
  usage_policy: {
    requests_per_day: 2,
    scope: 'user',
    remaining_requests_available: true,
  },
};

describe('selectCatalogModel', () => {
  test('selects Nano Banana 2 when there is no current selection', () => {
    expect(selectCatalogModel(catalog, null)).toBe(
      'google/gemini-3.1-flash-image',
    );
  });

  test('preserves a current Nano Banana selection that exists in the catalog', () => {
    expect(
      selectCatalogModel(catalog, 'google/gemini-3-pro-image'),
    ).toBe('google/gemini-3-pro-image');
  });

  test('replaces a persisted legacy selection with the backend default', () => {
    expect(
      selectCatalogModel(
        catalog,
        'bytedance-seed/seedream-4.5:free' as RenderModelId,
      ),
    ).toBe('google/gemini-3.1-flash-image');
  });

  test('returns null when the backend catalog is empty', () => {
    expect(selectCatalogModel({ ...catalog, models: [] }, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the legacy source scan and verify the old contract is detected**

Run:

```powershell
$matches = rg -n -g '!*.test.ts' -g '!*.test.tsx' "Seedream|FLUX|Riverflow|bytedance-seed|black-forest-labs|sourceful/riverflow|'free'" src
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
exit 0
```

Expected: FAIL and print the old model ID and `free` pricing declarations from `src/types/api.ts`. Bun transpiles tests without type checking, and the production TypeScript configuration intentionally excludes test files, so a source-level contract check is the reliable RED signal here.

- [ ] **Step 3: Replace the old model ID and pricing unions with the current backend values**

Change the declarations in `src/types/api.ts` to:

```ts
export type RenderModelId =
  | 'google/gemini-3.1-flash-lite-image'
  | 'google/gemini-3.1-flash-image'
  | 'google/gemini-3-pro-image';

export type RenderModelTier = 'balanced' | 'value' | 'premium';
export type RenderModelPricing = 'payg';
```

- [ ] **Step 4: Run the focused model tests and verify they pass**

Run: `bun test src/lib/renderModel.test.ts`

Expected: PASS for all `selectCatalogModel`, API-message, and render-usage tests.

- [ ] **Step 5: Commit the contract migration**

```bash
git add src/types/api.ts src/lib/renderModel.test.ts
git commit -m "feat: migrate render model contract to Nano Banana"
```

### Task 2: Use backend descriptions and update the active history fixture

**Files:**
- Modify: `src/components/layout/PromptBar.tsx`
- Modify: `src/lib/renderHistory.test.ts`

**Interfaces:**
- Consumes: `RenderModelOption.description: string` and `RenderHistoryItem.model: string`
- Produces: selector rows whose descriptive copy comes directly from the fetched model option

- [ ] **Step 1: Add a source-level regression check that initially detects legacy UI copy and fixtures**

Run:

```powershell
$matches = rg -n -g '!*.test.ts' -g '!*.test.tsx' "Seedream|FLUX|Riverflow|bytedance-seed|black-forest-labs|sourceful/riverflow|'free'" src
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
exit 0
```

Expected: FAIL and print matches from `src/components/layout/PromptBar.tsx`. Separately run `rg -n "Seedream|FLUX|Riverflow|bytedance-seed|black-forest-labs|sourceful/riverflow" src/lib/renderHistory.test.ts` and expect a match from its legacy fixture.

- [ ] **Step 2: Remove the frontend model description map and render the API description**

Delete this declaration from `src/components/layout/PromptBar.tsx`:

```ts
const modelDescriptions: Record<string, string> = {
  'Seedream 4.5': '저렴하고 일관성 좋은 이미지 편집 모델',
  'FLUX.2 Pro': '품질과 속도의 균형이 좋은 기본 모델',
  'Riverflow V2.5 Pro': '복잡한 편집에 적합한 고품질 모델',
};
```

Replace the model description paragraph with:

```tsx
<p className="mt-1 text-[11px] leading-4 text-zinc-400">
  {model.description}
</p>
```

- [ ] **Step 3: Replace the active render history fixture with a current model ID**

In `src/lib/renderHistory.test.ts`, use:

```ts
model: 'google/gemini-3.1-flash-image',
```

- [ ] **Step 4: Re-run the legacy source scan and verify it passes**

Run:

```powershell
$matches = rg -n -g '!*.test.ts' -g '!*.test.tsx' "Seedream|FLUX|Riverflow|bytedance-seed|black-forest-labs|sourceful/riverflow|'free'" src
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
exit 0
```

Also run:

```powershell
$matches = rg -n "Seedream|FLUX|Riverflow|bytedance-seed|black-forest-labs|sourceful/riverflow" src/lib/renderHistory.test.ts
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
exit 0
```

Expected: both commands PASS with no output. Production checks exclude test files because `renderModel.test.ts` intentionally includes a removed ID to prove stale-value recovery. Historical documentation is excluded by scanning only `src`.

- [ ] **Step 5: Run focused and full verification**

Run: `bun test src/lib/renderModel.test.ts src/lib/renderHistory.test.ts`

Expected: PASS for both focused test files.

Run: `bun test`

Expected: PASS for the complete test suite.

Run: `bunx eslint src/types/api.ts src/lib/renderModel.test.ts src/components/layout/PromptBar.tsx src/lib/renderHistory.test.ts`

Expected: exit code 0 with no ESLint errors in migration files.

Run: `bun run build`

Expected: exit code 0 after TypeScript project build and Vite production bundling.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 6: Commit the UI and fixture migration**

```bash
git add src/components/layout/PromptBar.tsx src/lib/renderHistory.test.ts
git commit -m "feat: display Nano Banana model metadata"
```

## Verification Note

The repository-wide `bun run lint` command currently reports five errors and one warning in pre-existing files outside this migration (`src/App.tsx`, `src/components/editor/CanvasEditor.tsx`, `src/components/ui/index.tsx`, and `src/hooks/usePoseEditor.ts`). Those unrelated findings are intentionally not changed by this plan. Migration files must pass the scoped ESLint command above, while the full test suite and production build must pass.
