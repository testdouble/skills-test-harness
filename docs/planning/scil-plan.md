# SCIL: Skill Call Improvement Loop

## Context

Skill descriptions determine whether Claude routes user prompts to the correct skill. Getting these descriptions right is iterative — you test trigger accuracy, identify failures, improve the description, and repeat. The `run_loop.py` from [anthropics/skills](https://github.com/anthropics/skills) automates this cycle. We're building a native version of this loop into the test harness CLI as a new `scil` command, using the existing Docker-based test infrastructure.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Scope | Trigger accuracy only (not output quality) |
| Eval runtime | Docker containers (consistent with test-run) |
| Improvement runtime | Docker containers |
| Eval set format | Reuse existing tests.json (skill-call tests) |
| Improvement prompt | Mirror run_loop.py: description + skill body + failures + history |
| Output | Console progress + JSONL to output/ dir |
| SKILL.md update | Report best description, offer to apply |
| Holdout | --holdout flag, default 0 (disabled) |
| Parallelism | --concurrency flag for parallel Docker containers |
| Runs per query | --runs-per-query flag, default 1 |
| Target skill | --suite (required) + --skill (optional, inferred) |
| Early exit | On 100% train accuracy; track best iteration (highest test score if holdout, else highest train score, tie-break: earlier iteration) |
| Model | Eval uses test case model; improvement uses --model flag |
| Scaffolds | Respected — eval runs pass scaffold flags to Docker |
| Temp plugin | One shared temp dir per iteration, built before parallel evals |
| Improvement Docker args | Minimal — env-file only, no repo/test-suite/plugin mounts |

## Files to Create

### 1. Command: `tests/packages/cli/src/commands/scil.ts`

Yargs command module following the pattern in `test-run.ts`.

- `command: 'scil'`
- `describe: 'Skill Call Improvement Loop — iteratively improve a skill description for trigger accuracy'`
- Builder options:
  - `--suite` (string, required) — test suite name
  - `--skill` (string, optional) — `plugin:skill` format; inferred from tests if omitted
  - `--max-iterations` (number, default 5)
  - `--max-budget` (number, default 5.00) — per-container budget
  - `--holdout` (number, default 0) — fraction held out for validation
  - `--concurrency` (number, default 1) — parallel Docker containers
  - `--runs-per-query` (number, default 1)
  - `--model` (string, default 'opus') — model for improvement prompt
  - `--image` (string, default 'claude-code-test-harness')
  - `--debug` (boolean, default false)
  - `--claude-code-version` (string, default 'latest')
  - `--apply` (boolean, default false) — auto-apply without prompting
- Handler calls `runScilLoop()` from `src/scil/loop.ts`

### 2. Loop orchestrator: `tests/packages/cli/src/scil/loop.ts`

Main function `runScilLoop(config: ScilConfig)`:

1. Resolve skill + load tests (step-1) — read tests.json, filter to skill-call tests, infer or validate target skill, return both skill identity and filtered test cases
2. Split train/test (step-2) — based on holdout
3. Read full SKILL.md (step-3) — frontmatter + body
4. Docker build — reuse `dockerBuild()` from `src/test-runners/steps/step-5-docker-build.ts`
5. Generate run ID — reuse `generateRunId()` from `src/test-runners/steps/step-4-generate-run-id.ts`
6. **Loop** (iteration 1..maxIterations):
   a. Build shared temp plugin with current description (one dir per iteration)
   b. Run eval on all queries in parallel (train + test combined), respecting scaffolds
   c. Split results back into train/test by set assignment
   d. Score train accuracy, test accuracy
   e. Record iteration in history; update best if improved
   f. Print iteration results
   g. Write iteration JSONL
   h. If train accuracy == 1.0 → early exit
   i. If not last iteration → run improvement prompt → get new description
7. Print final summary
8. If `--apply`: write best description to SKILL.md. Otherwise: prompt user with readline.

### 3. Step modules in `tests/packages/cli/src/scil/`

**`types.ts`** — SCIL-specific types:
- `ScilConfig` — all CLI flags
- `ScilTestCase` — wraps `TestCase` with `set: 'train' | 'test'`
- `QueryResult` — per-query eval result (test name, expected, actual, passed, run index, events)
- `IterationResult` — per-iteration aggregate (description, train/test results, accuracies, metrics)

**`step-1-resolve-and-load.ts`** — Resolve target skill and load tests:
- Read tests.json via `readTestSuiteConfig()` from `@testdouble/harness-data`
- Filter to `type: 'skill-call'` tests
- If `--skill` provided, validate SKILL.md exists at `{repoRoot}/{plugin}/skills/{skill}/SKILL.md`, filter tests to those targeting that skill
- If `--skill` omitted, extract unique `skillFile` values from filtered tests. If exactly one → use it. If multiple → error listing options
- Error if zero matching tests
- Return: `{ skillFile, skillMdPath, tests: TestCase[] }`
- Reuses: `readTestSuiteConfig()` from `@testdouble/harness-data`, `getTestSuiteDir()` from `src/paths.ts`

**`step-2-split-sets.ts`** — Train/test holdout split:
- If holdout == 0: all train, empty test
- Otherwise: deterministic seeded shuffle (seed from suite+skill string), split by holdout fraction
- Stratify by expected trigger value (true/false) — at least 1 positive and 1 negative in each set when possible
- Return: `ScilTestCase[]` with set assignments

**`step-3-read-skill.ts`** — Read and parse SKILL.md:
- Read file at skill path
- Parse frontmatter (regex: `/^---\n([\s\S]*?)\n---/`) and body separately
- Return: `{ name, description, frontmatterRaw, body, fullContent }`

**`step-4-build-temp-plugin.ts`** — Build shared temp plugin for an iteration:
- Calls `buildTempPluginWithDescription()` once per iteration with the current description
- All parallel Docker containers in this iteration mount this same read-only directory
- Return: `{ tempDir, containerPath }`

**`step-5-run-eval.ts`** — Run evaluation pass:
- Takes: tempDir/containerPath (pre-built), test cases, concurrency, runsPerQuery, Docker config
- For each test case × each run, construct Docker args:
  - Same pattern as `runSkillCallTests()` in `src/test-runners/skill-call/index.ts`
  - Includes scaffold flags: `-e SCAFFOLD_NAME={scaffold}` when test has a scaffold field
  - Volume mounts: repo (ro), test-suite (ro), structured-output (ro), temp-plugin (ro)
  - Env file for API key: `--env-file tests/.env` via `buildDockerEnvFlags()`
- Run via `runDockerContainer()` from `src/lib/docker.ts`
- Parse events via `parseEvents()` from `src/lib/metrics.ts`
- Evaluate skill-call expectation via `evaluateSkillCall()` from `@testdouble/harness-data`
- Concurrency: promise pool pattern — maintain up to N concurrent Docker containers
- For runsPerQuery > 1: aggregate by majority vote (pass if > 50% of runs pass)
- Return: `QueryResult[]`

**`step-6-score.ts`** — Score results:
- trainAccuracy = passing train queries / total train queries
- testAccuracy = passing test queries / total test queries (NaN if empty)
- Best iteration selection: highest test score if holdout > 0, else highest train score. Tie-break: earlier iteration wins (simpler description)
- Pure arithmetic, no I/O

**`step-7-improve-description.ts`** — Generate improved description:
- Build improvement prompt (see Improvement Prompt section below)
- Run in Docker with minimal args: `--env-file tests/.env` (for API key), `--dangerously-skip-permissions`, `--no-session-persistence`, `--output-format stream-json`, `--verbose`, `--model {model}`, `--print {prompt}`
- No volume mounts (no repo, test-suite, or plugin dirs) — this is a pure text-generation task
- Parse result text from stream-json events as the new description
- Trim whitespace, enforce 1024-char limit
- Return: new description string

**`step-8-apply-description.ts`** — Write description to SKILL.md:
- Read SKILL.md
- Replace the `description:` line in frontmatter using regex
- Handle both single-line (`description: "..."`) and quoted formats
- Write file back

**`step-9-write-output.ts`** — Write JSONL output:
- Write to `output/{runId}/scil-iteration.jsonl` — one line per iteration with description, accuracy, per-query results
- Write `output/{runId}/scil-summary.json` — final summary with best iteration, original/best descriptions
- Reuse JSONL patterns from `@testdouble/harness-data`

**`step-10-print-report.ts`** — Console output:
- Per iteration: iteration number, train accuracy (and test if holdout), failing query names, new description preview
- Final: summary table of all iterations, best iteration highlighted, full best description

### 4. Modification: `tests/packages/cli/src/test-runners/skill-call/build-temp-plugin.ts`

Add new exported function:

```typescript
export async function buildTempPluginWithDescription(
  skillFile: string,
  runDir: string,
  overrideDescription: string
): Promise<{ tempDir: string, containerPath: string }>
```

- Reads the real SKILL.md (same as `buildTempPlugin()`)
- Extracts frontmatter, replaces the `description:` field with `overrideDescription`
- Writes temp plugin with modified frontmatter (still frontmatter-only, no body)
- Existing `buildTempPlugin()` stays unchanged

### 5. Modification: `tests/packages/cli/index.ts`

Add one line:
```typescript
.command(await import('./src/commands/scil.js'))
```

## Improvement Prompt

The prompt sent to Claude in step-7:

```
You are an expert at writing skill descriptions for Claude Code plugins.
A skill description determines when Claude invokes the skill. Your job is
to improve the description so Claude correctly triggers the skill for
intended use cases and does NOT trigger it for unintended ones.

## Skill Name
{name}

## Current Description
{currentDescription}

## Skill Body (what the skill does)
{body}

## Evaluation Results

### Should trigger (expected=true):
- "{full prompt text from file}" → {PASS|FAIL: skill was NOT invoked}
...

### Should NOT trigger (expected=false):
- "{full prompt text from file}" → {PASS|FAIL: skill WAS invoked}
...

## Previous Iterations
Iteration 1: train accuracy 69% — "{description}"
Iteration 2: train accuracy 85% — "{description}"
...

## Instructions
Write an improved description. Rules:
1. Clearly state WHAT the skill does and WHEN to use it
2. Include boundary statements (when NOT to use it)
3. Generalize from failure patterns — do NOT reference specific test queries
4. Keep to 3-5 sentences, under 1024 characters
5. Do not list specific cases — generalize to broader categories of user intent

Output ONLY the new description text. No quotes, no explanation, no markdown.
```

When holdout is active, only train results and blinded history (no test scores) are included in the prompt to prevent data leakage.

## Reusable Existing Code

| What | Where |
|------|-------|
| `readTestSuiteConfig()` | `tests/packages/data/src/config.ts` |
| `resolvePromptPath()`, `readPromptFile()` | `tests/packages/data/src/config.ts` |
| `evaluateSkillCall()` | `tests/packages/data/src/expectations.ts` |
| `parseStreamJsonLines()`, `getSkillInvocations()` | `tests/packages/data/src/stream-parser.ts` |
| `buildTempPlugin()` | `tests/packages/cli/src/test-runners/skill-call/build-temp-plugin.ts` |
| `runDockerContainer()` | `tests/packages/cli/src/lib/docker.ts` |
| `parseEvents()`, `extractTestMetrics()`, `accumulateTotals()` | `tests/packages/cli/src/lib/metrics.ts` |
| `dockerBuild()` | `tests/packages/cli/src/test-runners/steps/step-5-docker-build.ts` |
| `generateRunId()` | `tests/packages/cli/src/test-runners/steps/step-4-generate-run-id.ts` |
| `repoRoot`, `outputDir`, `getTestSuiteDir()` | `tests/packages/cli/src/paths.ts` |
| Types: `TestCase`, `TestExpectation`, `StreamJsonEvent`, etc. | `tests/packages/data/src/types.ts` |

## Implementation Order

1. `src/scil/types.ts` — no dependencies
2. `src/scil/step-1-resolve-and-load.ts` — uses harness-data + paths (combined resolve + filter)
3. `src/scil/step-2-split-sets.ts` — pure function
4. `src/scil/step-3-read-skill.ts` — file I/O only
5. Modify `build-temp-plugin.ts` — add `buildTempPluginWithDescription()`
6. `src/scil/step-4-build-temp-plugin.ts` — wraps `buildTempPluginWithDescription()` for iteration use
7. `src/scil/step-5-run-eval.ts` — uses Docker, temp plugin, expectations (most complex)
8. `src/scil/step-6-score.ts` — pure arithmetic
9. `src/scil/step-7-improve-description.ts` — uses Docker (minimal args)
10. `src/scil/step-8-apply-description.ts` — file I/O
11. `src/scil/step-9-write-output.ts` — JSONL writing
12. `src/scil/step-10-print-report.ts` — console output
13. `src/scil/loop.ts` — orchestrates all steps
14. `src/commands/scil.ts` — yargs command wrapper
15. Modify `index.ts` — register command

## Verification

1. **Unit test each step module** — particularly step-2 (deterministic split), step-6 (scoring), step-8 (frontmatter replacement)
2. **Integration test** — run `./harness scil --suite iterative-plan-review --max-iterations 1` to verify end-to-end with a single iteration
3. **Multi-iteration test** — run with `--max-iterations 3` to verify the loop improves descriptions and early exit works
4. **Holdout test** — run with `--holdout 0.4` to verify train/test split and blinded history
5. **Concurrency test** — run with `--concurrency 3` to verify parallel Docker containers work
6. **Apply test** — run with `--apply` to verify SKILL.md gets updated correctly
7. **Check output files** — verify `scil-iteration.jsonl` and `scil-summary.json` are written to `output/{runId}/`
