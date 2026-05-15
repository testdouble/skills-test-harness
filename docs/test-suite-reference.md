# Test Suite Configuration

This is the complete reference for configuring test suites in the eval harness. Each test suite lives in its own directory under `tests/test-suites/` and is defined by a `tests.json` file.

## Directory Layout

```
tests/test-suites/{suite-name}/
  tests.json              # test configuration (required)
  prompts/                # prompt files referenced by tests
    prompt-code-review.md
    skill-call-movie-review.md
  scaffolds/              # optional project scaffolds
    ruby-project/
      Gemfile
      lib/example.rb
  rubrics/                # optional rubric files for llm-judge
    code-review-quality.md
```

- **`tests.json`** — defines which plugins to load, what tests to run, and what to expect
- **`prompts/`** — contains the prompt files sent to Claude Code for each test
- **`scaffolds/`** — contains project directories copied into the Docker sandbox as a working codebase. See [Test Scaffolding](test-scaffolding.md) for details.
- **`rubrics/`** — contains rubric markdown files used by `llm-judge` expectations. See [LLM Judge Evaluation](llm-judge.md) for details.

## tests.json Format

### Complete Example

This example from the `code-review` suite shows all test types and expectation types:

```json
{
  "plugins": ["r-and-d"],
  "tests": [
    {
      "name": "Prompt: /code-review simple ruby file",
      "type": "skill-prompt",
      "promptFile": "prompt-code-review.md",
      "model": "opus",
      "scaffold": "ruby-project",
      "expect": [
        { "result-contains": "# Code Review:" },
        { "skill-call": { "skill": "r-and-d:code-review", "expected": true } },
        { "llm-judge": { "rubricFile": "code-review-quality.md", "model": "opus", "threshold": 0.8 } }
      ]
    },
    {
      "name": "Prompt: no op",
      "type": "skill-prompt",
      "model": "sonnet",
      "promptFile": "prompt-no-op.md",
      "expect": [
        { "result-does-not-contain": "# Code Review:" },
        { "skill-call": { "skill": "r-and-d:code-review", "expected": false } }
      ]
    },
    {
      "name": "Skill Call: /code-review",
      "type": "skill-call",
      "model": "opus",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-code-review.md",
      "scaffold": "ruby-project",
      "expect": [
        { "skill-call": true }
      ]
    },
    {
      "name": "Skill Call: movie review",
      "type": "skill-call",
      "model": "sonnet",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-movie-review.md",
      "expect": [
        { "skill-call": false }
      ]
    }
  ]
}
```

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plugins` | `string[]` | yes | Plugin directory names (relative to the repo root) to load when running tests. Claude Code will have access to all skills in these plugins. |
| `tests` | `TestCase[]` | yes | Array of test case objects. |

### Test Case Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | yes | — | Display name shown in test output. |
| `type` | string | yes | — | How the test is run: `"skill-prompt"`, `"skill-call"`, `"agent-call"`, or `"agent-prompt"`. See [Test Types](#test-types). |
| `promptFile` | string | yes | — | Filename of the prompt in the suite's `prompts/` directory. |
| `skillFile` | string | skill-call only | — | The skill to isolate, in `plugin:skill` format (e.g. `"r-and-d:code-review"`). Required for `"skill-call"` type tests. |
| `agentFile` | string | no | — | The agent to check for invocation, in `plugin:agent` format (e.g. `"r-and-d:gap-analyzer"`). Required when using simplified `agent-call` expectations. |
| `model` | string | no | `"sonnet"` | The Claude model to use: `"opus"`, `"sonnet"`, or `"haiku"`. |
| `scaffold` | string | no | — | Name of a scaffold directory under the suite's `scaffolds/` folder. See [Test Scaffolding](test-scaffolding.md). |
| `expect` | `Expectation[]` | yes | — | Array of expectation objects. All expectations must pass for the test to pass. |

## Test Types

### skill-prompt

Sends the prompt to Claude with all plugins from the `plugins` array loaded. Use `expect` entries to assert conditions on the result or skill invocations.

Use skill-prompt tests to verify that a skill completes successfully and produces meaningful output. These tests run with `--dangerously-skip-permissions` so the skill can execute without user approval prompts.

```json
{
  "name": "Prompt: /code-review",
  "type": "skill-prompt",
  "model": "opus",
  "promptFile": "prompt-code-review.md",
  "scaffold": "ruby-project",
  "expect": [
    { "result-contains": "# Code Review:" },
    { "skill-call": { "skill": "r-and-d:code-review", "expected": true } }
  ]
}
```

### skill-call

Builds a temporary plugin containing only the skill specified by `skillFile`, then sends the prompt to Claude with that isolated plugin. The skill's body is replaced with a no-op instruction — only the `name` and `description` frontmatter fields are preserved.

Use skill-call tests to verify that a user prompt correctly triggers (or does not trigger) the intended skill without interference from other skills. These tests are also used by the [SCIL command](skill-call-improvement-loop.md) for iterative description improvement.

```json
{
  "name": "Skill Call: /code-review",
  "type": "skill-call",
  "model": "opus",
  "skillFile": "r-and-d:code-review",
  "promptFile": "skill-call-code-review.md",
  "scaffold": "ruby-project",
  "expect": [
    { "skill-call": true }
  ]
}
```

**Model conventions for skill-call tests:**
- Positive trigger tests (`"skill-call": true`) typically use `"model": "opus"` — the strongest model should reliably trigger the skill
- Negative trigger tests (`"skill-call": false`) typically use `"model": "sonnet"` — if a weaker model can resist false triggers, the description is well-bounded

### agent-call

Builds a temporary plugin containing only the agent specified by `agentFile`, then sends the prompt to Claude with that isolated plugin. The agent's body is replaced with a no-op instruction — only the `name` and `description` frontmatter fields are preserved. Detection relies on `tool_use_result.agentType` stream events to determine whether the agent was delegated to.

Use agent-call tests to verify that a user prompt correctly triggers (or does not trigger) the intended agent without interference from other agents. These tests are also used by the [ACIL command](agent-call-improvement-loop.md) for iterative description improvement.

```json
{
  "name": "Agent Call: gap-analyzer triggered",
  "type": "agent-call",
  "model": "opus",
  "agentFile": "r-and-d:gap-analyzer",
  "promptFile": "agent-call-gap-analyzer.md",
  "expect": [
    { "agent-call": true }
  ]
}
```

**Model conventions for agent-call tests:**
- Positive trigger tests (`"agent-call": true`) typically use `"model": "opus"` — the strongest model should reliably trigger the agent
- Negative trigger tests (`"agent-call": false`) typically use `"model": "sonnet"` — if a weaker model can resist false triggers, the description is well-bounded

### agent-prompt

Sends the prompt to Claude with all plugins from the `plugins` array loaded, and wraps the prompt with forced agent delegation. The harness prepends "Use the {agent} agent to accomplish the following task:" to ensure the specified agent is invoked. The `agentFile` field identifies the target agent in `plugin:agent` format.

Use agent-prompt tests to verify that an agent completes successfully and produces meaningful output when given a task. These tests support scaffold, model, and llm-judge expectations just like skill-prompt tests.

```json
{
  "name": "Agent Prompt: gap-analyzer quality",
  "type": "agent-prompt",
  "agentFile": "r-and-d:gap-analyzer",
  "promptFile": "prompt-gap-analysis.md",
  "model": "opus",
  "scaffold": "ruby-project",
  "expect": [
    { "result-contains": "## Gap Analysis" },
    { "llm-judge": { "rubricFile": "gap-analyzer-quality.md", "model": "opus", "threshold": 0.8 } }
  ]
}
```

**Required fields:**
- `agentFile` — the agent to delegate to, in `plugin:agent` format (e.g. `"r-and-d:gap-analyzer"`)

## Expectation Types

### result-contains

Passes if Claude's final `result` text contains the given substring. Fails if the result is empty or missing.

```json
{ "result-contains": "# Code Review:" }
```

### result-does-not-contain

Passes if Claude's final `result` text does NOT contain the given substring. Fails if the result is empty or missing.

```json
{ "result-does-not-contain": "ERROR" }
```

### skill-call

Checks whether a specific skill was invoked during the test run. Has two formats depending on the test type.

**Full object format** — used in `"skill-prompt"` type tests where you need to specify which skill:

```json
{ "skill-call": { "skill": "r-and-d:code-review", "expected": true } }
```

| Field | Type | Description |
|-------|------|-------------|
| `skill` | string | Skill identifier in `plugin:skill` format |
| `expected` | boolean | `true` if the skill should be invoked, `false` if it should not |

**Simplified boolean format** — used in `"skill-call"` type tests where the skill is inferred from `skillFile`:

```json
{ "skill-call": true }
{ "skill-call": false }
```

### agent-call

Checks whether a specific agent was invoked during the test run. Has two formats, mirroring the skill-call pattern.

**Full object format** — used in `"skill-prompt"` or `"agent-prompt"` type tests where you need to specify which agent:

```json
{ "agent-call": { "agent": "r-and-d:gap-analyzer", "expected": true } }
```

| Field | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent identifier in `plugin:agent` format |
| `expected` | boolean | `true` if the agent should be invoked, `false` if it should not |

**Simplified boolean format** — used when the agent is inferred from `agentFile`:

```json
{ "agent-call": true }
{ "agent-call": false }
```

### llm-judge

Evaluates skill output against a rubric of criteria using a second Claude invocation. The judge receives the scaffold files, a transcript of tool calls, and the final output, then scores each criterion as pass or fail.

```json
{ "llm-judge": { "rubricFile": "code-review-quality.md", "model": "opus", "threshold": 0.8 } }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `rubricFile` | string | yes | — | Filename of the rubric in the suite's `rubrics/` directory |
| `model` | string | no | `"opus"` | Claude model used as the judge |
| `threshold` | number | no | `1.0` | Fraction of criteria that must pass (0.0–1.0) for the expectation to pass |

