# Building Skill Eval Scaffolds

> **Tier 3 · Skill/agent authors building evals.** The `/build-skill-eval-scaffold` skill generates a realistic project fixture for evaluating a Claude Code skill — planted signals for rubric (effectiveness) evaluation by default, or repo context cues for trigger accuracy with `--for trigger`; you need a target `plugin:skill` already defined.

Run `/build-skill-eval-scaffold` to generate a realistic project scaffold a skill can be evaluated against. Given a `plugin:skill` identifier and an optional project description, it analyzes the target skill to understand what inputs it expects and what signals it looks for, then interviews you in structured phases before writing a scaffold at `tests/test-suites/{skill}/scaffolds/{name}/`. Run it before writing rubric criteria with `/write-skill-eval-rubric`.

## When to use this skill

Use this skill when you need to:

- Create a new test scaffold for a skill's rubric evals
- Build a realistic project fixture that contains specific signals for a skill to find
- Set up a scaffold directory before writing rubric criteria with `/write-skill-eval-rubric`
- Build a trigger-context scaffold (`--for trigger`) that a `skill-call` test can run a repo-dependent prompt against

## When NOT to use this skill

- You need `tests.json` entries or rubric criteria — this skill produces **scaffold files only**. Use `/write-skill-eval-rubric` for rubric criteria and llm-judge configuration.
- You're testing trigger accuracy, not effectiveness — use `/write-scil-evals` instead.
- The skill doesn't operate on project files (e.g., it queries GitHub APIs or generates content from conversation) — a file scaffold won't help, and the skill will detect this and stop.
- You're building a scaffold for an agent rather than a skill — use `/build-agent-eval-scaffold` instead.

## Usage

Invoke the skill with a `plugin:skill` argument and an optional project description:

```
/build-skill-eval-scaffold r-and-d:code-review
/build-skill-eval-scaffold r-and-d:code-review for a rails 7 project with postgres
/build-skill-eval-scaffold r-and-d:code-review --for trigger for a rails 7 project with postgres
```

If no argument is provided, the skill will ask which `plugin:skill` to build a scaffold for.

## What It Produces

The skill creates a scaffold directory containing realistic project files:

```
tests/test-suites/{skill-name}/
  scaffolds/
    {scaffold-name}/
      src/
        app.js
        db.js
        ...
      package.json
      ...
```

Scaffold files are designed to look like a real project written by a real developer. Signals (bugs, security flaws, architectural issues) are planted naturally — no `BUG HERE` comments or test-fixture markers.

The following are excluded from scaffolds:
- `.git` directory — the test harness auto-initializes a git repo with `git init` and commits all files
- Lock files (`package-lock.json`, `Gemfile.lock`, `go.sum`) — unless they serve as a specific signal
- Dependency directories (`node_modules`, `vendor`, `__pycache__`)

After writing the files, the skill runs `scripts/validate-scaffold.sh` against the scaffold directory. The script checks these exclusions, greps for marker comments, syntax-checks source files with whatever parsers are installed (`node`, `python3`, `ruby`, `gofmt`, `php`, `bash`, plus JSON), and warns about application source files outside the 50–150 line range. Errors are fixed before the skill reports; warnings are reviewed and either fixed or explained.

## Workflow

The skill walks through a 6-step process with three interview pauses:

1. **Parse arguments** — extract the `plugin:skill` identifier, the optional `--for trigger` flag, and the optional project description
2. **Analyze target skill** — run `scripts/collect-target-inputs.sh` to resolve the skill's SKILL.md, reference files, and dispatched agent definitions, then read them to understand what inputs, signals, and environment the skill expects
3. **Interview: Analysis and project shape** — present the skill's purpose, expected inputs, signal categories, environment requirements, and any existing scaffolds alongside the proposed tech stack and a kebab-case scaffold name with `-project` suffix; the user confirms or corrects all of it in one reply
4. **Interview: Signals or cues to plant** — in quality mode, suggest specific signals based on the skill analysis; in trigger mode, suggest context cues with the direction each should push the trigger decision; the user approves, removes, modifies, or adds entries
5. **Interview: File plan** — present a complete file plan with paths, descriptions, and signal assignments for each file
6. **Generate scaffold** — create directories, write all files with realistic content, then run `scripts/validate-scaffold.sh` and fix every error it reports before reporting the result

