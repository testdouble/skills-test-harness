# Vacuous Truth Guards

- **Status:** proposed
- **Date Created:** 2026-04-02
- **Last Updated:** 2026-04-02
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - `packages/data/src/acil-prompt.ts` (improvement prompt builder)
  - `packages/data/src/scil-prompt.ts` (improvement prompt builder)
  - Any code using `.every()` on arrays that may be empty

## Introduction

This coding standard defines how `.every()` calls on potentially empty arrays are guarded to prevent vacuous truth from triggering unintended logic.

### Purpose

In JavaScript, `[].every(predicate)` returns `true` for any predicate — this is called vacuous truth. When `.every()` is used to detect "all items pass," an empty array is incorrectly treated as a success condition. This caused a bug where an empty `trainResults` array triggered a "generalization hint" in the improvement prompt, telling the LLM that all tests pass when none had actually been run.

### Scope

All TypeScript code in the harness workspace that uses `.every()` on arrays that may legitimately be empty at runtime. The most common case is checking if all test results pass before triggering special behavior.

## Background

Both `acil-prompt.ts` and `scil-prompt.ts` had the same bug:

```typescript
if (opts.trainResults.every(r => r.passed)) {
  lines.push('All training queries currently pass...')
}
```

When `trainResults` was an empty array, `.every()` returned `true` and the generalization hint was added, misleading the improvement LLM into thinking all tests pass.

## Coding Standard

### Check Array Length Before `.every()`

When `.every()` is used to conditionally trigger behavior, add a `.length > 0` guard before the `.every()` call. Use `&&` short-circuit evaluation to keep it concise.

**Correct usage:**

```typescript
if (opts.trainResults.length > 0 && opts.trainResults.every(r => r.passed)) {
  lines.push('All training queries currently pass. Watch for over-fitting.')
}
```

**What to avoid:**

```typescript
// Don't use .every() alone on a potentially empty array
if (opts.trainResults.every(r => r.passed)) {
  lines.push('All training queries currently pass.')  // fires when trainResults is empty
}

// Don't use .filter().length as a workaround when .every() is the right semantic
if (opts.trainResults.filter(r => r.passed).length === opts.trainResults.length) {
  // This works but is needlessly indirect — also returns true for empty arrays
}
```

**Project references:**
- `packages/data/src/acil-prompt.ts:39` — guarded `.every()` with length check
- `packages/data/src/scil-prompt.ts:42` — guarded `.every()` with length check

### The Same Risk Applies to `.some()` in Negated Form

While `[].some()` returns `false` (not vacuously true), be aware that `!arr.some(pred)` behaves the same as `arr.every(r => !pred(r))` — both return `true` for empty arrays. If using negated `.some()` to mean "none match," add a length guard if the empty case should not trigger the behavior.

## Additional Resources

### Project Documentation

- [NaN-Safe Numeric Handling](./nan-safe-numeric-handling.md) — related standard for another class of silent JavaScript value trap