The rubric file must exist at `test-suites/{suite}/rubrics/{rubricFile}` — the harness validates this at load time.

For the full details on writing rubrics, judge mechanics, scoring, and output format, see [LLM Judge Evaluation](llm-judge.md). For a step-by-step guide to building rubric evals, see [Building Rubric Evals](rubric-evals-guide.md).

## Prompt Files

Prompt files are plain markdown files in the suite's `prompts/` directory. Each file contains the exact text sent to Claude Code as the `--print` argument.

Prompt files for skill-call tests should read like something a real user would type. They should NOT reference the skill by its internal name — the point is to test whether natural language triggers the skill.

```markdown
Please review the code in this project and let me know about any issues you find.
```

## Validation

The harness validates the test suite configuration before running any tests:

- Every `promptFile` must exist in the suite's `prompts/` directory
- Every `scaffold` must point to an existing directory under `scaffolds/`
- Every `rubricFile` in `llm-judge` expectations must exist in `rubrics/`
- `skill-call` type tests must have a `skillFile` field

Missing files or invalid configuration cause an immediate exit with a clear error message.

## References

- [Test Harness README](../README.md) — getting started and running tests
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context inside the Docker sandbox
- [LLM Judge Evaluation](llm-judge.md) — how the judge works: prompt construction, scoring, output format
- [Building SCIL Evals](scil-evals-guide.md) — step-by-step guide to writing and running skill-call evals
- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide to writing and running LLM-judge evals
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the `/write-skill-eval-rubric` skill workflow
- [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the `/write-agent-eval-rubric` skill workflow
- [Building Skill Eval Scaffolds](build-skill-eval-scaffold.md) — the `/build-skill-eval-scaffold` skill workflow
- [Building Agent Eval Scaffolds](build-agent-eval-scaffold.md) — the `/build-agent-eval-scaffold` skill workflow
- [Skill Call Improvement Loop](skill-call-improvement-loop.md) — using the `scil` command to iteratively improve skill descriptions
- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL mechanics and agent-call test usage
- [Writing Agent-Call Evals](write-acil-evals.md) — skill for generating agent-call test suites
- [Parquet Schema](parquet-schema.md) — field reference for analytics data
- [CLI Package](cli.md) — CLI commands that parse and execute test suite configurations
- [Data Package](data.md) — Config parsing and normalization logic for `tests.json` files
- [Evals Package](evals.md) — Evaluation engine that processes expectations defined in test suite configs
