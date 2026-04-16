# Building Skill Eval Scaffolds

The `build-skill-eval-scaffold` skill generates realistic project scaffolds for rubric evaluation of Claude Code skills. Given a `plugin:skill` identifier and an optional project description, it analyzes the target skill to understand what inputs it expects and what signals it looks for, then interviews the user in structured phases before generating a scaffold at `tests/test-suites/{skill}/scaffolds/{name}/`.

## When to Use

Use this skill when you need to:

- Create a new test scaffold for a skill's rubric evals
- Build a realistic project fixture that contains specific signals for a skill to find
- Set up a scaffold directory before writing rubric criteria with `/write-skill-eval-rubric`

This skill produces **scaffold files only** — it does not create `tests.json` entries or rubric files. Use `/write-scil-evals` for trigger accuracy testing and `/write-skill-eval-rubric` for rubric criteria and llm-judge configuration.

## Usage

Invoke the skill with a `plugin:skill` argument and an optional project description:

```
/build-skill-eval-scaffold r-and-d:code-review
/build-skill-eval-scaffold r-and-d:code-review for a rails 7 project with postgres
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

## Workflow

The skill walks through a 7-step process:

1. **Parse arguments** — extract the `plugin:skill` identifier and optional project description
2. **Analyze target skill** — read the skill's SKILL.md, reference files, and agent definitions to understand what inputs, signals, and environment the skill expects
3. **Present analysis summary** — show skill purpose, expected inputs, signal categories, environment requirements, and any existing scaffolds
4. **Interview: Technology and shape** — confirm the tech stack and derive a kebab-case scaffold name with `-project` suffix
5. **Interview: Signals to plant** — suggest specific signals based on the skill analysis; the user approves, removes, modifies, or adds signals
6. **Interview: File plan** — present a complete file plan with paths, descriptions, and signal assignments for each file
7. **Generate scaffold** — create directories and write all files with realistic content

## Skill Analysis

In Step 2, the skill reads three categories of material from the target skill:

### SKILL.md

The skill's body is analyzed to identify:
- What inputs and environment the skill expects (source code, config files, project structure)
- What outputs the skill produces (reviews, standards, documentation)
- What signals the skill looks for (bugs, security flaws, architectural patterns)
- What tools the skill uses (Read, Glob, Grep — these reveal what file types and patterns it inspects)

### Reference files

Files under `{plugin}/skills/{skill}/references/` contain templates, checklists, and domain knowledge that reveal what the skill checks for in detail.

### Agent definitions

Agent definitions referenced by the skill (via `subagent_type` in `Agent` tool calls) describe specific analysis focuses — structural coupling, security vulnerabilities, concurrency patterns — that inform what signals should be planted.

### Graceful skip

If the analysis reveals the skill does not operate on project files (e.g., it queries GitHub APIs or generates content from conversation context), the skill informs the user that a file scaffold would not be useful and stops.

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
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Docker sandbox
- [Test Suite Configuration](test-suite-configuration.md) — full tests.json field reference
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the `/write-skill-eval-rubric` skill: workflow, criteria categories, output format
- [Writing Skill-Call Evals](write-scil-evals.md) — the `/write-scil-evals` skill: workflow, prompt categories, output format
- [Script Extraction](script-extraction.md) — the `/script-extraction` skill: hardening skills by extracting mechanical steps into scripts
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
