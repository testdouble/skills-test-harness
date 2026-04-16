# Divergent-Convergent Description Improvement

## Problem

The SCIL and ACIL improvement loops produce descriptions that are too similar to the current description on each iteration. This causes train and test accuracy to plateau — the same score repeats across iterations because the description barely changes. Early iterations should explore broadly, and later iterations should converge on what works.

## Design

### Phase Model

Introduce a phase system that controls how aggressively the improvement prompt asks Claude to deviate from previous descriptions.

Three phases:

- **Explore** — Write a description that takes a fundamentally different approach from all previous iterations. Restructure sentences, reframe the domain, use different vocabulary. Do NOT make incremental edits to the current description — start fresh from understanding the skill/agent body and the failing cases.
- **Transition** — Review previous iterations and identify which patterns correlated with higher accuracy. Write a new description that combines the strongest elements from the best-performing iterations while still experimenting with boundary statements and trigger phrasing.
- **Converge** — Make targeted, surgical edits to improve the failing cases without regressing the passing ones. Preserve the overall structure and vocabulary that has been working. Reference the best-performing train accuracy to anchor the refinement.

All three phases preserve the structural constraints from the current rules: describe WHAT/WHEN, include boundary statements, keep to 3-5 sentences under 1024 characters, and generalize rather than list specific cases. The phase controls the rewriting approach (fresh vs. combine-best vs. surgical), not the quality criteria.

### Phase Allocation

For 5 or fewer iterations, use two phases (no transition). For 6 or more, use three phases. Extra iterations beyond the base are distributed round-robin in the order: explore, transition, converge — one extra to explore first, then one to transition, then one to converge, and repeat.

| Max | Explore | Transition | Converge |
|-----|---------|------------|----------|
| 1   | 1       | —          | 0        |
| 2   | 1       | —          | 1        |
| 3   | 2       | —          | 1        |
| 4   | 2       | —          | 2        |
| 5   | 3       | —          | 2        |
| 6   | 2       | 2          | 2        |
| 7   | 3       | 2          | 2        |
| 8   | 3       | 3          | 2        |
| 9   | 3       | 3          | 3        |
| 10  | 4       | 3          | 3        |
| 11  | 4       | 4          | 3        |
| 12  | 4       | 4          | 4        |

### Generalization Hint Removal

The existing `generalizationHint` conditional (appended when all training queries pass but holdout queries fail) is removed. Its intent is folded into the phase-specific instructions — explore naturally encourages broad variation, and converge addresses generalization through targeted adjustments rather than wholesale rewriting.

## Implementation

### 1. New file: `tests/packages/data/src/phase.ts`

Contains:

- `Phase` type — `'explore' | 'transition' | 'converge'` string literal union (matches existing project convention of inline unions, e.g. `'train' | 'test'` in types.ts — no enums are used in this codebase)
- `EntityType` — `'skill' | 'agent'` discriminator, used to select entity-specific vocabulary in phase instructions (e.g., "trigger the skill" vs "delegate to the agent")
- `getPhase(iteration: number, maxIterations: number): Phase` — implements the allocation table above. `iteration` is **1-based** (matches the `for (let i = 1; ...)` loop in both SCIL and ACIL orchestrators)
- `getPhaseInstructions(phase: Phase, entityType: EntityType, iterations: { trainAccuracy: number; testAccuracy: number | null }[], holdoutFailures?: string[]): string` — returns the phase-specific instruction block. Accepts a narrow iteration type (both `IterationResult` and `AcilIterationResult` satisfy this shape). For the converge phase, derives the best train accuracy from the iterations array to anchor the refinement target (train accuracy is the metric the model can directly optimize). The `entityType` parameter controls vocabulary: "skill" produces "WHAT the skill does / WHEN to use it / trigger the skill", while "agent" produces "WHAT the agent does / WHEN to delegate to it / trigger delegation". In the converge phase, when train accuracy is 1.0 and `holdoutFailures` is non-empty, the instructions include the failing holdout query texts as "additional user messages your description should handle" — giving the model concrete patterns to generalize toward without leaking pass/fail status. In explore and transition phases, `holdoutFailures` is ignored.

