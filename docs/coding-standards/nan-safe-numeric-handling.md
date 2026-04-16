# NaN-Safe Numeric Handling

- **Status:** proposed
- **Date Created:** 2026-04-02
- **Last Updated:** 2026-04-02
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - `packages/execution/src/common/score.ts` (best-iteration selection)
  - `packages/execution/src/common/print-report.ts` (accuracy display)
  - `packages/data/src/acil-prompt.ts` (improvement prompt builder)
  - `packages/data/src/scil-prompt.ts` (improvement prompt builder)

## Introduction

This coding standard defines how numeric values that may be `NaN` are handled across the harness codebase — particularly accuracy scores, percentages, and metrics that derive from division or optional fields.

### Purpose

`NaN` is not caught by null checks (`!== null`), is not nullish (`??` passes it through), and silently poisons arithmetic and comparisons (`NaN > x` is always `false`, `Math.round(NaN)` is `NaN`). These properties caused multiple bugs where NaN accuracy values produced `"NaN%"` output, broke best-iteration selection, or skipped valid comparisons.

### Scope

All TypeScript code in the harness workspace that performs numeric comparisons, formatting, or accumulation on values that could be `NaN` — most commonly `testAccuracy` and `trainAccuracy` fields derived from division where the denominator may be zero or the value may be absent.

## Background

During the ACIL and SCIL pipeline development, NaN bugs appeared in four independent locations:

1. `print-report.ts` — `testAccuracy !== null` passed for `NaN`, producing `"NaN%"` in progress output
2. `score.ts` — `testAccuracy ?? 0` did not coerce `NaN` (it is not nullish), causing `NaN > bestScore` to always fail in best-iteration selection
3. `score.ts` — `trainAccuracy` in the tiebreaker path was not coerced, making NaN tiebreakers "unbeatable"
4. `acil-prompt.ts` / `scil-prompt.ts` — `Math.round(iter.trainAccuracy * 100)` produced `"NaN%"` in iteration history

Each bug had the same root cause: treating `NaN` as equivalent to `null` or assuming standard operators would handle it.

## Coding Standard

### Guard with `isNaN()` Before Comparisons and Formatting

Any numeric value that could be `NaN` must be checked with `isNaN()` before it is compared, formatted, or used in arithmetic. Coerce `NaN` to a sensible default (usually `0` for scores).

**Correct usage:**

```typescript
// score.ts — coerce NaN to 0 before comparison
const currentScore = isNaN(current.testAccuracy) ? 0 : current.testAccuracy
const bestScore = isNaN(best.testAccuracy) ? 0 : best.testAccuracy
if (currentScore > bestScore) { ... }
```

```typescript
// print-report.ts — guard before formatting
const testPart = testAccuracy !== null && !isNaN(testAccuracy)
  ? ` | test: ${Math.round(testAccuracy * 100)}%`
  : ''
```

```typescript
// prompt builder — guard in iteration history formatting
const train = isNaN(iter.trainAccuracy) ? 0 : Math.round(iter.trainAccuracy * 100)
lines.push(`Iteration ${i + 1}: ${train}% accuracy`)
```

**What to avoid:**

```typescript
// Don't rely on !== null — NaN passes this check
if (testAccuracy !== null) {
  output += `${Math.round(testAccuracy * 100)}%`  // produces "NaN%"
}

// Don't rely on ?? — NaN is not nullish
const score = testAccuracy ?? 0  // NaN passes through unchanged

// Don't assume arithmetic catches it — NaN propagates silently
const total = trainAccuracy + testAccuracy  // NaN if either is NaN
```

**Project references:**
- `packages/execution/src/common/score.ts` — `selectBestIteration` with `isNaN` coercion
- `packages/execution/src/common/print-report.ts` — `printIterationProgress` with `isNaN` guard
- `packages/data/src/acil-prompt.ts` — iteration history with `isNaN` guard
- `packages/data/src/scil-prompt.ts` — iteration history with `isNaN` guard

### Do Not Use `Number.isNaN()` for This Pattern

Use the global `isNaN()` function, not `Number.isNaN()`. The global `isNaN()` coerces its argument to a number first, which is the desired behavior when the value is already typed as `number` (including `NaN`). `Number.isNaN()` is stricter and appropriate for type-narrowing mixed types, but in this codebase all values are already `number | null`, so either works — the convention is global `isNaN()` for consistency with existing code.

**Project references:**
- `packages/execution/src/common/score.ts:29-30` — uses `isNaN()` consistently

### Apply the Same Guard to Both Sides of a Comparison

When comparing two values that could both be `NaN`, coerce both. A common mistake is guarding the current value but not the stored best value.

**Correct usage:**

```typescript
const currentScore = isNaN(current.testAccuracy) ? 0 : current.testAccuracy
const bestScore = isNaN(best.testAccuracy) ? 0 : best.testAccuracy

// Tiebreaker must also guard
const currentTrain = isNaN(current.trainAccuracy) ? 0 : current.trainAccuracy
const bestTrain = isNaN(best.trainAccuracy) ? 0 : best.trainAccuracy
```

**What to avoid:**

```typescript
// Don't guard only one side — the other side can still be NaN
const currentScore = isNaN(current.testAccuracy) ? 0 : current.testAccuracy
if (currentScore > best.testAccuracy) { ... }  // best.testAccuracy could be NaN
```

## Additional Resources

### Project Documentation

- [Immutable Data Patterns](./immutable-data-patterns.md) — related standard for safe data transformations
- [Step-Based Pipeline Architecture](./step-based-pipeline.md) — pipeline step conventions where these patterns appear
