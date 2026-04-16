# PRD: Divergent-Convergent Description Improvement

**Source Document:** [`divergent-convergent-description-improvement.md`](divergent-convergent-description-improvement.md)

## Problem Statement

The SCIL and ACIL improvement loops produce descriptions that are too similar to the current description on each iteration. This causes train and test accuracy to plateau — the same score repeats across iterations because the description barely changes. Early iterations should explore broadly (diverge), and later iterations should converge on what works.

*Source: [Problem section](divergent-convergent-description-improvement.md#problem)*

## Solution

Introduce a three-phase system — Explore, Transition, Converge — that controls how aggressively the improvement prompt asks Claude to deviate from previous descriptions. Early iterations rewrite from scratch, middle iterations combine the best elements, and late iterations make surgical edits. The existing `generalizationHint` conditional is removed and its intent folded into phase-specific instructions.

*Source: [Design > Phase Model](divergent-convergent-description-improvement.md#phase-model), [Design > Generalization Hint Removal](divergent-convergent-description-improvement.md#generalization-hint-removal)*

## User Stories

### 1. As a harness developer, I want a `Phase` type and `getPhase` allocation function, so that the system can deterministically assign a phase to each iteration based on its position in the loop.

**What to build:**
- New file `tests/packages/data/src/phase.ts` containing:
  - `Phase` type — `'explore' | 'transition' | 'converge'` string literal union (matches codebase convention of inline unions, not enums)
  - `EntityType` type — `'skill' | 'agent'` discriminator
  - `getPhase(iteration: number, maxIterations: number): Phase` — implements the allocation table from the source document. `iteration` is 1-based.
- Export `Phase`, `EntityType`, and `getPhase` from `tests/packages/data/index.ts`

**Phase allocation rules:**
- For 5 or fewer iterations: two phases (explore, converge — no transition)
- For 6 or more: three phases (explore, transition, converge)
- Extra iterations beyond the base are distributed round-robin: explore first, then transition, then converge

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

**Acceptance Criteria:**
- `getPhase` returns the correct phase for every row in the allocation table
- `getPhase(1, 1)` returns `'explore'` (edge case: single iteration)
- `getPhase` handles large `maxIterations` values (e.g. 20, 100) without error
- `Phase` and `EntityType` are exported from the data package's public API

**Testing:**
- New test file `tests/packages/data/src/phase.test.ts`
- Unit tests covering the full allocation table (parameterized across all rows)
- Edge cases: iteration 1 with maxIterations 1, large maxIterations values
- Prior art: see existing parameterized test patterns in `tests/packages/data/src/scil-prompt.test.ts`

*Source: [Implementation §1](divergent-convergent-description-improvement.md#1-new-file-testspackagesdatasrcphasets), [Design > Phase Allocation](divergent-convergent-description-improvement.md#phase-allocation)*

---

### 2. As a harness developer, I want a `getPhaseInstructions` function that returns phase-specific and entity-specific instruction text, so that improvement prompts vary their rewriting strategy based on the current phase.

**What to build:**
- Add to `tests/packages/data/src/phase.ts`:
  - `getPhaseInstructions(phase: Phase, entityType: EntityType, iterations: { trainAccuracy: number; testAccuracy: number | null }[], holdoutFailures?: string[]): string`
- The function accepts a narrow iteration type that both `IterationResult` and `AcilIterationResult` satisfy
- Entity-specific vocabulary: "skill" produces "WHAT the skill does / WHEN to use it / trigger the skill"; "agent" produces "WHAT the agent does / WHEN to delegate to it / trigger delegation"
- All phases preserve structural constraints: describe WHAT/WHEN, include boundary statements, keep to 3-5 sentences under 1024 characters, generalize rather than list specific cases
- Phase behavior:
  - **Explore:** Write a fundamentally different description from all previous iterations. Start fresh, restructure sentences, reframe the domain, use different vocabulary. Do NOT make incremental edits.
  - **Transition:** Identify patterns that correlated with higher accuracy across previous iterations. Combine the strongest elements from best-performing iterations while still experimenting with boundary statements and trigger phrasing.
  - **Converge:** Make targeted, surgical edits to improve failing cases without regressing passing ones. Reference the best train accuracy from the iterations array. When train accuracy is 1.0 and `holdoutFailures` is non-empty, include the failing holdout query texts as "additional user messages your description should handle." In explore and transition phases, `holdoutFailures` is ignored.
- Export `getPhaseInstructions` from `tests/packages/data/index.ts`

**Acceptance Criteria:**
- Each phase produces distinct instruction text with the correct rewriting strategy
- Entity type controls vocabulary ("skill" vs "agent" phrasing)
- Converge phase derives best train accuracy from the iterations array
- Converge phase includes holdout failure texts only when train accuracy is 1.0 AND holdoutFailures is non-empty
- Converge phase omits holdout failure texts when train accuracy < 1.0 or holdoutFailures is empty/undefined
- Explore and transition phases ignore holdoutFailures regardless of input
- All phases include structural constraints (WHAT/WHEN, boundaries, character limit)

**Testing:**
- Add to `tests/packages/data/src/phase.test.ts`:
  - Unit tests for each phase × each entity type (6 combinations)
  - Converge with holdout failures: includes failing query texts when train accuracy is 1.0 and holdoutFailures is non-empty
  - Converge without holdout failures: omits them when train accuracy < 1.0 or holdoutFailures is empty
  - Explore/transition with holdoutFailures provided: ignores them

*Source: [Implementation §1](divergent-convergent-description-improvement.md#1-new-file-testspackagesdatasrcphasets), [Iteration Review Summary — scope expansion decisions](divergent-convergent-description-improvement.md#iteration-review-summary)*

---

### 3. As a harness developer, I want `phase` recorded on iteration result types, so that I can trace which phase produced each iteration for debugging and display.

**What to build:**
- In `tests/packages/data/src/types.ts`:
  - Add `phase: Phase` to `IterationResult` (import `Phase` from `./phase.js`)
  - Add `phase: Phase` to `AcilIterationResult`
  - Add `phase: Phase | null` to `ScilIterationRecord`, `AcilIterationRecord`, `ScilIterationRow`, and `AcilIterationRow` (null for backward compatibility with existing Parquet data that predates the phase system)

**Acceptance Criteria:**
- `IterationResult` and `AcilIterationResult` require a `phase: Phase` field
- Record and row types accept `phase: Phase | null`
- Existing code that constructs these types gets a TypeScript error until `phase` is supplied
- TypeScript compiles without errors after all consuming code is updated

**Testing:**
- No dedicated test file for type changes — TypeScript compilation is the acceptance gate
- All existing test factories that construct `IterationResult`, `AcilIterationResult`, or the record/row types must be updated to include `phase` (covered by stories 6, 7, 8, 9, 10, 11)

*Source: [Implementation §1b](divergent-convergent-description-improvement.md#1b-update-testspackagesdatasrctypests)*

---

### 4. As a harness developer, I want the SCIL improvement prompt to use phase-specific instructions instead of static rules, so that explore iterations rewrite from scratch and converge iterations make surgical edits.

**What to build:**
- In `tests/packages/data/src/scil-prompt.ts`:
  - Add `phase: Phase` and `testResults?: QueryResult[]` to `buildImprovementPrompt` options
  - Replace static rules #1-5 (lines 71-76) and `generalizationHint` (lines 39-43) with a call to `getPhaseInstructions(phase, 'skill', opts.iterations, holdoutFailures)`
  - Derive `holdoutFailures` from `testResults`: extract `promptContent` from failing test results (`testResults.filter(r => !r.passed).map(r => r.promptContent)`) only when all train results pass and phase is `'converge'`; otherwise pass `undefined`
  - Remove the `allTrainPass` variable and `generalizationHint` logic entirely

**Acceptance Criteria:**
- `buildImprovementPrompt` requires a `phase` parameter
- Static rules #1-5 are replaced by phase-specific instructions
- `generalizationHint` conditional is completely removed
- Converge phase with perfect train accuracy and failing holdout queries includes the failing query texts
- Other phases or imperfect train accuracy do not include holdout query texts
- Output still includes iteration history, current description, and other structural elements unchanged

**Testing:**
- Update existing 10 tests in `tests/packages/data/src/scil-prompt.test.ts` to pass `phase` parameter via test factories
- Add tests verifying that each phase produces the expected instruction style in the prompt output
- Add tests verifying holdout failure text inclusion/exclusion logic
- Prior art: existing test patterns in `scil-prompt.test.ts`

*Source: [Implementation §2](divergent-convergent-description-improvement.md#2-update-testspackagesdatasrcscil-promptts)*

---

### 5. As a harness developer, I want the ACIL improvement prompt to use phase-specific instructions instead of static rules, so that the ACIL loop benefits from the same divergent-convergent strategy as SCIL.

**What to build:**
- In `tests/packages/data/src/acil-prompt.ts`:
  - Add `phase: Phase` and `testResults?: AcilQueryResult[]` to `buildAcilImprovementPrompt` options
  - Replace static rules #1-5 (lines 71-76) and `generalizationHint` (lines 39-43) with a call to `getPhaseInstructions(phase, 'agent', opts.iterations, holdoutFailures)`
  - Derive `holdoutFailures` identically to the SCIL variant
  - Remove the `allTrainPass` variable and `generalizationHint` logic entirely

**Acceptance Criteria:**
- `buildAcilImprovementPrompt` requires a `phase` parameter
- Static rules #1-5 are replaced by phase-specific instructions using agent vocabulary
- `generalizationHint` conditional is completely removed
- Converge phase holdout failure logic behaves identically to the SCIL variant
- Output still includes iteration history, current description, and other structural elements unchanged

**Testing:**
- Update existing 15 tests in `tests/packages/data/src/acil-prompt.test.ts` to pass `phase` parameter via test factories
- Add tests verifying phase-specific instruction content and agent vocabulary
- Add tests verifying holdout failure text inclusion/exclusion logic
- Prior art: existing test patterns in `acil-prompt.test.ts`

*Source: [Implementation §3](divergent-convergent-description-improvement.md#3-update-testspackagesdatasrcacil-promptts)*

---

### 6. As a harness developer, I want the SCIL step-7 improve-description to accept and pass through phase and test results, so that the improvement prompt receives phase context from the loop orchestrator.

**What to build:**
- In `tests/packages/execution/src/scil/step-7-improve-description.ts`:
  - Add `phase: Phase` and `testResults?: QueryResult[]` to `ImproveDescriptionOptions`
  - Pass `phase` and `testResults` through to `buildImprovementPrompt`

**Acceptance Criteria:**
- `ImproveDescriptionOptions` includes `phase` and `testResults` fields
- Both values are forwarded to `buildImprovementPrompt` without transformation
- TypeScript compiles without errors

**Testing:**
- Update existing 28 tests in `tests/packages/execution/src/scil/step-7-improve-description.test.ts` to pass `phase` parameter
- Verify `phase` and `testResults` appear in the call to `buildImprovementPrompt`
- Prior art: existing mock patterns in `step-7-improve-description.test.ts`

*Source: [Implementation §4](divergent-convergent-description-improvement.md#4-update-testspackagesexecutionsrcscilstep-7-improve-descriptionts)*

---

### 7. As a harness developer, I want the ACIL step-7 improve-description to accept and pass through phase and test results, so that the ACIL improvement prompt receives phase context from the loop orchestrator.

**What to build:**
- In `tests/packages/execution/src/acil/step-7-improve-description.ts`:
  - Add `phase: Phase` and `testResults?: AcilQueryResult[]` to `ImproveDescriptionOptions`
  - Pass `phase` and `testResults` through to `buildAcilImprovementPrompt`

**Acceptance Criteria:**
- `ImproveDescriptionOptions` includes `phase` and `testResults` fields
- Both values are forwarded to `buildAcilImprovementPrompt` without transformation
- TypeScript compiles without errors

**Testing:**
- Update existing 18 tests in `tests/packages/execution/src/acil/step-7-improve-description.test.ts` to pass `phase` parameter
- Verify `phase` and `testResults` appear in the call to `buildAcilImprovementPrompt`
- Prior art: existing mock patterns in `step-7-improve-description.test.ts`

*Source: [Implementation §5](divergent-convergent-description-improvement.md#5-update-testspackagesexecutionsrcacilstep-7-improve-descriptionts)*

---

### 8. As a harness developer, I want the SCIL loop to compute and use phase for each iteration, so that explore iterations always generate new descriptions and early stopping is suppressed until converge.

**What to build:**
- In `tests/packages/execution/src/scil/loop.ts`:
  - Import `getPhase` from `@testdouble/harness-data`
  - At the **top** of the `for (let i = 1; i <= config.maxIterations; i++)` loop body, call `const phase = getPhase(i, config.maxIterations)`
  - Record `phase` on the `IterationResult` object pushed to the iterations array
  - Pass `phase` and `testResults` to `improveDescription`
  - Modify `needsImprovement`: during explore and transition phases, always true (generate diverse descriptions regardless of accuracy). Only in converge phase does the existing accuracy check apply (`trainAccuracy < 1.0 || (holdout > 0 && testAccuracy < 1.0)`)
  - Modify early stopping: suppress the `if (perfectTrain && perfectTest) break` until at least one converge iteration has completed. Only break if `phase === 'converge'` (or a converge iteration has already run). This prevents explore/transition from exiting before converge refines the description.

**Acceptance Criteria:**
- `getPhase` is called at the top of each loop iteration
- `phase` is recorded on every `IterationResult`
- `phase` and `testResults` are passed to `improveDescription`
- During explore/transition phases, `needsImprovement` is always true even at perfect accuracy
- Early stopping only fires during or after a converge iteration
- `selectBestIteration` remains phase-agnostic — selects on outcomes, not process

**Testing:**
- Update existing 18 tests in `tests/packages/execution/src/scil/loop.test.ts`:
  - Mock `getPhase` import
  - Update `improveDescription` mock assertions to verify `phase` and `testResults` params
  - Add tests: `needsImprovement` always true in explore/transition (improvement called even at perfect accuracy)
  - Add tests: early stopping suppressed during explore/transition (loop continues past perfect scores)
  - Add tests: early stopping fires during converge phase at perfect scores
- Prior art: existing mock patterns in `loop.test.ts`

*Source: [Implementation §6](divergent-convergent-description-improvement.md#6-update-testspackagesexecutionsrcscillooptts), [Iteration Review Summary — scope expansion decisions](divergent-convergent-description-improvement.md#iteration-review-summary)*

---

### 9. As a harness developer, I want the ACIL loop to compute and use phase for each iteration, so that the ACIL loop benefits from the same divergent-convergent loop behavior as SCIL.

**What to build:**
- In `tests/packages/execution/src/acil/loop.ts`:
  - Same changes as the SCIL loop (story 8): import `getPhase`, call at top of loop body, record `phase` on `AcilIterationResult`, pass `phase` and `testResults` to `improveDescription`, apply same `needsImprovement` and early stopping phase gates

**Acceptance Criteria:**
- Same as story 8, applied to the ACIL loop
- ACIL loop behavior mirrors SCIL loop behavior for phase computation, needsImprovement gating, and early stopping

**Testing:**
- Update existing 17 tests in `tests/packages/execution/src/acil/loop.test.ts`:
  - Same changes as SCIL loop tests (story 8)
- Prior art: existing mock patterns in `loop.test.ts`

*Source: [Implementation §7](divergent-convergent-description-improvement.md#7-update-testspackagesexecutionsrcacillooptts)*

---

### 10. As a harness developer, I want `phase` included in serialized iteration output, so that JSONL files and Parquet data contain phase information for analytics.

**What to build:**
- In `tests/packages/execution/src/common/write-output.ts`:
  - Add `phase?: string` to the `WritableIteration` interface (lines 5-12). The existing spread (`...iteration`) already passes through all fields, so adding `phase` ensures TypeScript visibility and documents the contract. No runtime change needed beyond the interface update.
- In `tests/packages/data/src/analytics.ts`:
  - No SQL changes needed. The `*` in `selectExpression` on SCIL iteration import (line 187) and ACIL iteration import (line 215) already picks up all JSONL fields including `phase`. DuckDB's schema evolution handles additive columns via union-by-name with NULL fill for existing Parquet files.
- In `tests/packages/data/src/run-status.ts`:
  - The query functions `queryScilRunDetails` and `queryAcilRunDetails` return iteration rows to the web frontend. The `SELECT *` queries already include `phase` via the updated `ScilIterationRow`/`AcilIterationRow` types from story 3.

**Acceptance Criteria:**
- `WritableIteration` interface includes `phase?: string`
- JSONL output files contain `phase` field on each iteration record
- Existing Parquet files without `phase` show NULL when queried
- `queryScilRunDetails` and `queryAcilRunDetails` return `phase` in iteration rows
- TypeScript compiles without errors

**Testing:**
- Update `tests/packages/execution/src/common/write-output.test.ts` (10 existing tests): add `phase` to `makeIteration` factory
- Update `tests/packages/execution/src/scil/step-9-write-output.test.ts` (15 existing tests): add `phase` to `makeIteration` factory
- Update `tests/packages/execution/src/acil/step-9-write-output.test.ts` (6 existing tests): add `phase` to `makeIteration` factory
- Prior art: existing factory patterns in these test files

*Source: [Implementation §8](divergent-convergent-description-improvement.md#8-update-testspackagesexecutionsrccommonwrite-outputts), [Implementation §9](divergent-convergent-description-improvement.md#9-update-testspackagesdatasrcanalyticsts), [Implementation §10](divergent-convergent-description-improvement.md#10-update-testspackagesdatasrcrun-statusts)*

---

### 11. As a harness developer, I want phase displayed in CLI console output, so that I can see which phase each iteration is running during execution.

**What to build:**
- In `tests/packages/execution/src/common/print-report.ts`:
  - Add `phase?: string` to the `PrintableIteration` interface (lines 7-14)
  - In `printIterationProgress` (line 16): append a phase tag to the iteration line, e.g. `Iteration 1/5 [explore] — train: 80% (4/5)`. When `phase` is undefined (legacy callers), omit the tag.
  - In `printFinalSummary` (line 46): add a `Phase` column to the iteration table. When `phase` is undefined on an iteration (legacy data), show `—` in the column.

**Acceptance Criteria:**
- `PrintableIteration` includes `phase?: string`
- `printIterationProgress` output includes `[explore]`, `[transition]`, or `[converge]` tag when phase is present
- `printIterationProgress` output has no tag when phase is undefined
- `printFinalSummary` table includes a Phase column with phase names or `—` for legacy data
- Existing "all same score" warning behavior in `printFinalSummary` is unchanged

**Testing:**
- Update `tests/packages/execution/src/common/print-report.test.ts`:
  - Add `phase` to test factories
  - Add assertions for `[explore]`/`[transition]`/`[converge]` tags in `printIterationProgress` output
  - Add assertions for Phase column in `printFinalSummary` table
  - Verify graceful handling when `phase` is undefined (legacy callers)
- Prior art: existing test patterns in `print-report.test.ts`

*Source: [Implementation §11](divergent-convergent-description-improvement.md#11-update-testspackagesexecutionsrccommonprint-reportts)*

---

### 12. As a harness developer, I want phase displayed as colored badges in the web dashboard iteration detail pages, so that I can visually identify which phase produced each iteration.

**What to build:**
- In `tests/packages/web/src/client/pages/ScilDetail.tsx`:
  - In the iteration header (currently "Iteration N" with optional "Best" badge), add a colored phase badge
  - Colors: explore = blue (#60a5fa), transition = amber (#fbbf24), converge = green (#4ade80)
  - When `phase` is null (legacy data), show no badge
- In `tests/packages/web/src/client/pages/AcilDetail.tsx`:
  - Same phase badge rendering as ScilDetail.tsx

**Acceptance Criteria:**
- Each iteration header shows a colored badge matching its phase
- Explore = blue, transition = amber, converge = green
- Legacy iterations (phase is null) show no badge
- No changes to history/summary pages — phase is per-iteration detail only

**Testing:**
- No automated tests required — this is a cosmetic UI change. Visual verification during development.

*Source: [Implementation §12](divergent-convergent-description-improvement.md#12-update-testspackageswebsrcclientpagesscildetailtsx), [Implementation §13](divergent-convergent-description-improvement.md#13-update-testspackageswebsrcclientpagesacildetailtsx)*

---

## Implementation Decisions

- **Phase type is a string literal union** (`'explore' | 'transition' | 'converge'`), not an enum — matches codebase convention of inline unions (e.g. `'train' | 'test'` in types.ts)
- **EntityType discriminator** (`'skill' | 'agent'`) controls vocabulary in phase instructions, keeping the core logic shared between SCIL and ACIL
- **`getPhaseInstructions` accepts a narrow iteration shape** (`{ trainAccuracy: number; testAccuracy: number | null }[]`) that both `IterationResult` and `AcilIterationResult` satisfy — avoids coupling to specific domain types
- **Holdout failure texts surfaced in converge phase only**, and only when train accuracy is 1.0 — gives the model concrete patterns to generalize toward without leaking pass/fail status
- **`needsImprovement` always true during explore/transition** — prevents wasted eval cycles where the loop re-evaluates an unchanged description
- **Early stopping suppressed until at least one converge iteration completes** — prevents an explore iteration from exiting the loop before converge has refined the description
- **`selectBestIteration` remains phase-agnostic** — selects on outcomes (accuracy), not process (phase)
- **Holdout split ratio stays fixed across all phases** — changing it per phase would break cross-iteration accuracy comparisons
- **`phase` is `Phase | null` on record/row types** for backward compatibility with existing Parquet data
- **`WritableIteration.phase` is `string` not `Phase`** — the serialization interface uses the looser type; `Phase` string literal union is compatible
- **Phase column placement in `printFinalSummary`** is an open cosmetic question (between Iteration/Train columns or as suffix in Iteration column) — does not affect correctness

*Source: [Iteration Review Summary](divergent-convergent-description-improvement.md#iteration-review-summary)*

## Testing Decisions

- **Good tests verify external behavior, not implementation details.** Test that the correct phase instructions appear in prompt output, not the internal logic of string assembly. Test that the loop calls `improveDescription` with the correct `phase` value, not how `needsImprovement` is computed internally.
- **New unit tests** for `getPhase` and `getPhaseInstructions` in `tests/packages/data/src/phase.test.ts`
- **Updated existing tests** across 10 test files to supply the new `phase` parameter via test data factories. Test counts from source document:
  - `scil-prompt.test.ts`: 10 existing tests
  - `acil-prompt.test.ts`: 15 existing tests
  - `step-7-improve-description.test.ts` (SCIL): 28 existing tests across 2 describe blocks
  - `step-7-improve-description.test.ts` (ACIL): 18 existing tests in 1 describe block
  - `loop.test.ts` (SCIL): 18 existing tests
  - `loop.test.ts` (ACIL): 17 existing tests
  - `write-output.test.ts`: 10 existing tests
  - `step-9-write-output.test.ts` (SCIL): 15 existing tests
  - `step-9-write-output.test.ts` (ACIL): 6 existing tests
  - `print-report.test.ts`: existing tests
- **New behavioral tests** in loop test files for `needsImprovement` always-true in explore/transition and early stopping suppression until converge
- **No automated tests for UI badge changes** (stories 12) — visual verification
- **Prior art:** existing test factories (`make*` prefix), Vitest mocking patterns, and parameterized test structures throughout the test packages

*Source: [Implementation §14](divergent-convergent-description-improvement.md#14-tests)*

## Out of Scope

- **Changing holdout split ratios per phase** — would break cross-iteration accuracy comparisons
- **Making `selectBestIteration` phase-aware** — it selects on outcomes, not process
- **Phase display on history/summary web pages** — phase is per-iteration detail only, shown on ScilDetail and AcilDetail pages
- **Configurable phase allocation** — the allocation table is fixed; no user-facing configuration
- **Changes to the CLI command interface** — no new commands or flags; phase is derived automatically from iteration position

## Further Notes

- The source planning document went through 10 iterations of review (3 original + 1 grill-me + 3 iterative plan review + 3 second iterative plan review) with 48 assumptions challenged and verified against the codebase.
- DuckDB's schema evolution handles additive columns via union-by-name with NULL fill, so existing Parquet files without `phase` will show NULL when queried — no migration needed.
- The `write-output.ts` functions now accept a `prefix: string` parameter (discovered during verification) — this does not affect the planned changes since `phase` is added to the `WritableIteration` interface, not the function signatures.
