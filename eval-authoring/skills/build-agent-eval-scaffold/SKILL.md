---
name: build-agent-eval-scaffold
description: "Creates a realistic project scaffold — a test fixture — for rubric-based effectiveness evaluation of a Claude Code agent. Given a plugin:agent identifier and an optional project description, analyzes the target agent's definition file to learn what inputs it expects and what signals it looks for, then interviews the user in three phases (technology and shape, signals to plant, file plan) before writing the scaffold to tests/test-suites/{agent}/scaffolds/{name}/. Use when creating, building, or setting up a test scaffold, fixture project, or sample codebase to evaluate an agent's output quality against. Does not create tests.json entries or rubric files — use write-acil-evals or write-agent-eval-rubric for those. Does not create skill scaffolds — use build-skill-eval-scaffold for skills."
argument-hint: "[plugin:agent] [optional description] e.g. example-plugin:gap-analyzer for a rails 7 project with postgres"
allowed-tools: Read, Write, Glob, Grep, Bash(mkdir *)
---

Build a realistic project fixture that the test harness runs the target agent against, so an LLM judge can score the agent's output against a rubric. The fixture only works as an eval when it contains signals the target agent is designed to find and reads like code a real developer wrote, so this workflow analyzes the target agent first, then interviews the user in three phases before writing any files.

## Constraints

These apply to every scaffold and shape both the file plan (Step 5) and generation (Step 6):

- Always write the scaffold to `tests/test-suites/{agent}/scaffolds/{name}/`, relative to the repository root, BECAUSE the harness discovers scaffolds at that path when it builds the Test Sandbox.
- Never write a `.git` directory BECAUSE the harness auto-initializes a git repo with `git init` and commits all scaffold files itself.
- Never write lock files (`package-lock.json`, `Gemfile.lock`, `go.sum`) or dependency directories (`node_modules`, `vendor`, `__pycache__`) unless one is itself a planted signal BECAUSE they add hundreds of generated lines the target agent never inspects and bury the signals that matter.
- Never mark a signal with comments like `BUG HERE` or `INTENTIONAL ISSUE` BECAUSE a signal the agent can find by reading a comment measures nothing about its analysis; signals must require the same work a real codebase would.
- Always keep every file syntactically valid for its language (it should parse or compile apart from intentional logic bugs) BECAUSE a file that fails to parse makes the agent report the syntax error instead of the planted signal.
- Keep interview turns compact: present the list, then the question. Put explanation in the "Why" line of each signal rather than in surrounding prose.

## Step 1: Parse arguments

Parse the user's input into two parts:

- **`plugin:agent`** (required) — the first token, which contains a colon. Split on the colon to extract the plugin name (before the colon) and the agent name (after the colon).
- **Description** (optional) — everything after the first token. This describes the technology and shape of the scaffold project (e.g., "for a rails 7 project with postgres as the database").

If no argument was provided, or the first token contains no colon, ask the user which `plugin:agent` to create a scaffold for and stop until they answer.

Validate that the agent exists by confirming the file `{plugin}/agents/{agent}.md` exists in the repository root. If it does not exist, tell the user and ask them to correct the input.

## Step 2: Analyze target agent

Read the agent's definition file at `{plugin}/agents/{agent}.md`. Agents are self-contained markdown files with YAML frontmatter and a prompt body. They do not have `references/` directories, `scripts/`, or context injection commands.

Analyze the full agent definition to identify:

- What inputs and environment the agent expects (source code files, config files, documentation, specific project structure)
- What outputs the agent produces (analysis reports, gap assessments, architectural reviews, etc.)
- What signals the agent looks for (bugs, security flaws, architectural patterns, missing documentation, implementation gaps)
- What tools the agent uses (Read, Glob, Grep, Bash commands — these reveal what file types and patterns the agent inspects)
- Whether the agent operates on project files at all, or whether it operates on external state (GitHub PRs, CI pipelines, conversation context)

