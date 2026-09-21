# Auditing Eval Suites

> **Tier 3 · Skill/agent authors building evals.** The `/audit-eval-suite` skill compares an existing test suite against the current state of the skill or agent it tests and reports drift; you need a target `plugin:skill` or `plugin:agent` with a suite under `tests/test-suites/`.

Run `/audit-eval-suite` when a skill or agent has changed and its evals may no longer describe it. A run follows stale evals faithfully: a rubric criterion for a check the skill dropped fails every run, a scaffold signal the skill no longer looks for proves nothing, and a positive prompt that a new boundary clause excludes is scored as a miss. Each looks like a target regression when it is a suite regression. The audit says which is which and names the skill that repairs each artifact. It edits nothing.

## When to use this skill

Use this skill when you need to:

- Check a suite after editing a skill's `SKILL.md`, references, or dispatched agents, or an agent's definition
- Explain a suite that started failing — or passing — unexpectedly
- Confirm SCIL, ACIL, or judge scores are measuring the current target before acting on them

## When NOT to use this skill

- The suite does not exist yet — use `/write-scil-evals`, `/write-acil-evals`, `/write-skill-eval-rubric`, or `/write-agent-eval-rubric` to create it.
- You want the findings fixed — the audit reports only; it names the owning skill for each fix.
- You want to review the skill itself rather than its evals — use the plugin-building guidance for that.

## Usage

Invoke the skill with a `plugin:skill` or `plugin:agent` argument:

```
/audit-eval-suite r-and-d:code-review
/audit-eval-suite r-and-d:gap-analyzer
```

The name is resolved as a skill first, then as an agent. If no argument is provided, the skill asks which target to audit.

## What It Produces

A report in the conversation, led by a one-sentence verdict, with findings in three severities:

| Severity | Meaning | Example |
|---|---|---|
| **Breaks scoring** | A run cannot pass or fails for the wrong reason | A Presence criterion names `src/db.js:42`, which the scaffold no longer contains |
| **Weakens scoring** | The score is real but measures less than it claims | A trigger test whose prompt says "this branch" carries no `scaffold` |
| **Coverage gap** | Something the target does is never exercised | The skill now dispatches a concurrency analyst; no scaffold plants a race |

Every finding cites both sides — the target file and clause, and the suite file, criterion, prompt, or scaffold path — and ends with the fix command. The report closes with a repair order: scaffold first (criteria and prompts reference it), then rubric, then prompts.

## Workflow

The skill walks through a 5-step process with no interview pauses:

1. **Identify the target** — run `scripts/collect-target-inputs.sh`, which resolves the name as a skill or agent and lists its references, dispatched agents, siblings, and whether a suite exists; read all of it and build the target's current profile (description clauses, checks, output shape)
2. **Validate the suite structurally** — run `scripts/validate-suite.sh`, the same load-time checks the harness applies (prompt files, scaffolds, rubrics, `expect` arrays, identifiers)
3. **Read the suite** — every test entry, prompt file, rubric, and scaffold file, listing what each scaffold plants
4. **Compare** — rubric against target, scaffold against target and rubric, prompts against the description's current clauses and siblings, deterministic expectations against the current output shape
5. **Report** — verdict, structural findings, then findings by severity, then the repair order

## The four comparisons

- **Rubric ↔ target** — a criterion with no matching check in the current target fails every run; a current check with no criterion is a gap
- **Scaffold ↔ target and rubric** — a planted signal the target no longer checks for costs tokens and proves nothing; a criterion naming a file or line the scaffold lacks can never pass
- **Prompts ↔ description** — a positive prompt now excluded by a boundary clause, or a negative prompt now covered by a "use when" clause, is scored backwards; a sibling with no sibling prompt is untested
- **Expectations ↔ output shape** — a `result-contains` string the current template no longer guarantees fails every run; an `llm-judge` threshold above what the surviving criteria can reach never passes

## What to Do Next

Run the fix commands in the report's repair order, then re-run the audit until it reports no findings, then run the suite:

```bash
./harness test-run --suite {name}
./harness test-eval
```

## References

- [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) and [Building Agent Eval Scaffolds](build-agent-eval-scaffold.md) — rebuilding a scaffold the audit found stale
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) and [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the rubric update flow
- [Writing Skill-Call Evals](write-scil-evals.md) and [Writing Agent-Call Evals](write-acil-evals.md) — adding or re-scoping trigger prompts
- [Test Suite Reference](test-suite-reference.md) — what the structural validation checks
- [Test Harness README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Building Rubric Evals](rubric-evals-guide.md) or [Building SCIL Evals](scil-evals-guide.md) — the full workflows the repaired suite feeds into.
**Related:** [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Test Sandbox.
