# Script Extraction

The `script-extraction` skill refactors a Claude Code skill by extracting mechanical/deterministic steps into shell scripts, applying the Hardening Principle. It analyzes a target SKILL.md and its existing scripts, classifies every step as fuzzy or mechanical with evidence, presents recommendations for user approval, then writes new scripts and updates the SKILL.md.

## When to Use

Use this skill when you need to:

- Harden a skill by moving deterministic logic into shell scripts
- Reduce LLM non-determinism in a skill's execution
- Refactor mechanical steps out of a SKILL.md into reusable scripts
- Audit which parts of a skill are fuzzy (require LLM reasoning) vs. mechanical (deterministic)

This skill produces **scripts and SKILL.md updates only** — it does not create new skills from scratch. Use `skill-creator` for that.

## Usage

Invoke the skill with a `plugin:skill` argument or a path to a SKILL.md:

```
/script-extraction r-and-d:code-review
/script-extraction path/to/SKILL.md
```

If no argument is provided, the skill will ask which skill to analyze.

## What It Produces

The skill creates or updates scripts and modifies the target SKILL.md:

```
{plugin}/skills/{skill}/
  scripts/
    {new-script}.sh          # extracted mechanical steps
    {existing-script}.sh     # rewritten if needed
  SKILL.md                   # updated to reference new scripts
```

Scripts follow a standard template:
- `#!/usr/bin/env bash` shebang and `set -euo pipefail`
- Comment block with description, usage, arguments, and output format
- Argument validation, named variables, input validation
- stdout for output, stderr for errors, non-zero exit on failure

## Workflow

The skill walks through a 6-step process:

1. **Parse input and locate target** — resolve the `plugin:skill` argument or file path to the target SKILL.md and its directory
2. **Inventory** — enumerate every discrete operation in the SKILL.md body and existing scripts (numbered steps, context injections, script invocations, tool calls, conditionals, script internals)
3. **Classify with evidence** — classify each operation as fuzzy or mechanical using determinism heuristics; assign a recommendation (Extract, Merge, Rewrite, Remove, Keep) with two pieces of evidence per operation
4. **Present to user and collect feedback** — show classifications grouped by recommendation type; the user approves, rejects, or modifies individual recommendations before proceeding
5. **Build scripts** — write new scripts for approved Extract, Merge, and Rewrite recommendations following the bash script template
6. **Rewrite SKILL.md steps** — surgically update only the affected steps to reference new scripts using `${CLAUDE_SKILL_DIR}/scripts/` paths

## Classification Categories

### Fuzzy operations (Keep as prose)

Operations that require LLM reasoning — reading code and judging quality, generating natural language, making context-dependent decisions. These stay as prose instructions in the SKILL.md.

### Mechanical operations (Extract to scripts)

Operations with deterministic inputs and outputs — file discovery via glob patterns, JSON construction with fixed schemas, git commands with fixed flags, regex pattern matching. These are candidates for script extraction.

## Recommendation Types

| Recommendation | Description |
|---------------|-------------|
| **Extract** | New script for a currently-prose mechanical step |
| **Merge** | Combine multiple related operations into one script |
| **Rewrite** | Existing script needs modification |
| **Remove** | Existing script is unnecessary or duplicates another |
| **Keep** | Leave as-is (fuzzy stays as prose; correct scripts unchanged) |

## Evidence Requirements

Each classification requires two pieces of evidence:

1. **Determinism evidence** — proof that identical inputs always produce identical correct outputs (mechanical) or that they do not (fuzzy). Cites the specific mechanism (e.g., "jq filter with fixed selector") or reason (e.g., "requires reading code and judging quality").

2. **Extraction correctness evidence** — for mechanical operations: input sources, expected output format, error conditions, and at least one edge case. For fuzzy operations: why LLM reasoning is required.

## What to Do Next

After extracting scripts, you can:

1. **Test the skill manually** to verify the extracted scripts work correctly in context

2. **Run existing evals** if the skill has a test suite:
   ```bash
   ./harness test-run --suite {skill-name}
   ./harness test-eval
   ```

3. **Write evals** if the skill doesn't have a test suite yet:
   ```
   /write-scil-evals {plugin}:{skill}
   /write-skill-eval-rubric {plugin}:{skill}
   ```

## References

- [Context Injection Commands](../../docs/skill-building-guidance/context-injection-commands.md) — bang-backtick syntax for runtime data; relevant when classifying context injection operations
- [Script Execution Instructions](../../docs/skill-building-guidance/script-execution-instructions.md) — how script invocations should be written in SKILL.md
- [Bash Permission Patterns](../../docs/skill-building-guidance/allowed-tools-bash-permissions.md) — `allowed-tools` entries for Bash commands in skills
- [Writing Skill-Call Evals](write-scil-evals.md) — the `/write-scil-evals` skill: workflow, prompt categories, output format
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the `/write-skill-eval-rubric` skill: workflow, criteria categories, output format
- [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the `/build-skill-eval-scaffold` skill: analysis, signal planning, scaffold generation
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
