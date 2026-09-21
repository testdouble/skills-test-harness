---
name: audit-eval-suite
description: "Audits an existing eval suite against the current state of the skill or agent it tests and reports drift. Given a plugin:skill or plugin:agent identifier, validates tests/test-suites/{name}/ structurally, then compares the target's current description, checks, references, and dispatched agents against the suite's prompts, rubric criteria, scaffold signals, and expectations to find criteria the target no longer checks for, checks the scaffold never exercises, prompts that contradict the description's current boundaries, and siblings added since the suite was written. Use when a skill or agent changed and its evals may be stale, when a suite fails or passes unexpectedly, or before trusting SCIL, ACIL, or judge scores. Reports only and names the write-* or build-* skill that fixes each finding; does not edit the suite."
argument-hint: "[plugin:skill or plugin:agent] e.g. example-plugin:code-review"
allowed-tools: Read, Glob, Grep
---

Find the places where an eval suite and the skill or agent it tests have drifted apart. A run follows stale evals faithfully: a rubric criterion for a check the skill dropped fails every run, a scaffold signal the skill no longer looks for inflates nothing, and a positive prompt that a new boundary clause now excludes is scored as a miss. Each looks like a target regression when it is a suite regression. This skill compares both sides and says which is which, so the suite can be repaired with the skill that owns each artifact.

## Constraints

- Report only; never edit the suite or the target BECAUSE each artifact has an owning skill (write-scil-evals, write-acil-evals, write-skill-eval-rubric, write-agent-eval-rubric, build-skill-eval-scaffold, build-agent-eval-scaffold), and an audit that also edits leaves no clean record of what drifted.
- Every drift finding cites both sides — the target file and line or clause, and the suite file and criterion, prompt, or scaffold path — BECAUSE a drift claim with one side cannot be verified.
- Report only drift that changes what a run would score; leave wording differences alone BECAUSE a long list of cosmetic notes hides the findings that matter.
- Keep the report proportional: one line per finding, evidence in the line, no restating the suite back to the user.

## Step 1: Identify the target

If the user provided a `plugin:name` argument, use it. If no argument was provided, ask which plugin:skill or plugin:agent to audit and stop until they answer.

Validate the argument format: exactly one colon, both parts non-empty and matching `^[a-z0-9-]+$`. Then run `${CLAUDE_SKILL_DIR}/scripts/collect-target-inputs.sh {plugin} {name}` from the repository root. It resolves the name as a skill first, then as an agent, and prints `target-type`, `target-file`, `suite-dir`, `suite-exists`, the reference files between `reference-files-start` and `reference-files-end`, dispatched agents between `agents-start` and `agents-end` as `{agent-plugin}:{agent} {path} {found|missing}`, and every other skill and agent in the plugin between `siblings-start` and `siblings-end`. If it reports `status: error`, show the `reason` and ask the user to correct the input.

If `suite-exists: false`, tell the user there is nothing to audit and name the skill that creates the suite — `write-scil-evals` or `write-skill-eval-rubric` for a skill, `write-acil-evals` or `write-agent-eval-rubric` for an agent — then stop.

Read the `target-file`, every reference file, and every agent marked `found`. Build the target's current profile:

- **Description clauses** — each "use when" trigger and each "does not … use X" boundary, quoted
- **Checks** — every signal the body, references, and agents look for, each tied to the file that defines it
- **Output shape** — headings and sections the template or instructions guarantee, and any output file paths
- **Missing agents** — any line marked `missing`; that is drift inside the target itself

## Step 2: Validate the suite structurally

Run `${CLAUDE_SKILL_DIR}/scripts/validate-suite.sh {suite-dir}`. It re-checks what the harness checks at load time and prints one finding per line between `findings-start` and `findings-end`. Every finding goes into the report's first section as-is; a structural error stops the harness before any drift matters.

## Step 3: Read the suite

Read `tests.json` and group the entries by type. Then read every prompt file, every rubric under `rubrics/`, and every file of every scaffold under `scaffolds/` that a test references. For each scaffold, list the signals or cues it plants — the concrete problems in its files, or the context cues in `CLAUDE.md`, README, and top-level names — with the file that carries each.

## Step 4: Compare

Run four comparisons. For each finding record the severity, both sides of the evidence, and the fix.

**4a. Rubric against target.** For each rubric criterion, find the check in the target profile it corresponds to. A criterion with no current check is **breaks-scoring** (it fails every run). A current check in the target with no criterion is **coverage-gap**. A criterion whose category or wording no longer matches how the target reports the finding is **weakens-scoring**.

**4b. Scaffold against target and rubric.** A planted signal the target no longer checks for is **coverage-gap** (it costs tokens and proves nothing). A target check that no scaffold file exercises is **coverage-gap**. A Presence criterion naming a file, function, or line that does not exist in the scaffold is **breaks-scoring**.

**4c. Prompts against the description.** For each `skill-call` or `agent-call` test: a positive prompt that a current boundary clause excludes is **breaks-scoring**; a negative or sibling prompt that a current "use when" clause now covers is **breaks-scoring**. A sibling listed by the script that no sibling prompt exercises is **coverage-gap**. A test whose prompt depends on repo state but carries no `scaffold` is **weakens-scoring**.

**4d. Expectations against output shape.** A `result-contains` string the current output shape no longer guarantees is **breaks-scoring**. A `result-does-not-contain` string that the target now legitimately emits is **breaks-scoring**. An `llm-judge` threshold above the share of criteria that can still pass, given the 4a findings, is **weakens-scoring**.

Fixes, by artifact:

- Rubric criteria → `/write-skill-eval-rubric {plugin}:{name}` or `/write-agent-eval-rubric {plugin}:{name}` (update flow)
- Scaffold signals or cues → `/build-skill-eval-scaffold {plugin}:{name}` or `/build-agent-eval-scaffold {plugin}:{name}`, with `--for trigger` for a trigger-context scaffold
- Prompts and `scaffold` fields → `/write-scil-evals {plugin}:{name}` or `/write-acil-evals {plugin}:{name}`
- Deterministic expectations → the rubric skill's update flow
- A missing agent inside the target → the target's own author; note it and move on

## Step 5: Report

Present the report in the conversation, in this order:

1. **Verdict** — one sentence: whether the suite's scores can be trusted as they stand, and how many findings at each severity
2. **Structural** — the validator's findings, verbatim, or "none"
3. **Breaks scoring** — one line each: `{artifact}: {suite-side evidence} — target now {target-side evidence} → {fix command}`
4. **Weakens scoring** — same form
5. **Coverage gaps** — same form
6. **Repair order** — the fix commands to run, in dependency order: scaffold first (criteria and prompts reference it), then rubric, then prompts

Lead with the verdict. If there are no findings, say so in one line and stop.