## Skill Analysis

In Step 2, the skill runs `scripts/collect-target-inputs.sh {plugin} {skill}` from the repository root. The script resolves the three categories of material below and reports each as a path, so the model reads exactly what exists rather than guessing at locations:

### SKILL.md

The skill's body is analyzed to identify:
- What inputs and environment the skill expects (source code, config files, project structure)
- What outputs the skill produces (reviews, standards, documentation)
- What signals the skill looks for (bugs, security flaws, architectural patterns)
- What tools the skill uses (Read, Glob, Grep — these reveal what file types and patterns it inspects)

### Reference files

Files under `{plugin}/skills/{skill}/references/` contain templates, checklists, and domain knowledge that reveal what the skill checks for in detail.

### Agent definitions

Agent definitions referenced by the skill (via `subagent_type` in `Agent` tool calls) describe specific analysis focuses — structural coupling, security vulnerabilities, concurrency patterns — that inform what signals should be planted. `subagent_type` values are namespaced `plugin:agent`, and the agent's plugin is often not the skill's own, so the script resolves each one to `{agent-plugin}/agents/{agent}.md` at the repository root and reports it as `found` or `missing`.

### Graceful skip

If the analysis reveals the skill does not operate on project files (e.g., it queries GitHub APIs or generates content from conversation context), the skill informs the user that a file scaffold would not be useful and stops.

## Trigger Mode

`--for trigger` builds a scaffold for `skill-call` tests instead of `skill-prompt` tests. The difference is what gets planted and where.

In a `skill-call` test the harness replaces the skill's body with a no-op, so nothing inside the scaffold is ever analyzed. The only thing the scaffold can change is the decision to call the skill, and that decision is made from the prompt plus what Claude can see before the call: the auto-loaded `CLAUDE.md`, `README.md`, top-level file and directory names, and any file the prompt names explicitly. Trigger cues live in those places.

The skill derives cues from the skill description's "use when" clauses and "does not … use X" boundaries, plus the sibling descriptions in the same plugin, and asks for each cue's **direction**: does its presence mean the skill should fire, or that a sibling should handle it instead? One scaffold carries one context; the counterpart (cues absent, or pointing at a sibling) is a second run. Scaffold names take a `-context-project` suffix, and the short-file warnings from the validator are expected in this mode.

After building a trigger scaffold, run `/write-scil-evals r-and-d:code-review` and name the scaffold for the prompts that depend on it.

## Signal Planning

Signals are the specific issues, patterns, or findings that the scaffold is designed to contain for the skill to discover. Each signal includes:

- **What** — the signal itself (e.g., "SQL injection via string interpolation in a database query")
- **Where** — where it would live in the scaffold (e.g., "in a database access layer module")
- **Why** — why this matters for the target skill (e.g., "the security analysis agent specifically checks for parameterized queries")

Signals are drawn from all three analysis sources (SKILL.md, references, agent definitions) and distributed across multiple files. Some files carry no intentional signals — realistic projects have clean code alongside problematic code.

## File Plan Guidelines

- Include standard project config files appropriate to the tech stack
- Include multiple source files across a realistic directory structure
- Distribute signals across multiple files — don't cram all signals into one file
- Include some files with no intentional signals
- Keep files focused: enough structure to feel like a real project, but only files the skill would actually inspect
- Source files are 50-150 lines each

## What to Do Next

After generating the scaffold, you can:

1. **Write rubric criteria** for the scaffold using `/write-skill-eval-rubric`:
   ```
   /write-skill-eval-rubric r-and-d:code-review
   ```

2. **Run the tests** to produce output for the judge to evaluate:
   ```bash
   ./harness test-run --suite {skill-name}
   ```

3. **Evaluate results**:
   ```bash
   ./harness test-eval
   ```

## References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from scaffolds to rubric evaluation
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Test Sandbox
- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the `/write-skill-eval-rubric` skill: workflow, criteria categories, output format
- [Writing Skill-Call Evals](write-scil-evals.md) — the `/write-scil-evals` skill: workflow, prompt categories, output format
- [Script Extraction](script-extraction.md) — the `/script-extraction` skill: hardening skills by extracting mechanical steps into scripts
- [Test Harness README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — define the rubric criteria the judge scores your skill's output against.
**Related:** [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Test Sandbox.
