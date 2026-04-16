# File Output Capture for Rubric Evaluations

## Problem

Several skills and agents write output directly to the filesystem (e.g., `r-and-d:gap-analyzer`, `r-and-d:coding-standard`, `r-and-d:mission-brief-generator`). The test harness only captures Claude's stream-json stdout — files written inside the Docker sandbox are never extracted. Rubric-based evaluations for these skills and agents never pass completely because the LLM judge cannot see the actual file deliverables.

## Goals

1. Capture files written by skills/agents during test execution
2. Make captured files available to rubric-based LLM judge evaluations
3. Persist file content in analytics (Parquet) so it survives `output/` cleanup
4. Display file content in the harness web app for manual review

## Design Decisions

### 1. File Detection: Diff-Based via Git

Always initialize a git repo in `sandbox-run.sh`, even when no scaffold is provided. Always create a working directory with `mktemp -d` and `cd` into it. When a scaffold exists, copy it in and commit. When no scaffold exists, commit empty (the repo starts clean either way).

After Claude execution completes, run `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard` in the working directory to detect all new and modified files. This approach:

- Does not require changing where agents write files — they continue writing wherever their instructions say
- Does not require prompt injection to redirect output to a special directory
- Works universally because git is always initialized
- Catches both modified tracked files and newly created untracked files

**Change to `sandbox-run.sh`:** Move the temp dir creation (`mktemp -d`) and `cd` outside the scaffold conditional so they always execute. The scaffold conditional only controls whether files are copied in before the initial commit. The git init + initial commit always run.

### 2. Workdir Tracking

`sandbox-run.sh` writes the temp directory path to `/tmp/last-workdir` before launching Claude. The extraction script reads this path to know where to look. Both scripts run in the same Docker sandbox, so `/tmp/last-workdir` persists between `execInSandbox` calls.

### 3. Extraction: Dedicated `sandbox-extract.sh`

A new shell script that runs inside the Docker sandbox after each test case completes. It:

1. Reads the workdir path from `/tmp/last-workdir`
2. Runs `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` to get new/modified files
3. For each file, emits a single JSON line to stdout with `path` and `content` fields
4. Skips files that aren't valid UTF-8 (binary files)

**Output format:** JSONL to stdout (one line per file), not tar. This is necessary because `execInSandbox` captures stdout via `TextDecoder` (`sandbox.ts:40`), which interprets bytes as UTF-8 text. Binary tar output would be corrupted. JSONL is text-safe and consistent with the existing data architecture.

```json
{"path": "docs/gap-analysis.md", "content": "# Gap Analysis\n\n..."}
{"path": "docs/coding-standards/naming-conventions.md", "content": "# Naming Conventions\n\n..."}
```

**Size limits:** Individual files over 5MB are skipped with a warning to stderr. Total extraction is capped at 5MB across all files — once the cap is hit, remaining files are listed by path only (content omitted with a truncation marker).

The host side calls `execInSandbox` with this script (scaffold=null, no extra args), captures the JSONL stdout, and passes the parsed results to `appendOutputFiles` for JSONL persistence.

**Timing:** Extraction runs immediately after each individual test case (after `runClaude()` returns, before evaluation begins). This keeps the logic simple — `/tmp/last-workdir` always points to the most recent test's working directory.

### 4. Host-Side Extraction Function

A new `extractOutputFiles` function in `packages/claude-integration` (alongside `run-claude.ts`) that:

1. Resolves the path to `sandbox-extract.sh` using `resolveRelativePath` (same pattern as `sandboxRunScript`)
2. Calls `execInSandbox(extractScript, [], null, debug)`
3. Parses the JSONL stdout into an array of `{ path: string, content: string }` objects
4. Returns the parsed array (empty array if no files changed)

This function is called from the test runners (`agent-prompt/index.ts`, `agent-call/index.ts`, etc.) after `runClaude()` returns and before `writeTestOutput()`.

### 4a. JSONL Persistence: `appendOutputFiles`

A new `appendOutputFiles` function in `packages/data/src/jsonl-writer.ts` (alongside `appendTestConfig`, `appendTestRun`, `appendTestResults`) that:

1. Takes `runDir`, `testRunId`, `testName`, and `{ path, content }[]` from extraction
2. Appends one JSONL line per file to `output-files.jsonl` with `test_run_id`, `test_name`, `file_path`, `file_content` fields
3. Follows the existing `appendFile` + `JSON.stringify` pattern used by sibling functions

### 5. Output Directory Structure

Extracted file content is persisted as `output-files.jsonl` in the run directory — no separate directory tree of extracted files. The JSONL serves both the import pipeline and the web app. Actual files on disk would be redundant since the JSONL already contains the full content.

```
tests/output/{runId}/
  output-files.jsonl       # one record per output file across all test cases
  test-config.jsonl
  test-run.jsonl
  test-results.jsonl
```

Each line in `output-files.jsonl`:

```json
{
  "test_run_id": "20260403T120000",
  "test_name": "agent-call-compare-impl-to-prd",
  "file_path": "docs/gap-analysis.md",
  "file_content": "# Gap Analysis\n\n..."
}
```

