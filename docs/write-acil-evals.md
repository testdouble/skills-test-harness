# Writing Agent-Call Evals

> **Tier 3 · Skill/agent authors building evals.** The `/write-acil-evals` skill generates a complete agent-call eval (`tests.json` plus prompt files) for a plugin agent; you need a target `plugin:agent` already defined.

Run `/write-acil-evals` to scaffold a trigger-accuracy eval for a plugin agent. The skill interviews you for trigger prompts and writes a `tests.json` configuration plus prompt files under `evals/`. Use it before running ACIL, when you need to create an agent-call eval or add agent-call tests to an existing one.

## When to use this skill

Use this skill when you need to:

- Create a new agent-call eval for a plugin agent
- Add agent-call tests to an existing eval
- Set up trigger accuracy evaluation before running ACIL

## When NOT to use this skill

- You need prompt-type or rubric (effectiveness) tests — this skill produces **agent-call tests only**. Use `/write-agent-eval-rubric` for quality rubrics.
- You're testing a skill rather than an agent — use `/write-scil-evals` instead.
- You want to run Skillwalker or improve a description — this skill scaffolds tests but does not run them or invoke ACIL.

## Usage

Invoke the skill with a `plugin:agent` argument:

```
/write-acil-evals r-and-d:gap-analyzer
```

If no argument is provided, the skill will ask which plugin:agent to write evals for.

## What It Produces

The skill creates (or updates) an eval directory:

```
evals/{agent-name}/
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

The skill walks through an 8-step process with two pauses for the user: one to collect prompts, one to confirm before writing.

1. **Identify the target agent** — parse and validate the `plugin:agent` argument, read the agent's definition file, and note the description's boundary statements (they are what negative and sibling prompts test)
2. **Detect siblings** — list the sibling agents and sibling skills in the same plugin
3. **Locate the eval** — `evals/{agent-name}/`; detect create vs. update mode and note existing scaffolds
4. **Collect trigger prompts** — one message asks for all three categories (positive, negative, sibling) with guidance for each, and asks the user to flag any prompt whose trigger decision depends on repo state
5. **Assign scaffolds** — flagged prompts get `scaffold` set when the named scaffold exists; otherwise the gap is reported with the `/build-agent-eval-scaffold … --for trigger` command that builds it
6. **Generate test configuration** — tests.json entries and prompt files with auto-generated names
7. **Present summary and confirm** — everything that will be written, plus scaffold assignments and gaps
8. **Write and validate** — create or update the eval, then run `scripts/validate-eval.sh`, which re-checks what Skillwalker checks at load time, and fix every finding before reporting
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

- **New eval**: Creates the directory, `tests.json`, and all prompt files from scratch
- **Existing eval**: Appends new test entries to the existing `tests.json` and creates new prompt files with unique names. Never modifies or removes existing tests.

## What to Do Next

After generating the eval, you can:

1. **Run the tests** to check trigger accuracy:
   ```bash
   ./build/skillwalker test-run --eval {agent-name}
   ```

2. **Evaluate results**:
   ```bash
   ./build/skillwalker test-eval
   ```

3. **Run ACIL** to iteratively improve the agent's trigger description based on eval results. See [Agent Call Improvement Loop](agent-call-improvement-loop.md).

## References

- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring
- [Evals Reference](evals-reference.md) — full tests.json field reference for `agent-call` type tests
- [Writing Skill-Call Evals](write-scil-evals.md) — parallel skill for skill-call evals
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Test Sandbox
- [Skillwalker README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL mechanics for refining the agent's trigger description once your eval exists.
**Related:** [Writing Skill-Call Evals](write-scil-evals.md) — the parallel skill for skill-call evals.