Export all four from the data package's public API.

### 1b. Update `tests/packages/data/src/types.ts`

- Add `phase: Phase` to `IterationResult` (import `Phase` from `./phase.js`)
- Add `phase: Phase` to `AcilIterationResult`
- Add `phase: Phase | null` to `ScilIterationRecord`, `AcilIterationRecord`, `ScilIterationRow`, and `AcilIterationRow` (null for backward compatibility with existing Parquet data that predates the phase system)
- This is a read-only annotation — does not affect selection logic or scoring, but enables debugging and UI display of which phase produced each iteration

### 2. Update `tests/packages/data/src/scil-prompt.ts`

- Add `phase: Phase` and `testResults?: QueryResult[]` to the `buildImprovementPrompt` options
- Replace the static rules #1-5 (lines 71-76) and `generalizationHint` (lines 39-43) with a call to `getPhaseInstructions(phase, 'skill', opts.iterations, holdoutFailures)` where `holdoutFailures` is derived from `testResults`: extract `promptContent` from failing test results (i.e. `testResults.filter(r => !r.passed).map(r => r.promptContent)`) only when `allTrainPass` is true and phase is `'converge'`; otherwise pass `undefined`
- Remove the `allTrainPass` and `generalizationHint` logic entirely (the `allTrainPass` check moves into the holdoutFailures derivation above)

### 3. Update `tests/packages/data/src/acil-prompt.ts`

- Add `phase: Phase` and `testResults?: AcilQueryResult[]` to the `buildAcilImprovementPrompt` options (note: the function name is `buildAcilImprovementPrompt`, not `buildImprovementPrompt`)
- Replace the static rules #1-5 (lines 71-76) and `generalizationHint` (lines 39-43) with a call to `getPhaseInstructions(phase, 'agent', opts.iterations, holdoutFailures)` where `holdoutFailures` is derived identically to the SCIL variant
- Remove the `allTrainPass` and `generalizationHint` logic entirely

### 4. Update `tests/packages/execution/src/scil/step-7-improve-description.ts`

- Add `phase: Phase` and `testResults?: QueryResult[]` to `ImproveDescriptionOptions` (currently has: `skillName`, `currentDescription`, `skillBody`, `trainResults`, `iterations`, `holdout`, `model`, `debug`)
- Pass `phase` and `testResults` through to `buildImprovementPrompt`

### 5. Update `tests/packages/execution/src/acil/step-7-improve-description.ts`

- Add `phase: Phase` and `testResults?: AcilQueryResult[]` to `ImproveDescriptionOptions` (currently has: `agentName`, `currentDescription`, `agentBody`, `trainResults`, `iterations`, `holdout`, `model`, `debug`)
- Pass `phase` and `testResults` through to `buildAcilImprovementPrompt`

### 6. Update `tests/packages/execution/src/scil/loop.ts`

- Import `getPhase` from `@testdouble/harness-data`
- Inside the `for (let i = 1; i <= config.maxIterations; i++)` loop, call `const phase = getPhase(i, config.maxIterations)` at the **top** of the loop body — `phase` is needed for: (1) recording on `iterResult`, (2) gating `needsImprovement`, (3) passing to `improveDescription`, and (4) gating early stopping
- Record `phase` on the `IterationResult` object pushed to the iterations array each loop cycle
- Pass `phase` and `testResults` to `improveDescription`
- Modify `needsImprovement`: during explore and transition phases, `needsImprovement` is always true — the goal is to generate diverse descriptions regardless of current accuracy. Only in converge phase does the existing accuracy check apply (`trainAccuracy < 1.0 || (holdout > 0 && testAccuracy < 1.0)`).
- Modify early stopping: the existing logic (`if (perfectTrain && perfectTest) break`) must be gated on the current phase. Early stopping is suppressed until at least one converge iteration has completed. Specifically: only break if `phase === 'converge'` (or a converge iteration has already run). This prevents an explore or transition iteration from exiting the loop before the converge phase has had a chance to refine the description. The `getPhase` call is already available at this point in the loop.

