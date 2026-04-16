# Plan: skill-call Test Type — New Execution Flow

## Context

Currently, `skill-call` tests run through the same code path as `prompt` tests (`step-8-run-test-cases.ts`). The distinction is semantic only — no execution difference exists.

The new behavior mirrors the blog post's "trigger eval" approach: for a `skill-call` test, create a temporary plugin directory containing only the skill's frontmatter (no body), mount it into Docker, and run Claude with `--plugin-dir` pointing to that temp dir. This isolates the routing signal (the description field) and tests whether Claude picks the skill from that signal alone — not whether the full skill executes correctly.

## Final Structure

```
tests/packages/cli/src/
  commands/
    test-run.ts              (slim: yargs handler, imports from ../test-run-steps/)
    test-eval.ts             (slim: yargs handler, imports from ../test-eval-steps/ and ../test-run-steps/)
  test-run-steps/            (moved out of commands/ — orchestration steps 1-7, 8-dispatch, 9-10)
    fixtures.ts              (moves with directory)
    step-1-resolve-paths.ts
    ...
    step-8-run-test-cases.ts (thin dispatcher: splits tests by type, calls runners)
    ...
  test-eval-steps/           (moved out of commands/)
    ...
  test-runners/
    prompt/
      index.ts               (extracted from old step-8: prompt test execution loop)
    skill-call/
      index.ts               (new: skill-call test execution loop)
      build-temp-plugin.ts   (new: create temp plugin dir with frontmatter-only SKILL.md)
  lib/
    docker.ts                (runDockerContainer — shared Docker/Bun.spawn logic)
    output.ts                (writeTestOutput — shared JSONL writing)
    metrics.ts               (parseEvents, extractTestMetrics, accumulateTotals)
```

## Critical Files to Modify

- `tests/packages/data/src/types.ts` — add `skillFile?: string` to `TestCase`
- `tests/packages/cli/src/commands/test-run-steps/step-8-run-test-cases.ts` — becomes thin dispatcher
- `tests/packages/cli/src/commands/test-run.ts` — update import paths after move (`./test-run-steps/` → `../test-run-steps/`)
- `tests/packages/cli/src/commands/test-eval.ts` — update both `./test-eval-steps/` → `../test-eval-steps/` and `./test-run-steps/` → `../test-run-steps/`
- All `step-N.ts` and `step-N.test.ts` files using `../../paths.js` — change to `../paths.js` after move

## New Files to Create

