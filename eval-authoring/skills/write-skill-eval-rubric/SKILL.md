---
name: write-skill-eval-rubric
description: "Writes or updates the LLM-judge rubric that scores a Claude Code skill's output quality, and wires it into skill-prompt tests. Given a plugin:skill identifier, reads the skill and its eval's scaffold, drafts criteria in four categories (Presence, Specificity, Depth, Absence) plus per-file criteria for skills that write files, proposes deterministic result-contains checks, and writes the rubric markdown and llm-judge expectations to tests.json. Use when creating a rubric, adding llm-judge or effectiveness evals for a skill, or revising existing rubric criteria. Does not write skill-call tests — use write-scil-evals. Does not build scaffolds — use build-skill-eval-scaffold. Does not cover agents — use write-agent-eval-rubric."
argument-hint: "[plugin:skill] e.g. example-plugin:code-review"
allowed-tools: Read, Glob, Grep, Write, Edit
---

Produce the rubric an LLM judge scores the target skill's run against, and attach it to the eval's `skill-prompt` tests. A rubric is only as good as what the judge can verify, so the criteria are drafted from what the skill actually checks for and from the concrete files planted in the eval's scaffold, then edited by the user — not invented from the skill's name.

## Constraints

- Every criterion is one bullet stating one checkable claim BECAUSE Skillwalker parses each bullet as a separate criterion and the judge scores them independently; a compound bullet fails on its weakest clause.
- When a scaffold exists, criteria name its concrete files, functions, or lines BECAUSE the judge can only verify what it can point at in the transcript.
- Never remove or reword an existing criterion unless the user asks BECAUSE the threshold was tuned against the existing set, and changing it changes what passes.
- Propose a `result-contains` string only for text the skill's own template or instructions guarantee BECAUSE a deterministic check fails the whole test on any variation, whereas a judge criterion is one of many.
- Reference only rubric files and scaffolds that exist on disk BECAUSE Skillwalker validates both before a run and refuses the eval otherwise.
- Keep interview turns compact: the draft, then the question.

## Step 1: Identify the target skill

If the user provided a `plugin:skill` argument (e.g. `example-plugin:code-review`), use it. If no argument was provided, ask the user which plugin:skill to write a rubric for and stop until they answer.

Validate the argument format: exactly one colon, both parts non-empty and matching `^[a-z0-9-]+$`. Then collect the target's inputs by running `${CLAUDE_SKILL_DIR}/scripts/collect-target-inputs.sh {plugin} {skill}` from the repository root. It prints `status`, the `skill-file`, the reference files between `reference-files-start` and `reference-files-end`, and one line per dispatched agent between `agents-start` and `agents-end` as `{agent-plugin}:{agent} {path} {found|missing}`. If it reports `status: error`, show the `reason` and ask the user to correct the input.

Read the `skill-file`, every reference file, and every agent marked `found`. From them determine:

- **Output type** — what the skill produces (a review, an ADR, a test plan, documentation) and the fixed structure its template or instructions guarantee (headings, sections)
- **What it checks for** — the signals its steps, checklists, and agents look for; these become Presence criteria
- **File output** — whether the skill writes files: `Write` in `allowed-tools`, instructions like "write the analysis to", or named output paths. If clearly yes, note the paths; if clearly no, skip file criteria; if inconclusive, ask in Step 3.

## Step 2: Inspect the eval

The eval directory is `evals/{skill}/`. Read what is there:

- `tests.json`, if present — note every `skill-prompt` test, the scaffold each uses, and any `llm-judge` expectation already attached. If absent, it will be created.
- `rubrics/` — if a rubric file exists, this is an **update**: read it and keep its criteria.
- `scaffolds/` — read the files of every scaffold the `skill-prompt` tests use. The planted signals in those files are what Presence criteria should name.

## Step 3: Interview Phase 1 — Test targets

Present in one message and ask the user to confirm or edit:

1. The existing `skill-prompt` tests, with a proposal for which ones receive this rubric (default: all that lack an `llm-judge` expectation)
2. Whether to add a new `skill-prompt` test, with a proposed name, a prompt defaulting to `/{skill}`, and the scaffold the existing tests use
3. When file output was detected: the output path(s) and a prompt that pins them (e.g. "write the analysis to docs/gap-analysis.md") BECAUSE a rubric can only find a file at a path the prompt fixed
4. When file output was inconclusive: the question of whether the skill writes files

Wait for the answer and carry it into the draft.

## Step 4: Draft the rubric

Draft every part of the rubric from the Step 1 analysis and the Step 2 scaffold contents. Each criterion is a complete sentence starting with "The {output-type} …" (e.g. "The review identifies that …"). Within each category, put the most representative criterion last.

- **Presence** — things the output MUST identify or include; name the scaffold file and the planted issue for each
- **Specificity** — the output must cite concrete file names, line numbers, or method names rather than make vague statements
- **Depth** — the output must be actionable: how to fix, an example, or the reasoning
- **Absence** — things the output must NOT do: report issues that do not exist in the scaffold, suggest non-idiomatic changes, make incorrect claims
- **File sections** — when file output is in scope, a `## File: {path}` section per output path with whichever of the four categories apply; omit empty categories
- **Deterministic checks** — zero to two `result-contains` strings for text the skill guarantees (a fixed report heading like `# Code Review`) and zero to two `result-does-not-contain` strings for text that means the skill did not run (a refusal, a permission-prompt message). Propose none when nothing is guaranteed.
- **Settings** — `model: opus`, `threshold: 0.8`, and the rubric filename: the existing one on an update, otherwise `{skill}-quality.md`

On an update, show the existing criteria unchanged and mark each proposed addition.

## Step 5: Interview Phase 2 — Edit the draft

Present the draft and ask the user to approve it, or to add, remove, or modify criteria, deterministic checks, and settings. Wait for the answer.

## Step 6: Preview and confirm

Show, in one message, exactly what will be written:

1. **Rubric file** at `evals/{skill}/rubrics/{filename}`, as one markdown block in this format:

```
## Rubric: {skill} of {scaffold-name} scaffold

### Presence — things the {output-type} must identify
- criterion

### Specificity — the {output-type} must be concrete
- criterion

### Depth — the {output-type} must be actionable
- criterion

### Absence — the {output-type} must not do these things
- criterion

## File: docs/example-output.md
### Presence
- criterion
```

Title the rubric `## Rubric: {skill} quality` when no scaffold is used. `## File:` sections come after the transcript sections.

2. **tests.json changes** — for each selected test, the expectations being appended: `{ "llm-judge": { "rubricFile": "{filename}", "model": "{model}", "threshold": {threshold} } }` plus any `{ "result-contains": "…" }` or `{ "result-does-not-contain": "…" }` checks; plus any new `skill-prompt` entry in full. Show the whole file when creating it.
3. **New prompt files** with their contents.
4. **Totals** — criteria per category, tests affected.

Wait for the user to confirm.

## Step 7: Write and validate

1. Write the rubric file, create or edit `tests.json` (append to `expect` arrays; append new entries to `tests`; a new file is `{ "plugins": ["{plugin}"], "tests": [ … ] }`), and write any new prompt files.
2. Run `${CLAUDE_SKILL_DIR}/scripts/validate-eval.sh evals/{skill}`. It re-checks what Skillwalker checks at load time (rubric and prompt files exist, rubric has bullet criteria, threshold in range, scaffolds exist) and prints one finding per line between `findings-start` and `findings-end`. Fix every finding and re-run until `errors: 0`.
3. Report: the files created and modified, the criteria counts, and the tests that now carry the rubric.
