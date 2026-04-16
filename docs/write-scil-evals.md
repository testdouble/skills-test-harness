# Writing Skill-Call Evals

The `write-scil-evals` skill generates skill-call test suites for plugin skills. It collects trigger prompts from the user and produces a complete test suite under `tests/test-suites/` with a `tests.json` configuration and prompt files.

## When to Use

Use this skill when you need to:

- Create a new skill-call test suite for a plugin skill
- Add skill-call tests to an existing test suite
- Set up trigger accuracy evaluation before running SCIL

This skill produces **skill-call tests only** — it does not generate prompt-type tests or run the test harness.

## Usage

Invoke the skill with a `plugin:skill` argument:

```
/write-scil-evals r-and-d:code-review
```

If no argument is provided, the skill will ask which plugin:skill to write evals for.

## What It Produces

The skill creates (or updates) a test suite directory:

```
tests/test-suites/{skill-name}/
  tests.json
  prompts/
    skill-call-{descriptive-slug}.md
    skill-call-{descriptive-slug}.md
    ...
```

Each test entry in `tests.json` follows the skill-call format:

```json
{
  "name": "Skill Call: review ruby code",
  "type": "skill-call",
  "model": "opus",
  "skillFile": "r-and-d:code-review",
  "promptFile": "skill-call-review-ruby-code.md",
  "expect": [
    { "skill-call": true }
  ]
}
```

- Positive trigger tests use `"model": "opus"` and `{ "skill-call": true }`
- Negative and sibling trigger tests use `"model": "sonnet"` and `{ "skill-call": false }`

## Workflow

The skill walks through a 9-step process:

1. **Identify the target skill** — parse the `plugin:skill` argument and read the skill's SKILL.md
2. **Detect sibling skills** — list other skills in the same plugin to determine if sibling prompts are needed
3. **Determine test suite location** — default to `tests/test-suites/{skill-name}/`, detect create vs. update mode
4. **Collect positive trigger prompts** — 3-5 prompts that SHOULD trigger the skill
5. **Collect negative trigger prompts** — 3+ prompts that should NOT trigger the skill (false-positive resistance)
6. **Collect sibling trigger prompts** — 3+ prompts targeting sibling skills (skipped for solo-skill plugins)
7. **Generate test configuration** — create tests.json entries and prompt files with auto-generated names
8. **Present summary for review** — show everything before writing
9. **Write files** — create or update the test suite

## Prompt Categories

### Positive triggers (3-5 required)

Prompts that should trigger the target skill. These describe the intent the skill handles in natural language.

Good positive prompts:
- Use different phrasings for the same intent
- Include at least one that avoids the skill's name entirely
- Feel like something a real user would type

### Negative triggers (3+ required)

Prompts that should NOT trigger the target skill. These share vocabulary with the skill's domain but are about something else entirely.

Good negative prompts:
- Use overlapping words in a different context (e.g., "movie review" for a code-review skill)
- Test the skill's ability to distinguish its domain from unrelated requests

### Sibling triggers (3+ when applicable)

Prompts that should trigger a sibling skill in the same plugin, not the target. Only collected when the plugin has multiple skills.

Good sibling prompts:
- Clearly fall within a sibling skill's domain
- Test that the target skill's description correctly defers to siblings

## Create vs. Update

- **New suite**: Creates the directory, `tests.json`, and all prompt files from scratch
- **Existing suite**: Appends new test entries to the existing `tests.json` and creates new prompt files with unique names. Never modifies or removes existing tests.

## What to Do Next

After generating the test suite, you can:

1. **Run the tests** to check trigger accuracy:
   ```bash
   ./harness test-run --suite {skill-name}
   ```

2. **Evaluate results**:
   ```bash
   ./harness test-eval
   ```

3. **Run SCIL** to iteratively improve the skill's trigger description based on eval results. See [Skill Call Improvement Loop](skill-call-improvement-loop.md).

## References

- [Building SCIL Evals](scil-evals-guide.md) — step-by-step guide covering the full workflow from writing tests to running SCIL
- [Test Suite Configuration](test-suite-configuration.md) — full tests.json field reference for `skill-call` type tests
- [Skill Call Improvement Loop](skill-call-improvement-loop.md) — SCIL mechanics: holdout splits, scoring, improvement prompt, CLI flags
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Docker sandbox
- [Script Extraction](script-extraction.md) — the `/script-extraction` skill: hardening skills by extracting mechanical steps into scripts
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
- [Writing Agent-Call Evals](write-acil-evals.md) — parallel skill for agent-call test suites
