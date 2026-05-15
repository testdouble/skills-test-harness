# Test Scaffolding

Scaffolds provide a pre-built project structure that Claude Code runs against inside the Docker sandbox. They give skills something to work with — source files to review, configurations to discover, documentation to enhance — so tests can verify skill behavior against realistic project contexts.

## How Scaffolding Works

When a test case includes a `scaffold` field, the harness passes the scaffold path to the sandbox run script. The script copies the scaffold into a temporary working directory and initializes a git repository before Claude Code starts.

```
tests/test-suites/code-review/
  scaffolds/
    ruby-project/           <-- scaffold directory
      Gemfile
      lib/
        example.rb
  prompts/
    prompt-code-review.md
  tests.json                <-- references scaffold by name
```

### Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Config Validation                                            │
│                                                                 │
│    Read tests.json                                              │
│         │                                                       │
│         ▼                                                       │
│    For each test with a scaffold field:                          │
│         │                                                       │
│         ▼                                                       │
│    Check scaffolds/{name}/ exists ── missing? ──▶ exit with     │
│         │                                        error message  │
│         ▼                                                       │
│    Validation passes                                            │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Sandbox Execution (per test)                                 │
│                                                                 │
│    docker sandbox exec claude-skills-harness                    │
│      sandbox-run.sh {scaffold-path} {claude-args}               │
│         │                                                       │
│         ▼                                                       │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ sandbox-run.sh                                         │     │
│  │                                                        │     │
│  │  1. Copy scaffold into a temp directory                │     │
│  │                                                        │     │
│  │  2. git init -b main                                   │     │
│  │     git add -A                                         │     │
│  │     git commit -m "Initial commit"                     │     │
│  │                                                        │     │
│  │  3. exec claude "$@"                                   │     │
│  └────────────────────────────────────────────────────────┘     │
│         │                                                       │
│         ▼                                                       │
│    Claude Code runs in the temp directory with:                 │
│      - Scaffold files committed to git                          │
│      - Plugins available from the repo workspace                │
│      - Full git history available (one initial commit)          │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step

1. **Config validation** — The harness reads `tests.json` and verifies that every test's `scaffold` field points to an existing directory under `scaffolds/`. Missing scaffolds cause an immediate exit with a clear error message.

2. **Sandbox exec** — For each test with a scaffold, the harness passes the full scaffold path to `sandbox-run.sh` via `docker sandbox exec`.

3. **Script copies scaffold** — Inside the sandbox, `sandbox-run.sh` copies the scaffold contents into a temporary working directory and changes into it.

4. **Git initialization** — The script initializes a fresh git repository on the `main` branch, stages all files, and creates an initial commit. This gives skills access to git history and diff capabilities.

5. **Claude Code starts** — The script hands off to `claude` with whatever flags the harness passed (model, plugins, prompt, etc.). Claude Code's working directory contains the scaffold files with a clean git history.

## Configuring Scaffolds

### tests.json

Add the `scaffold` field to any test case that needs a project context:

```json
{
  "plugins": ["r-and-d"],
  "tests": [
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
    },
    {
      "name": "Prompt: no op",
      "type": "skill-prompt",
      "model": "sonnet",
      "promptFile": "prompt-no-op.md",
      "expect": [
        { "result-does-not-contain": "# Code Review:" }
      ]
    }
  ]
}
```

The first test uses a scaffold; the second does not. Tests without a `scaffold` field run in an empty `/workspace` directory with no git repository.

### Scaffold Field Rules

- The `scaffold` field is **optional** on each test case.
- The value must match a directory name under `scaffolds/` in the same test suite.
- Validation runs before sandbox execution — a bad scaffold name fails fast.
- Different tests in the same suite can use different scaffolds, or no scaffold at all.

## Creating a Scaffold

### Directory Structure

Create a directory under your test suite's `scaffolds/` folder. The directory name becomes the scaffold name used in `tests.json`:

```
tests/test-suites/{suite-name}/
  scaffolds/
    {scaffold-name}/
      ... project files ...
```

### Design Guidelines

**Keep scaffolds minimal.** Include only the files the skill needs to do its job. A code review skill needs source files with reviewable code. A project discovery skill needs config files from multiple languages. Don't add files that aren't relevant to what the skill will inspect.

**Include intentional signals.** If you're testing a code review skill, the scaffold should contain code with identifiable issues. If you're testing a documentation skill, include minimal or missing documentation that the skill should flag.

**Match the skill's expected environment.** If a skill looks for `package.json`, include one. If it inspects `Gemfile`, include one. The scaffold should represent the kind of project the skill is designed to work with.

**Remember that git is initialized automatically.** You don't need to include a `.git` directory. The sandbox run script creates a fresh repository and commits all scaffold files. Skills that check `git log`, `git diff`, or branch information will see a single "Initial commit" on the `main` branch.

### Examples

**Simple single-language project** (`ruby-project`):

```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb
```

Used by: code-review, coding-standard, investigate, test-planning, iterative-plan-review

**Multi-language project** (`polyglot-project`):

```
scaffolds/polyglot-project/
  node-app/
    package.json
    src/
      index.js
  ruby-app/
    Gemfile
    lib/
      main.rb
```

Used by: project-discovery (needs to detect multiple languages/frameworks)

**Project with existing documentation** (`node-project`):

```
scaffolds/node-project/
  package.json
  README.md
  src/
    index.js
```

Used by: project-documentation, create-adr (needs a project with existing docs to enhance)

**Project with a pre-written plan** (iterative-plan-review variant):

```
scaffolds/ruby-project/
  Gemfile
  lib/
    example.rb
  plan.md
```

Used by: iterative-plan-review (needs an existing plan document to iterate on)

## Tests With and Without Scaffolds

Not every test needs a scaffold. The choice depends on what the test is verifying:

| Scenario | Use Scaffold? | Why |
|----------|--------------|-----|
| Skill processes source code | Yes | Skill needs files to analyze |
| Skill discovers project structure | Yes | Skill needs config files and directories |
| Negative test — skill should NOT trigger | Usually no | Empty workspace is sufficient to verify non-invocation |
| Skill requires external tools (e.g. `gh`) | Usually no | GitHub CLI isn't available in the sandbox |

### Sharing Scaffolds Across Suites

Each test suite has its own `scaffolds/` directory. If multiple suites need the same project structure, the scaffold files are duplicated into each suite. This keeps suites self-contained — changes to one suite's scaffold don't affect others.

## References

- [Test Harness README](../README.md) — prerequisites, setup, and running tests
- [Test Suite Configuration](test-suite-reference.md) — full tests.json field reference including the `scaffold` field
- [Building SCIL Evals](scil-evals-guide.md) — step-by-step guide for trigger accuracy evals (scaffolds are optional)
- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide for quality evals (scaffolds provide context for the judge)
- [Docker Integration](docker-integration.md) — how `sandbox-run.sh` copies scaffolds into the sandbox and initializes a git repo
- [Docker Integration Package](docker-integration-package.md) — Full API reference for the Docker integration package
- [Claude Integration](claude-integration.md) — Claude CLI wrapper that passes scaffold paths to the sandbox
