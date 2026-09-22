# Building Agent Eval Scaffolds

> **Tier 3 · Skill/agent authors building evals.** The `/build-agent-eval-scaffold` skill generates a realistic project fixture for evaluating a Claude Code agent — planted signals for rubric (effectiveness) evaluation by default, or repo context cues for trigger accuracy with `--for trigger`; you need a target `plugin:agent` already defined.

Run `/build-agent-eval-scaffold` to generate a realistic project scaffold an agent can be evaluated against. Given a `plugin:agent` identifier and an optional project description, it analyzes the target agent's definition file to understand what inputs it expects and what signals it looks for, then interviews you in structured phases before writing a scaffold at `tests/test-suites/{agent}/scaffolds/{name}/`. Run it before writing rubric criteria with `/write-agent-eval-rubric`.

## When to use this skill

Use this skill when you need to:

- Create a new test scaffold for an agent's rubric evals
- Build a realistic project fixture that contains specific signals for an agent to find
- Set up a scaffold directory before writing rubric criteria with `/write-agent-eval-rubric`
- Build a trigger-context scaffold (`--for trigger`) that a `agent-call` test can run a repo-dependent prompt against

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
/build-agent-eval-scaffold r-and-d:gap-analyzer --for trigger for a rails 7 project with postgres
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
- `.git` directory — Skillwalker auto-initializes a git repo with `git init` and commits all files
- Lock files (`package-lock.json`, `Gemfile.lock`, `go.sum`) — unless they serve as a specific signal
- Dependency directories (`node_modules`, `vendor`, `__pycache__`)

After writing the files, the skill runs `scripts/validate-scaffold.sh` against the scaffold directory. The script checks these exclusions, greps for marker comments, syntax-checks source files with whatever parsers are installed (`node`, `python3`, `ruby`, `gofmt`, `php`, `bash`, plus JSON), and warns about application source files outside the 50–150 line range. Errors are fixed before the skill reports; warnings are reviewed and either fixed or explained.

## Workflow

The skill walks through a 6-step process with three interview pauses:

1. **Parse arguments** — extract the `plugin:agent` identifier, the optional `--for trigger` flag, and the optional project description
2. **Analyze target agent** — read the agent's definition file to understand what inputs, signals, and environment the agent expects
3. **Interview: Analysis and project shape** — present the agent's purpose, expected inputs, signal categories, environment requirements, and any existing scaffolds alongside the proposed tech stack and a kebab-case scaffold name with `-project` suffix; the user confirms or corrects all of it in one reply
4. **Interview: Signals or cues to plant** — in quality mode, suggest specific signals based on the agent analysis; in trigger mode, suggest context cues with the direction each should push the trigger decision; the user approves, removes, modifies, or adds entries
5. **Interview: File plan** — present a complete file plan with paths, descriptions, and signal assignments for each file
6. **Generate scaffold** — create directories, write all files with realistic content, then run `scripts/validate-scaffold.sh` and fix every error it reports before reporting the result

## Agent Analysis

In Step 2, the skill reads the agent's definition file (`.md` file with YAML frontmatter under the plugin's `agents/` directory). The analysis identifies:

- What inputs and environment the agent expects (source code, config files, project structure)
- What outputs the agent produces (analysis reports, recommendations, documentation)
- What signals the agent looks for (bugs, security flaws, architectural patterns, gaps)
- What tools the agent uses (Read, Glob, Grep — these reveal what file types and patterns it inspects)

### Graceful skip

If the analysis reveals the agent does not operate on project files (e.g., it queries GitHub APIs or generates content from conversation context), the skill informs the user that a file scaffold would not be useful and stops.

## Trigger Mode

`--for trigger` builds a scaffold for `agent-call` tests instead of `agent-prompt` tests. The difference is what gets planted and where.

In a `agent-call` test Skillwalker replaces the agent's body with a no-op, so nothing inside the scaffold is ever analyzed. The only thing the scaffold can change is the decision to call the agent, and that decision is made from the prompt plus what Claude can see before the call: the auto-loaded `CLAUDE.md`, `README.md`, top-level file and directory names, and any file the prompt names explicitly. Trigger cues live in those places.

The skill derives cues from the agent description's "use when" clauses and "does not … use X" boundaries, plus the sibling descriptions in the same plugin, and asks for each cue's **direction**: does its presence mean Claude should delegate to the agent, or that a sibling should handle it instead? One scaffold carries one context; the counterpart (cues absent, or pointing at a sibling) is a second run. Scaffold names take a `-context-project` suffix, and the short-file warnings from the validator are expected in this mode.

After building a trigger scaffold, run `/write-acil-evals r-and-d:gap-analyzer` and name the scaffold for the prompts that depend on it.

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
   ./build/skillwalker test-run --suite {agent-name}
   ```

3. **Evaluate results**:
   ```bash
   ./build/skillwalker test-eval
   ```

## References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from scaffolds to rubric evaluation
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Test Sandbox
- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference
- [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the `/write-agent-eval-rubric` skill: workflow, criteria categories, output format
- [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the equivalent skill for skill-based scaffold generation
- [Writing Agent-Call Evals](write-acil-evals.md) — the `/write-acil-evals` skill: workflow, prompt categories, output format
- [Skillwalker README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — define the rubric criteria the judge scores your agent's output against.
**Related:** [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the equivalent skill for skill-based scaffold generation.