### 7. Update `tests/packages/execution/src/acil/loop.ts`

Same changes as the SCIL loop — same `for (let i = 1; ...)` pattern, same `config.maxIterations` access. Call `getPhase` at the top of the loop body, record `phase` on `AcilIterationResult`, pass `phase` and `testResults` to `improveDescription`. Apply the same `needsImprovement` and early stopping phase gates.

### 8. Update `tests/packages/execution/src/common/write-output.ts`

- Add `phase?: string` to the `WritableIteration` interface (lines 5-12). This interface defines the serialization shape — the existing spread (`...iteration`) already passes through all fields from the domain types, so adding `phase` to `WritableIteration` ensures TypeScript visibility and documents the contract. No runtime change needed beyond the interface update.

### 9. Update `tests/packages/data/src/analytics.ts`

- No SQL changes needed. The SCIL iteration import (line 187) uses `selectExpression: '*, trainResults[1].skillFile AS skill_file'` — the `*` already picks up all JSONL fields including `phase`. Same for the ACIL iteration import (line 215). Since `phase` is a new additive field in the JSONL, existing Parquet files without it will show `NULL` when DuckDB schema-merges. Verify that DuckDB's `importJsonlToParquet` handles schema evolution correctly for new additive columns — if not, the `selectExpression` may need an explicit `COALESCE(phase, NULL) AS phase` clause.

### 10. Update `tests/packages/data/src/run-status.ts`

- The query functions `queryScilRunDetails` and `queryAcilRunDetails` return iteration rows to the web frontend. Include `phase` in the returned `ScilIterationRow` / `AcilIterationRow` data.

### 11. Update `tests/packages/execution/src/common/print-report.ts`

- Add `phase?: string` to the `PrintableIteration` interface (lines 7-14)
- In `printIterationProgress` (line 16): append a phase tag to the iteration line, e.g. `Iteration 1/5 [explore] — train: 80% (4/5)`. When `phase` is undefined (legacy callers), omit the tag.
- In `printFinalSummary` (line 46): add a `Phase` column to the iteration table. When `phase` is undefined on an iteration (legacy data), show `—` in the column.

### 12. Update `tests/packages/web/src/client/pages/ScilDetail.tsx`

