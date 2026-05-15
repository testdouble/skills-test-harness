# Writing Agent-Call Evals

The `write-acil-evals` skill generates agent-call test suites for plugin agents. It collects trigger prompts from the user and produces a complete test suite under `tests/test-suites/` with a `tests.json` configuration and prompt files.

## When to Use

Use this skill when you need to:

- Create a new agent-call test suite for a plugin agent
- Add agent-call tests to an existing test suite
- Set up trigger accuracy evaluation before running ACIL

This skill produces **agent-call tests only** — it does not generate prompt-type tests or run the test harness. For skill-call tests, use `/write-scil-evals` instead.

## Usage

Invoke the skill with a `plugin:agent` argument:

```
/write-acil-evals r-and-d:gap-analyzer
```

If no argument is provided, the skill will ask which plugin:agent to write evals for.

## What It Produces

The skill creates (or updates) a test suite directory:

```
tests/test-suites/{agent-name}/
  tests.json
  prompts/
    agent-call-{descriptive-slug}.md
    agent-call-{descriptive-slug}.md
    ...
```

Each test entry in `tests.json` follows the agent-call format:

```json
{
  "name": "Agent Call: compare code to PRD",
  "type": "agent-call",
  "model": "opus",
  "agentFile": "r-and-d:gap-analyzer",
  "promptFile": "agent-call-compare-code-to-prd.md",
  "expect": [
    { "agent-call": true }
  ]
}
```

- Positive trigger tests use `"model": "opus"` and `{ "agent-call": true }`
- Negative and sibling trigger tests use `"model": "sonnet"` and `{ "agent-call": false }`

## Workflow

The skill walks through a 9-step process:

1. **Identify the target agent** — parse the `plugin:agent` argument, validate format, and read the agent's `.md` file
2. **Detect sibling agents and skills** — list other agents and skills in the same plugin to determine if sibling prompts are needed
3. **Determine test suite location** — default to `tests/test-suites/{agent-name}/`, detect create vs. update mode
4. **Collect positive trigger prompts** — 3-5 prompts that SHOULD trigger the agent
5. **Collect negative trigger prompts** — 3+ prompts that should NOT trigger the agent (false-positive resistance)
6. **Collect sibling trigger prompts** — 3+ prompts targeting sibling agents or skills (skipped when no siblings exist)
7. **Generate test configuration** — create tests.json entries and prompt files with auto-generated names
8. **Present summary for review** — show everything before writing
9. **Write files** — create or update the test suite

## Prompt Categories

### Positive triggers (3-5 required)

Prompts that should trigger the target agent. These describe the intent the agent handles in natural language.

Good positive prompts:
- Use different phrasings for the same intent
- Include at least one that avoids the agent's name entirely
- Feel like something a real user would type

### Negative triggers (3+ required)

Prompts that should NOT trigger the target agent. These share vocabulary with the agent's domain but are about something else entirely.

Good negative prompts:
- Use overlapping words in a different context (e.g., "analyze the gap in revenue" for a gap-analyzer agent)
- Test the agent's ability to distinguish its domain from unrelated requests

### Sibling triggers (3+ when applicable)

Prompts that should trigger a sibling agent or skill in the same plugin, not the target. Only collected when the plugin has sibling agents or sibling skills.

Good sibling prompts:
- Clearly fall within a sibling agent's or skill's domain
- Test that the target agent's description correctly defers to siblings
- Cover both sibling agents (wrong agent triggered) and sibling skills (skill triggered instead of agent)

## Create vs. Update

- **New suite**: Creates the directory, `tests.json`, and all prompt files from scratch
- **Existing suite**: Appends new test entries to the existing `tests.json` and creates new prompt files with unique names. Never modifies or removes existing tests.

## What to Do Next

After generating the test suite, you can:

1. **Run the tests** to check trigger accuracy:
   ```bash
   ./harness test-run --suite {agent-name}
   ```

2. **Evaluate results**:
   ```bash
   ./harness test-eval
   ```

3. **Run ACIL** to iteratively improve the agent's trigger description based on eval results. See [Agent Call Improvement Loop](agent-call-improvement-loop.md).

## References

- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring
- [Test Suite Configuration](test-suite-reference.md) — full tests.json field reference for `agent-call` type tests
- [Writing Skill-Call Evals](write-scil-evals.md) — parallel skill for skill-call test suites
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Docker sandbox
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
