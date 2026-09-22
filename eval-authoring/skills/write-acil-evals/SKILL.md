---
name: write-acil-evals
description: "Writes agent-call (ACIL) trigger-accuracy tests for a Claude Code agent. Given a plugin:agent identifier, reads the agent's description and the sibling agents and skills in its plugin, collects positive, negative, and sibling trigger prompts from the user, assigns a scaffold to any prompt whose delegation decision depends on repo state, and writes tests.json entries plus prompt files under tests/test-suites/{agent}/. Use when creating or extending agent-call tests, writing ACIL evals, or adding delegation accuracy coverage for an agent. Does not write rubrics or agent-prompt tests — use write-agent-eval-rubric. Does not build scaffolds — use build-agent-eval-scaffold with --for trigger. Does not test skills — use write-scil-evals."
argument-hint: "[plugin:agent] e.g. example-plugin:gap-analyzer"
allowed-tools: Read, Glob, Grep, Write, Edit
---

Produce the prompts and `tests.json` entries that measure whether Claude delegates to the target agent when it should and stays silent when it should not. The prompts decide the eval's value: prompts a person writes in their own words test the agent's description against real phrasing, while prompts paraphrased from the description only test whether the model can match itself. So this skill asks the user for every prompt and drafts none.

## Constraints

- Never modify or remove an existing test entry BECAUSE the existing entries are the baseline an ACIL run scores the description against; changing them changes the baseline silently.
- Every entry carries an explicit `expect` array with `{ "agent-call": true }` or `{ "agent-call": false }` BECAUSE an omitted `expect` falls back to Skillwalker defaults without a warning.
- A prompt file contains only the prompt text — no frontmatter, no heading — BECAUSE Skillwalker sends the file verbatim as the user's message.
- Set `scaffold` on a test only when `tests/test-suites/{suite}/scaffolds/{name}/` already exists BECAUSE Skillwalker validates every scaffold before a run and refuses the whole suite otherwise.
- Every new prompt filename is unique within `prompts/` BECAUSE two tests sharing a file cannot be edited independently.
- Keep interview turns compact: the ask, the guidance for each category, then wait.

## Step 1: Identify the target agent

If the user provided a `plugin:agent` argument (e.g. `example-plugin:gap-analyzer`), use it. If no argument was provided, ask the user which plugin:agent to write evals for and stop until they answer.

Validate the argument format: exactly one colon, both parts non-empty and matching `^[a-z0-9-]+$`. Then confirm `{plugin}/agents/{agent}.md` exists in the repository root. If either check fails, tell the user what was expected and ask them to correct the input.

Read the target agent's definition file. Note its `name`, its `description`, and every boundary statement in the description ("does not …, use X"), because those boundaries are what negative and sibling prompts test.

## Step 2: Detect siblings

Siblings come in two kinds, and both can be wrongly chosen instead of the target:

- **Sibling agents** — Glob `{plugin}/agents/*.md`, excluding the target. Read each `name` and `description`.
- **Sibling skills** — Glob `{plugin}/skills/*/SKILL.md`. Read each `name` and `description`. A skill that covers the same domain can absorb a request that should have reached the agent.

If there are no sibling agents and no sibling skills, sibling prompts are skipped in Step 4.

## Step 3: Locate the test suite

The suite directory is `tests/test-suites/{agent}/`. If `tests.json` exists there, this is an **update**: read it, note the existing `agent-call` tests (names, prompt files, scaffolds), and note every directory under `scaffolds/`. Otherwise this is a **new suite**. Do not ask about the location; state it in the next message and let the user redirect if they want to.

## Step 4: Collect trigger prompts

Send one message that states the suite location and the sibling lists (agents and skills separately), then asks for all three categories at once. Explain each category with its examples:

**Positive prompts (3 to 5)** — natural sentences a real user would type that SHOULD lead Claude to delegate to the agent. They describe the intent the agent handles without necessarily using the agent's name:
- e.g. for gap-analyzer: `compare my implementation against the PRD and find any gaps`
- e.g. without the word "gap": `check if the code covers everything in the requirements document`

**Negative prompts (at least 3)** — prompts that should NOT trigger the agent. They share words with the agent's domain but are about something else:
- e.g. for gap-analyzer: `analyze the gap between our revenue projections and actual earnings`
- e.g. for gap-analyzer: `find the gaps in the fence around the backyard`

**Sibling prompts (at least 3; skip when there are no siblings)** — prompts that fall inside a sibling agent's or sibling skill's domain and should NOT trigger the target. They test that the target's description defers correctly. The user need not say which sibling each one targets.

Also ask: for any prompt whose delegation decision depends on what is in the repository — it says "this branch", "the spec in docs/", "our test suite" — the user should say so and name the scaffold under `scaffolds/` that provides that context, or say that none exists yet.

Wait until every category has been answered before proceeding. The user may answer in more than one reply.

## Step 5: Assign scaffolds

For each prompt the user flagged as context-dependent:

- If the named scaffold directory exists, set `"scaffold": "{name}"` on that test.
- If it does not exist, leave `scaffold` off the entry and record the gap for the report, with the command that builds it: `/build-agent-eval-scaffold {plugin}:{agent} --for trigger`.

When existing `agent-call` tests already use a scaffold and a new prompt reads the same way, propose that scaffold for it.

## Step 6: Generate the test configuration

For each prompt, generate:

1. A prompt file named `agent-call-{descriptive-slug}.md`, where the slug is a short kebab-case summary of the prompt (e.g. `agent-call-compare-code-to-prd.md`, `agent-call-revenue-gap.md`). Check `prompts/` for collisions and pick a different slug when one exists.
2. A test entry with these fields:
   - `"name"`: `"Agent Call: {short descriptive summary}"`
   - `"type"`: `"agent-call"`
   - `"agentFile"`: `"{plugin}:{agent}"`
   - `"promptFile"`: the prompt filename
   - `"model"`: `"opus"` for positive prompts, `"sonnet"` for negative and sibling prompts
   - `"scaffold"`: only when assigned in Step 5
   - `"expect"`: `[{ "agent-call": true }]` for positive prompts, `[{ "agent-call": false }]` for negative and sibling prompts

A new suite's `tests.json` is `{ "plugins": ["{plugin}"], "tests": [ ...entries ] }`. An update appends the new entries to the existing `tests` array.

## Step 7: Present the summary and confirm

Before writing anything, show the user in one message:

1. The suite directory and whether this is a new suite or an update
2. The complete `tests.json` (new) or the entries being appended (update)
3. Each prompt file path with its contents
4. Counts by category: positive, negative, sibling
5. Scaffold assignments, and any prompt that needs a scaffold that does not exist yet

Wait for the user to confirm.

## Step 8: Write and validate

1. Create or edit `tests/test-suites/{suite}/tests.json` and write each prompt file under `tests/test-suites/{suite}/prompts/`.
2. Run `${CLAUDE_SKILL_DIR}/scripts/validate-suite.sh tests/test-suites/{suite}`. It re-checks what Skillwalker checks at load time (prompt files exist and are non-empty, scaffolds and rubrics exist, every entry has `expect`, `agentFile` is present and well-formed) and prints one finding per line between `findings-start` and `findings-end`. Fix every finding and re-run until `errors: 0`.
3. Report: the files created and modified, the counts by category, and any test still waiting on a scaffold with the exact build command.
