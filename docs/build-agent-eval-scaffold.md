# Building Agent Eval Scaffolds

> **Tier 3 · Skill/agent authors building evals.** The `/build-agent-eval-scaffold` skill generates a realistic project fixture for rubric (effectiveness) evaluation of a Claude Code agent; you need a target `plugin:agent` already defined.

Run `/build-agent-eval-scaffold` to generate a realistic project scaffold an agent can be evaluated against. Given a `plugin:agent` identifier and an optional project description, it analyzes the target agent's definition file to understand what inputs it expects and what signals it looks for, then interviews you in structured phases before writing a scaffold at `tests/test-suites/{agent}/scaffolds/{name}/`. Run it before writing rubric criteria with `/write-agent-eval-rubric`.

## When to use this skill

Use this skill when you need to:

- Create a new test scaffold for an agent's rubric evals
- Build a realistic project fixture that contains specific signals for an agent to find
- Set up a scaffold directory before writing rubric criteria with `/write-agent-eval-rubric`

## When NOT to use this skill

- You need `tests.json` entries or rubric criteria — this skill produces **scaffold files only**. Use `/write-agent-eval-rubric` for rubric criteria and llm-judge configuration.
- You're testing trigger accuracy, not effectiveness — use `/write-acil-evals` instead.
- The agent doesn't operate on project files (e.g., it queries GitHub APIs or generates content from conversation) — a file scaffold won't help, and the skill will detect this and stop.
- You're building a scaffold for a skill rather than an agent — use `/build-skill-eval-scaffold` instead.

## Usage

Invoke the skill with a `plugin:agent` argument and an optional project description:

```
/build-agent-eval-scaffold r-and-d:gap-analyzer
/build-agent-eval-scaffold r-and-d:gap-analyzer for a rails 7 project with postgres
```

If no argument is provided, the skill will ask which `plugin:agent` to build a scaffold for.

## What It Produces

The skill creates a scaffold directory containing realistic project files:

```
tests/test-suites/{agent-name}/
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

1. **Parse arguments** — extract the `plugin:agent` identifier and optional project description
2. **Analyze target agent** — read the agent's definition file to understand what inputs, signals, and environment the agent expects
3. **Present analysis summary** — show agent purpose, expected inputs, signal categories, environment requirements, and any existing scaffolds
4. **Interview: Technology and shape** — confirm the tech stack and derive a kebab-case scaffold name with `-project` suffix
5. **Interview: Signals to plant** — suggest specific signals based on the agent analysis; the user approves, removes, modifies, or adds signals
6. **Interview: File plan** — present a complete file plan with paths, descriptions, and signal assignments for each file
7. **Generate scaffold** — create directories and write all files with realistic content

## Agent Analysis

In Step 2, the skill reads the agent's definition file (`.md` file with YAML frontmatter under the plugin's `agents/` directory). The analysis identifies:

- What inputs and environment the agent expects (source code, config files, project structure)
- What outputs the agent produces (analysis reports, recommendations, documentation)
- What signals the agent looks for (bugs, security flaws, architectural patterns, gaps)
- What tools the agent uses (Read, Glob, Grep — these reveal what file types and patterns it inspects)

### Graceful skip

If the analysis reveals the agent does not operate on project files (e.g., it queries GitHub APIs or generates content from conversation context), the skill informs the user that a file scaffold would not be useful and stops.

## Signal Planning

Signals are the specific issues, patterns, or findings that the scaffold is designed to contain for the agent to discover. Each signal includes:

- **What** — the signal itself (e.g., "SQL injection via string interpolation in a database query")
- **Where** — where it would live in the scaffold (e.g., "in a database access layer module")
- **Why** — why this matters for the target agent (e.g., "the gap analysis agent specifically checks for missing security controls")

Signals are distributed across multiple files. Some files carry no intentional signals — realistic projects have clean code alongside problematic code.

## What to Do Next

After generating the scaffold, you can:

1. **Write rubric criteria** for the scaffold using `/write-agent-eval-rubric`:
   ```
   /write-agent-eval-rubric r-and-d:gap-analyzer
   ```

2. **Run the tests** to produce output for the judge to evaluate:
   ```bash
   ./harness test-run --suite {agent-name}
   ```

3. **Evaluate results**:
   ```bash
   ./harness test-eval
   ```

## References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from scaffolds to rubric evaluation
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Docker sandbox
- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference
- [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the `/write-agent-eval-rubric` skill: workflow, criteria categories, output format
- [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the equivalent skill for skill-based scaffold generation
- [Writing Agent-Call Evals](write-acil-evals.md) — the `/write-acil-evals` skill: workflow, prompt categories, output format
- [Test Harness README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — define the rubric criteria the judge scores your agent's output against.
**Related:** [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the equivalent skill for skill-based scaffold generation.