**Test name field:** Uses the output of `buildTestCaseId(suite, test.name)` from `packages/data/src/config.ts:105-107` to stay consistent with `test-run.jsonl` and `test-config.jsonl` join keys. Do not invent a new sanitization scheme.

### 6. Analytics Storage: New Parquet File

A new `analytics/output-files.parquet` file with columns:

| Column | Type |
|--------|------|
| `test_run_id` | string |
| `test_name` | string |
| `file_path` | string |
| `file_content` | string |

- Text-only (UTF-8). Binary files are already skipped during extraction.
- One row per output file.
- Imported from `output-files.jsonl` by the `update-analytics` command.

Add a new entry to the `tables` array in `updateAllParquet()` (`packages/data/src/analytics.ts:137-146`):

```typescript
{ name: 'output-files', glob: `${outputDir}/*/output-files.jsonl`, parquet: `${dataDir}/output-files.parquet` },
```

### 7. Empty Output Handling

If `git diff` and `git ls-files --others` return no changed files, the extraction script exits cleanly with no output. No lines are appended to `output-files.jsonl` for that test case. The import pipeline skips empty/missing JSONL. The UI shows no output files section for that test. No special casing needed.

## Rubric Format Changes

### File-Reference Sections

Rubrics can now include `## File: <relative-path>` sections that reference specific output files. Criteria under these sections are evaluated against the file content instead of the transcript/final output.

The parser detects `## File:` headers specifically. All other sections (regardless of heading level) remain "transcript context" — criteria evaluated against transcript and final output as they are today. Existing rubrics that use `## Rubric:` + `### Presence/Specificity/Depth/Absence` do not need reformatting.

```markdown
## Rubric: gap-analyzer quality

### Presence — things the output must contain
- The agent reports the file path where the analysis was written
- The agent completes without errors

## File: docs/gap-analysis.md
### Presence
- The analysis identifies that Rails lacks password hashing
- The analysis references specific file paths

### Depth
- The analysis explains how to remediate each gap
```

### Mixed Sections

A single rubric can contain both traditional sections (evaluated against transcript/final output) and file-reference sections (evaluated against extracted file content). Both are sent to the judge in a single call, with file content injected scoped to the relevant criteria.

### Multiple Files

A rubric can reference multiple files. Each `## File:` section is resolved independently:

```markdown
## File: docs/mission-brief.md
- Contains client name and engagement objectives

## File: docs/lead-working-brief.md
- Contains technical approach

## File: docs/engagement-plan.md
- Contains staffing recommendations
```

### Missing File Handling

If a referenced file was not produced by the agent, all criteria under that `## File:` section automatically fail. No judge call is made for those criteria — the file's absence is sufficient evidence of failure.

## Rubric Parser Changes

The current `parseRubricCriteria` in `packages/evals/src/rubric-parser.ts` returns a flat `string[]` — it strips all section headers and extracts only bullet lines. This must change to return structured section data.

**New return type:**

```typescript
interface RubricSection {
  type: 'transcript' | 'file'
  filePath?: string            // only for type === 'file'
  criteria: string[]
}

function parseRubricSections(markdown: string): RubricSection[]
```

**Parsing rules:**

1. Lines matching `## File: <path>` start a new file-scoped section
2. Any other `##` or `###` heading is treated as a subsection within the current context (transcript or file)
3. Criteria (`- ` lines) are collected into whichever section is currently active
4. Everything before the first `## File:` header (if any) belongs to a single transcript section

**Backward compatibility:** The existing `parseRubricCriteria` function is preserved as a thin wrapper that calls `parseRubricSections` and flattens all criteria into a single `string[]`. Existing callers that don't need file-section awareness continue to work unchanged.

**Testing:** The current `parseRubricCriteria` has no unit tests (only mocked in `llm-judge-eval.test.ts`). Add a `rubric-parser.test.ts` with cases for: transcript-only rubrics (existing format), file-only rubrics, mixed rubrics, multiple file sections, and the backward-compatible `parseRubricCriteria` wrapper. Also update `llm-judge-eval.test.ts` mock signatures for both `parseRubricSections` (replacing `parseRubricCriteria`) and `buildJudgePrompt` (new return type).

## Judge Prompt Changes

The judge prompt builder in `packages/evals/src/llm-judge-prompt.ts` must:

1. Accept `RubricSection[]` instead of (or in addition to) `string[]`
2. For transcript sections: build the prompt as today (transcript + final output + criteria)
3. For file sections: inject the file content under a `# Output File: <path>` heading, followed by that section's criteria
4. If a file section's file is missing: exclude those criteria from the judge call entirely (they auto-fail)
5. Combine all sections into a single judge prompt so one judge call evaluates everything

**Signature change for `buildJudgePrompt`:**

```typescript
export async function buildJudgePrompt(
  sections: RubricSection[],          // was: criteria: string[]
  resultText: string,
  scaffoldDir: string | null,
  events: StreamJsonEvent[],
  outputFiles: Map<string, string>,   // new: path → content from extraction
  context?: { testType?: string }
): Promise<{ prompt: string; autoFailCriteria: string[] }>
```

The `autoFailCriteria` return lets the caller mark missing-file criteria as failed without sending them to the judge.

## Eval Pipeline Changes

`evaluateLlmJudge` in `packages/evals/src/llm-judge-eval.ts` needs access to extracted output files.

**Data source:** Read from `output-files.jsonl` in the run directory (`output/{testRunId}/output-files.jsonl`). Filter lines where `test_name` matches the current test case. Build a `Map<string, string>` of `file_path → file_content`.

**Signature change:**

```typescript
export async function evaluateLlmJudge(
  record: TestConfigRecord,
  events: StreamJsonEvent[],
  testRunId: string,
  suiteDir: string,
  runDir: string,              // new: path to output/{testRunId}/
  onProgress?: OnProgress
): Promise<LlmJudgeEvalResult[]>
```

**Flow change:**

1. Read `output-files.jsonl` from `runDir`, filter to current test case
2. Call `parseRubricSections()` instead of `parseRubricCriteria()`
3. Pass sections + output files map to `buildJudgePrompt()`
4. Handle `autoFailCriteria` — create failed `LlmJudgeCriterionResult` entries for each
5. Merge auto-fail results with judge-evaluated results for scoring

## Web App Changes

### API

Extend the existing `GET /api/test-runs/:runId` response to include an `outputFiles` field:

```typescript
{
  summary: TestRunDetailRow[],
  expectations: TestRunExpectationRow[],
  llmJudgeGroups: LlmJudgeGroup[],
  outputFiles: OutputFile[]  // new
}
```

Where `OutputFile` is:

```typescript
{
  testName: string
  filePath: string
  fileContent: string
}
```

Data is queried from the `output-files.parquet` via DuckDB, same as other analytics data.

### UI

Output files appear as collapsible containers below the related LLM judge results for each test case. Each container:

- Header shows the relative file path (e.g., `docs/coding-standards/naming-conventions.md`)
- Collapsed by default
- On expand, shows the full file content
- Display mode toggle: **rendered markdown** (default) or **raw text**
- Files are matched to test cases by `testName`

## Implementation Order

1. **`sandbox-run.sh`** — Always create workdir with `mktemp -d`, always init git, always commit. Write workdir to `/tmp/last-workdir`. Scaffold conditional only controls file copy.
2. **`sandbox-extract.sh`** — New script: reads `/tmp/last-workdir`, diffs for changed/new files, emits JSONL to stdout with size limits.
3. **`packages/claude-integration`** — New `extractOutputFiles` function: calls `execInSandbox` with extract script, parses JSONL stdout, returns `{ path, content }[]`.
4. **JSONL persistence** — Add `appendOutputFiles` to `packages/data/src/jsonl-writer.ts` following the existing `appendTestConfig`/`appendTestRun` pattern.
5. **Test runners** — Call `extractOutputFiles` after each `runClaude()`. Pass results to `appendOutputFiles` with `buildTestCaseId` for test name.
6. **Import pipeline** — Add `output-files` entry to `updateAllParquet` tables array in `packages/data/src/analytics.ts`.
7. **Rubric parser** — New `parseRubricSections()` in `rubric-parser.ts` returning `RubricSection[]`. Preserve `parseRubricCriteria()` as a flattening wrapper for backward compatibility.
8. **Judge prompt builder** — Update `buildJudgePrompt` to accept `RubricSection[]` + `outputFiles` map. Inject file content scoped to file-reference sections. Return auto-fail criteria for missing files.
9. **Eval pipeline** — Update `evaluateLlmJudge` to read `output-files.jsonl`, call new parser, pass output files to judge prompt builder, merge auto-fail results.
10. **Web API** — Extend test run detail endpoint with `outputFiles` query from `output-files.parquet`.
11. **Web UI** — Collapsible file containers with markdown/raw toggle.

## Iteration Summary

- **Iterations completed:** 3
- **Assumptions challenged:** 9 (8 primary, 1 secondary)
  - 8 verified against codebase evidence
  - 1 uncertain (single judge call for mixed criteria — reasonable design decision, untested)
- **Consolidations made:** 1 — JSONL writing function consolidated into existing `jsonl-writer.ts` pattern alongside `appendTestConfig`/`appendTestRun`/`appendTestResults`
- **Issues resolved:**
  - Fixed size limit contradiction (50KB vs 5MB) in extraction section — removed conflicting 50KB reference, authoritative limit is 5MB per file / 5MB total
  - Added missing `appendOutputFiles` function specification in `packages/data/src/jsonl-writer.ts`
  - Added testing requirements for new `parseRubricSections` (rubric-parser.test.ts) and mock signature updates in `llm-judge-eval.test.ts`
- **Key codebase verifications:**
  - Docker sandbox persists across `execInSandbox` calls (single named container `claude-skills-harness`)
  - `evaluate.ts:47` already has `runDir` available for passing to `evaluateLlmJudge`
  - `sandbox-run.sh:42` uses `exec claude` — `/tmp/last-workdir` must be written before this line
  - Existing rubric format (`## Rubric:` + `### Category`) doesn't conflict with proposed `## File:` headers
