# Consistent Derived Key Usage

- **Status:** proposed
- **Date Created:** 2026-04-07
- **Last Updated:** 2026-04-07
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - `packages/data/src/jsonl-writer.ts` (JSONL record persistence)
  - `packages/evals/src/llm-judge-eval.ts` (JSONL record lookup)
  - `packages/evals/src/evaluate.ts` (event stream lookup by test case)
  - `packages/execution/src/test-runners/*/index.ts` (test runner output file writers)
  - `packages/execution/src/test-eval/run-test-eval.ts` (test-eval event lookup)
  - Any code that writes or reads JSONL records keyed by a derived identifier

## Introduction

This coding standard requires that all write and read paths for JSONL-persisted records use the same key derivation function when constructing or querying record identifiers.

### Purpose

When a JSONL record is keyed by a derived identifier (e.g., `buildTestCaseId(suite, test.name)` rather than raw `test.name`), every site that writes, reads, or filters those records must use the same derivation function. A mismatch between write-side and read-side key construction causes silent data loss — lookups return empty results with no error, making the bug invisible until downstream behavior fails for unrelated-seeming reasons.

### Scope

All TypeScript code in the harness workspace that persists or queries JSONL records using derived keys. The canonical example is `buildTestCaseId`, but the principle applies to any key derivation function used across write/read boundaries.

## Background

The test harness persists output files to `output-files.jsonl` with a `test_name` field built via `buildTestCaseId(suite, test.name)`, which produces a slugified composite key (e.g., `"test-engineer-Agent-Prompt-test-plan-for-go-security-project"`). When `llm-judge-eval.ts` was written, it looked up output files using the raw `test.name` (e.g., `"Agent Prompt: test plan for go-security-project"`). The keys never matched, so `loadOutputFiles` silently returned an empty map for every test. All file-scoped rubric criteria auto-failed with "Output file was not produced by the agent" — even though the files were correctly extracted and stored.

The bug was a one-liner to fix but took significant investigation to find, because no error was raised. The empty map was a valid return value (it means "no files produced"), making the mismatch indistinguishable from a legitimate empty result.

## Coding Standard

### Use the Same Derivation Function at Write and Read Sites

When JSONL records are keyed by a derived identifier, both the code that writes the records and the code that queries them must call the same derivation function to construct the key.

**Correct usage:**

```typescript
// Write path (test runner) — uses buildTestCaseId
await appendOutputFiles(runDir, testRunId, buildTestCaseId(suite, test.name), outputFiles)

// Read path (evaluator) — uses the same buildTestCaseId
const outputFiles = await loadOutputFiles(runDir, buildTestCaseId(suite, test.name))
```

**What to avoid:**

```typescript
// Write path — uses buildTestCaseId
await appendOutputFiles(runDir, testRunId, buildTestCaseId(suite, test.name), outputFiles)

// Read path — uses raw test.name (WRONG: will never match the derived key)
const outputFiles = await loadOutputFiles(runDir, test.name)
```

**Project references:**
- `packages/execution/src/test-runners/agent-prompt/index.ts:106` — write path using `buildTestCaseId`
- `packages/execution/src/test-runners/skill-call/index.ts:98` — write path using `buildTestCaseId`
- `packages/execution/src/test-runners/agent-call/index.ts:98` — write path using `buildTestCaseId`
- `packages/execution/src/test-runners/prompt/index.ts:94` — write path using `buildTestCaseId`
- `packages/evals/src/llm-judge-eval.ts:95` — read path using `buildTestCaseId` (fixed)
- `packages/evals/src/evaluate.ts:29,54` — event lookup using `buildTestCaseId`
- `packages/execution/src/test-eval/run-test-eval.ts:139` — event lookup using `buildTestCaseId`

### Treat Silent Empty Results as a Bug Signal

When a JSONL lookup returns no records, the default assumption should be that no data exists — not that the key was constructed wrong. This makes key mismatches especially dangerous because the failure mode (empty result) is a valid state. When adding a new read path for existing JSONL data, verify the key construction by checking the actual persisted data format, not just the test configuration schema.

**Correct usage:**

```typescript
// When writing a new read path, confirm the key matches what's stored:
// 1. Check how writers construct the key (search for appendOutputFiles, appendTestRun, etc.)
// 2. Use the same derivation (buildTestCaseId, not raw test.name)
// 3. Add a test that mocks JSONL records with the derived key and asserts they are found
```

**What to avoid:**

```typescript
// Don't assume the stored key matches the in-memory field name.
// output-files.jsonl stores test_name as buildTestCaseId output,
// NOT as the raw test.name from test config.
```

## Additional Resources

### Project Documentation

- [Step-Based Pipeline Architecture](./step-based-pipeline.md) — related standard for how pipeline steps pass data between stages
- [Vacuous Truth Guards](./vacuous-truth-guards.md) — related standard for another class of silent failure where valid-looking values mask bugs