**Graceful skip:** If the analysis reveals the agent does not operate on project files — for example, it queries GitHub APIs (`gh` commands), operates on pull request state, or generates content from conversation context rather than analyzing files in a working directory — inform the user that a file scaffold would not be useful for this agent type and stop. Explain what the agent operates on instead.

## Step 3: Interview Phase 1 — Analysis and project shape

Present the following in one message:

1. **Agent purpose** — a one-sentence summary of what the agent does
2. **Expected inputs** — what file types, config files, and project structure the agent expects to find in a working directory
3. **Signal categories** — the kinds of issues, patterns, or signals the agent detects (grouped into categories)
4. **Environment requirements** — any specific project conventions the scaffold needs to follow (e.g., needs a Gemfile for Ruby, needs a go.mod for Go)
5. **Existing scaffolds** — use Glob on `tests/test-suites/{agent}/scaffolds/*/` and list any found by name so the user can avoid duplicating one; if the suite directory does not exist yet, note that it will be created
6. **Proposed project** — if a description was provided in the arguments, restate the tech stack and project shape it implies; otherwise propose one or two options that fit the agent's expected environment from Step 2
7. **Proposed scaffold name** — derive it from the description: kebab-case with a `-project` suffix (e.g., "rails 7 with postgres" becomes `rails-postgres-project`, "python flask API" becomes `python-flask-project`). If `tests/test-suites/{agent}/scaffolds/{name}/` already exists, say so and ask whether to overwrite it or choose a different name.

Ask the user to confirm or correct the analysis, the tech stack, and the scaffold name in one reply. Wait for their answer, and carry any corrections into the remaining steps.

## Step 4: Interview Phase 2 — Signals to plant

Based on the Step 2 analysis, suggest specific signals to plant in the scaffold. Present them as a numbered list where each entry includes:

- **What** — the signal itself (e.g., "SQL injection via string interpolation in a database query")
- **Where** — where it would live in the scaffold (e.g., "in a database access layer module")
- **Why** — why this matters for the target agent (e.g., "the agent specifically checks for parameterized queries vs. string interpolation")

Draw suggestions from the agent definition — what the agent's instructions explicitly check for and what analysis patterns it follows.

Present the list and ask the user to:

- Approve the list as-is
- Remove signals that are not relevant to their testing goals
- Modify signals to be more specific to their project context
- Add signals not covered by the analysis

Wait for the user to finalize the signal list before proceeding.

## Step 5: Interview Phase 3 — File plan

Present a complete file plan as a structured list. For each file include:

- **Path** — relative to the scaffold root directory
- **Description** — what the file contains and its role in the project
- **Signals** — which signals from Step 4 this file carries (reference by number), or "none" for clean files

Design the file plan against these guidelines:

- Include the standard config files for the tech stack (package.json, Gemfile, go.mod, requirements.txt, etc.) BECAUSE the agent uses them to detect the language and framework.
- Keep the plan focused — enough structure to feel like a real project, but only files the agent would actually inspect or that establish necessary context — BECAUSE every extra file costs the eval run tokens without adding signal.
- Plan source files at roughly 50-150 lines each BECAUSE shorter files read as stubs and longer ones hide signals in bulk.
- Spread signals across multiple source files in a realistic directory structure, and include some files with no intentional signals, BECAUSE real projects mix clean and problematic code; an agent shown only problem files is never tested on telling the two apart.

Present the file plan and wait for the user to approve it. The user may request additions, removals, or modifications to the file plan.

## Step 6: Generate scaffold

After the user approves the file plan:

1. Create the directory structure using `mkdir -p tests/test-suites/{agent}/scaffolds/{name}/` including any subdirectories needed for the planned files.

2. Write each file using the Write tool. For each file, generate realistic content that matches the tech stack and project context, and include its planned signals the way a real developer would have written them — the Constraints above govern what the content may and may not contain.

3. Report the outcome: the scaffold path first, then the complete list of files created with their paths relative to the repository root.