- `src/lib/docker.ts` — extracted `runDockerContainer()` (lines 29-42 of current step-8)
- `src/lib/output.ts` — extracted `writeTestOutput()` with signature updated to take `plugins: string[]` instead of full `config`
- `src/lib/metrics.ts` — extracted `parseEvents()`, `extractTestMetrics()`, `accumulateTotals()` (lines 48-83 of current step-8)
- `src/test-runners/prompt/index.ts` — extracted test loop (no type filtering; runs what it's given)
- `src/test-runners/skill-call/index.ts` — new skill-call runner loop
- `src/test-runners/skill-call/build-temp-plugin.ts` — builds temp plugin dir

Note: `checkRunFailures()` also exists in step-8 (line 56); it is not extracted to `lib/` — both runners will handle it as needed.

## Implementation Steps

### 1. Add `skillFile` to shared types
In `tests/packages/data/src/types.ts`, add `skillFile?: string` to `TestCase`. `promptFile` remains required — skill-call tests still provide a prompt file containing the trigger phrase.

### 2. Extract shared helpers to src/lib/
Move these functions from `step-8-run-test-cases.ts` into new lib files:
- `lib/docker.ts` → `runDockerContainer(runArgs, debug)`
- `lib/output.ts` → `writeTestOutput(runDir, testRunId, suite, plugins, test, events)` — update signature to take `plugins: string[]` directly rather than full `config`
- `lib/metrics.ts` → `parseEvents()`, `extractTestMetrics()`, `accumulateTotals()`

### 3. Create prompt runner
`src/test-runners/prompt/index.ts` — move the per-test execution loop from current step-8 here. Receives a filtered array of `TestCase` (type = "prompt" or undefined) plus `config` for plugin info. Imports from `lib/` for all shared helpers.

### 4. Create skill-call runner

**`src/test-runners/skill-call/build-temp-plugin.ts`**:
- Signature: `buildTempPlugin(skillFile: string, runDir: string): Promise<{ tempDir: string, containerPath: string }>`
- Parses `pluginName:skillName` format by splitting on `:`
- Reads `{repoRoot}/{pluginName}/skills/{skillName}/SKILL.md`
- Strips the body: keep only the content between the `---` frontmatter delimiters (YAML only, no markdown body)
- Creates temp dir at `{runDir}/temp-skills/{pluginName}-{skillName}/`
- Writes:
  - `.claude-plugin/plugin.json` with `{ name: pluginName, description: "", version: "0.0.0", skills: "./skills" }`
  - `skills/{skillName}/SKILL.md` (frontmatter only)
- Returns `{ tempDir, containerPath: "/temp-skill-{pluginName}-{skillName}" }`
- Temp dirs persist after run (no automatic cleanup)

The `{pluginName}-{skillName}` naming prevents collisions when multiple tests target skills with the same name from different plugins (e.g. `r-and-d:code-review` and `custom:code-review`).

**`src/test-runners/skill-call/index.ts`**:
- Same loop structure as prompt runner
- Differences per test:
  - Call `buildTempPlugin(test.skillFile, runDir)` to create the temp dir
  - Docker run args: replace `...claudeFlags` (which contains `--plugin-dir /repo/{plugins}`) with `--plugin-dir {containerPath}`
  - Add Docker volume mount: `-v {tempDir}:{containerPath}:ro`
- Everything else identical to prompt runner (JSONL output, metrics, totals, failure detection)

The `--plugin-dir` replacement (not addition) provides full routing isolation — only the skill under test is visible to Claude.

### 5. Thin step-8 dispatcher
`step-8-run-test-cases.ts` becomes a dispatcher:
- Splits `config.tests` into `promptTests` (type === "prompt" or undefined) and `skillCallTests` (type === "skill-call")
- Calls `runPromptTests(promptTests, ...)` from `test-runners/prompt/`
- Calls `runSkillCallTests(skillCallTests, ...)` from `test-runners/skill-call/`
- Accumulates totals from both

### 6. Move step files and update imports
- Move `src/commands/test-run-steps/` → `src/test-run-steps/` (includes `fixtures.ts`)
- Move `src/commands/test-eval-steps/` → `src/test-eval-steps/`
- Update `test-run.ts`: `./test-run-steps/` → `../test-run-steps/`
- Update `test-eval.ts`: `./test-eval-steps/` → `../test-eval-steps/`; `./test-run-steps/` → `../test-run-steps/`
- Update step files using `../../paths.js` → `../paths.js` (affects `step-1`, `step-6`, `step-8` in test-run-steps; `step-1` in test-eval-steps)
- Update all `.test.ts` files to match new import paths

## Technical Validation: --plugin-dir (Resolved)

The `--plugin-dir` flag approach has been validated — no pre-implementation testing needed.

**How it works:**
- `--plugin-dir <path>` expects the plugin root — the directory containing `.claude-plugin/plugin.json` directly inside it
- `plugin.json` must include a `"skills": "./skills"` field pointing to the skills subdirectory
- The flag can be passed multiple times (one per plugin)
- This is exactly the same pattern the harness already uses: `--plugin-dir /repo/r-and-d`

**Confirmed temp plugin dir structure:**

```
{runDir}/temp-skills/{pluginName}-{skillName}/
├── .claude-plugin/
│   └── plugin.json    ← { name: pluginName, description: "", version: "0.0.0", skills: "./skills" }
└── skills/
    └── {skillName}/
        └── SKILL.md   ← frontmatter only (no body)
```

Docker invocation:
```
-v {tempDir}:/temp-skill-{pluginName}-{skillName}:ro
--plugin-dir /temp-skill-{pluginName}-{skillName}
```

## Data Flow for skill-call Test

```
tests.json skillFile: "r-and-d:code-review"
  → parse to pluginName="r-and-d", skillName="code-review"
  → read {repoRoot}/r-and-d/skills/code-review/SKILL.md
  → strip body, keep frontmatter only
  → write to {runDir}/temp-skills/r-and-d-code-review/.claude-plugin/plugin.json
             {runDir}/temp-skills/r-and-d-code-review/skills/code-review/SKILL.md
  → docker run ...
      -v {tempDir}:/temp-skill-r-and-d-code-review:ro
      --plugin-dir /temp-skill-r-and-d-code-review
      --print {promptContent from test.promptFile}
  → capture stream-json output
  → parseEvents, extractMetrics, writeTestOutput (same as prompt)
```

## Verification

1. Run existing tests — all steps 1-7, 9-10 pass after path moves
2. Run a prompt-type test suite end-to-end — same behavior as before
3. Write a skill-call test for an existing skill (e.g., `r-and-d:code-review`), run it, verify:
   - Temp plugin dir is created at `{runDir}/temp-skills/r-and-d-code-review/`
   - `plugin.json` contains `"skills": "./skills"` and `name: "r-and-d"`
   - Frontmatter-only SKILL.md is correct (no body)
   - Docker receives correct volume mount and `--plugin-dir` flag
   - `skill-call` expectation passes when skill is triggered
4. Run a multi-skill test suite with both `prompt` and `skill-call` tests — verify dispatcher routes correctly and totals accumulate from both runners