- In the iteration header (currently "Iteration N" with optional "Best" badge), add a colored phase badge. Colors: explore = blue (#60a5fa), transition = amber (#fbbf24), converge = green (#4ade80). When `phase` is null (legacy data), show no badge. No changes to history/summary pages — phase is per-iteration detail.

### 13. Update `tests/packages/web/src/client/pages/AcilDetail.tsx`

- Same phase badge rendering as ScilDetail.tsx.

### 14. Tests

- `tests/packages/data/src/phase.test.ts` — unit tests for `getPhase` covering the full allocation table and edge cases (iteration 1 with maxIterations 1, large maxIterations values)
- `tests/packages/data/src/phase.test.ts` — unit tests for `getPhaseInstructions` covering each phase and each entity type, including converge deriving best accuracy from iterations, and converge with holdout failures (includes failing query texts when train accuracy is 1.0 and holdoutFailures is non-empty; omits them otherwise)
- Update `tests/packages/data/src/scil-prompt.test.ts` (10 existing tests) to pass the new `phase` parameter via test factories
- Update `tests/packages/data/src/acil-prompt.test.ts` (15 existing tests) to pass the new `phase` parameter via test factories
- Update `tests/packages/execution/src/scil/step-7-improve-description.test.ts` (28 existing tests across 2 describe blocks: `buildImprovementPrompt` and `improveDescription`) to pass the new `phase` parameter
- Update `tests/packages/execution/src/acil/step-7-improve-description.test.ts` (18 existing tests in 1 describe block: `improveDescription` only) to pass the new `phase` parameter
- Update `tests/packages/execution/src/scil/loop.test.ts` (18 existing tests) — mock `getPhase` import, update `improveDescription` mock assertions to verify `phase` and `testResults` params, add tests for `needsImprovement` always-true in explore/transition, add tests for early stopping suppression until converge phase
- Update `tests/packages/execution/src/acil/loop.test.ts` (17 existing tests) — same changes as the SCIL loop tests
- Update `tests/packages/execution/src/common/write-output.test.ts` (10 existing tests) — add `phase` to `makeIteration` factory
- Update `tests/packages/execution/src/scil/step-9-write-output.test.ts` (15 existing tests) — add `phase` to `makeIteration` factory
- Update `tests/packages/execution/src/acil/step-9-write-output.test.ts` (6 existing tests) — add `phase` to `makeIteration` factory
- Update `tests/packages/execution/src/common/print-report.test.ts` — add `phase` to factories, add assertions for `[explore]`/`[transition]`/`[converge]` tags in `printIterationProgress` output, add assertions for Phase column in `printFinalSummary` table, verify graceful handling when `phase` is undefined (legacy callers)

## Files Changed

| File | Change |
|------|--------|
| `tests/packages/data/src/phase.ts` | New — Phase type, EntityType, getPhase, getPhaseInstructions |
| `tests/packages/data/src/types.ts` | Add `phase: Phase` to IterationResult and AcilIterationResult |
| `tests/packages/data/src/phase.test.ts` | New — unit tests |
| `tests/packages/data/src/scil-prompt.ts` | Add phase and testResults params, derive holdoutFailures for converge phase, replace static rules with phase instructions, remove generalizationHint |
| `tests/packages/data/src/scil-prompt.test.ts` | Update to pass phase param |
| `tests/packages/data/src/acil-prompt.ts` | Add phase and testResults params to buildAcilImprovementPrompt, derive holdoutFailures for converge phase, replace static rules, remove generalizationHint |
| `tests/packages/data/src/acil-prompt.test.ts` | Update to pass phase param |
| `tests/packages/data/index.ts` | Export Phase, EntityType, getPhase, getPhaseInstructions |
| `tests/packages/execution/src/scil/step-7-improve-description.ts` | Add phase and testResults to options, pass through |
| `tests/packages/execution/src/scil/step-7-improve-description.test.ts` | Update to pass phase param |
| `tests/packages/execution/src/scil/loop.ts` | Call getPhase, pass phase and testResults to improveDescription, gate early stopping on converge phase |
| `tests/packages/execution/src/acil/step-7-improve-description.ts` | Add phase and testResults to options, pass through |
| `tests/packages/execution/src/acil/step-7-improve-description.test.ts` | Update to pass phase param |
| `tests/packages/execution/src/acil/loop.ts` | Call getPhase, pass phase and testResults to improveDescription, gate early stopping on converge phase |
| `tests/packages/execution/src/common/write-output.ts` | Add `phase?: string` to `WritableIteration` interface |
| `tests/packages/execution/src/common/write-output.test.ts` | Update `makeIteration` factory to include `phase` |
| `tests/packages/execution/src/scil/step-9-write-output.test.ts` | Update `makeIteration` factory to include `phase` |
| `tests/packages/execution/src/acil/step-9-write-output.test.ts` | Update `makeIteration` factory to include `phase` |
| `tests/packages/execution/src/scil/loop.test.ts` | Update mocks and assertions for `getPhase`, `needsImprovement`, early stopping, and `testResults` passthrough |
| `tests/packages/execution/src/acil/loop.test.ts` | Update mocks and assertions for `getPhase`, `needsImprovement`, early stopping, and `testResults` passthrough |
| `tests/packages/execution/src/common/print-report.ts` | Add `phase?: string` to `PrintableIteration`, show phase tag in `printIterationProgress`, add Phase column in `printFinalSummary` |
| `tests/packages/execution/src/common/print-report.test.ts` | Update factories and add assertions for phase display in console output |
| `tests/packages/data/src/analytics.ts` | No SQL changes — `*` in selectExpression auto-imports `phase`. Verify schema evolution handles additive columns. |
| `tests/packages/data/src/run-status.ts` | Include `phase` in ScilIterationRow and AcilIterationRow query results |
| `tests/packages/web/src/client/pages/ScilDetail.tsx` | Add colored phase badge to iteration header |
| `tests/packages/web/src/client/pages/AcilDetail.tsx` | Add colored phase badge to iteration header |

## Iteration Review Summary

- **Iterations completed:** 3 (original) + 1 (grill-me scope expansion) + 3 (iterative plan review) + 3 (second iterative plan review)
- **Assumptions challenged:** 48 total (5 original + 10 first plan review + 33 second plan review)
  - Test count for scil-prompt.test.ts: 13 → 10 (corrected)
  - Test count for acil-prompt.test.ts: 16 → 15 (corrected)
  - Test count for execution scil step-7: "22+" → 28 (corrected)
  - `Phase` as enum → string literal union (corrected to match codebase convention)
  - "Best accuracy" in converge phase was ambiguous → clarified as best train accuracy
  - Analytics step 9: `*` in selectExpression auto-imports `phase` — no SQL changes needed (corrected)
  - Step 8: `WritableIteration` interface is the actual serialization shape — plan description corrected
  - `getPhase` placement: must be at top of loop body, not just before `improveDescription` — needed for iterResult construction (corrected)
  - `selectBestIteration` confirmed phase-agnostic (verified)
  - `printFinalSummary` "all same score" warning behavior unchanged (verified)
  - `printIterationProgress` line reference: 25 → 16 (corrected)
  - `printFinalSummary` line reference: 56-72 → 46 (corrected)
  - `IterationResult`/`AcilIterationResult` re-exported from execution types.ts — phase propagates automatically (verified)
  - `needsImprovement` + early stopping interaction: explore forces improvement even at perfect accuracy, early stopping suppressed — `selectBestIteration` picks the best at the end regardless of phase (verified)
  - `newDescription` assignment at loop.ts:120 correctly gated by early stopping break at line 118 (verified)
  - `PrintableIteration.phase?: string` compatible with `Phase` string literal union (verified)
  - DuckDB schema evolution handles additive columns via union-by-name with NULL fill (verified)
  - run-status.ts iteration queries use `SELECT *` which auto-includes phase (verified)
- **Missing files identified:** 6 test files added to Files Changed table
  - `loop.test.ts` (SCIL: 18 tests, ACIL: 17 tests) — significant behavioral changes
  - `write-output.test.ts` (common: 10, SCIL step-9: 15, ACIL step-9: 6) — factory updates
- **Consolidations made:** 0 (no external overlap found)
- **Ambiguities resolved:** 2
  - Phase allocation wording clarified: "priority order" → explicit round-robin description
  - Added note that structural constraints (WHAT/WHEN, boundaries, character limit) are preserved across all phases — only the rewriting approach changes
- **Ambiguity resolved:** Console output phase display — `printIterationProgress` shows `[explore]`/`[transition]`/`[converge]` tag, `printFinalSummary` adds Phase column to iteration table. Step 11 added to implementation.
- **Open cosmetic question:** Phase column placement in `printFinalSummary` table — between Iteration/Train or as a suffix in the Iteration column. Does not affect correctness.
- **Scope expansion decisions (grill-me):** 6
  - Converge phase surfaces failing holdout query texts (not pass/fail status) when train accuracy is 1.0 — gives the model concrete patterns to generalize toward
  - Holdout split ratio stays fixed across all phases — changing it per phase would break cross-iteration accuracy comparisons
  - `selectBestIteration` stays phase-agnostic — selects on outcomes, not process
  - Early stopping suppressed until at least one converge iteration completes — prevents explore from exiting the loop prematurely
  - `needsImprovement` always true during explore and transition — avoids wasted eval cycles re-evaluating the same description
  - `phase` recorded on iteration results and displayed in UI detail pages as colored badges — enables debugging and observability
