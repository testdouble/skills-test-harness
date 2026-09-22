---
name: build-agent-eval-scaffold
description: "Creates a realistic project scaffold — a test fixture — for evaluating a Claude Code agent. By default the scaffold carries planted signals the agent should find, for rubric-based agent-prompt tests; with --for trigger it carries the repo context cues that decide whether Claude should delegate to the agent, for agent-call tests. Analyzes the target agent's definition file, then interviews the user in three phases (technology and shape, signals or cues to plant, file plan) before writing the scaffold to evals/{agent}/scaffolds/{name}/. Use when creating, building, or setting up a test scaffold, fixture project, or sample codebase for an agent eval. Does not create tests.json entries or rubric files — use write-acil-evals or write-agent-eval-rubric. Does not create skill scaffolds — use build-skill-eval-scaffold."
argument-hint: "[plugin:agent] [optional description] [--for trigger] e.g. example-plugin:gap-analyzer for a rails 7 project with postgres"
allowed-tools: Read, Write, Glob, Grep, Bash(mkdir *)
---

Build a realistic project fixture Skillwalker runs the target agent against. In **quality mode** (the default) the fixture holds signals the agent is designed to find, so an LLM judge can score the agent's output against a rubric. In **trigger mode** (`--for trigger`) the fixture holds the repository context that decides whether Claude should delegate to the agent at all, so an `agent-call` test can measure delegation accuracy on prompts that depend on repo state. Either way the fixture only works when it reads like a project a real developer wrote, so this workflow analyzes the target agent first, then interviews the user in three phases before writing any files.

## Constraints

These apply to every scaffold and shape both the file plan (Step 5) and generation (Step 6):

- Always write the scaffold to `evals/{agent}/scaffolds/{name}/`, relative to the repository root, BECAUSE Skillwalker discovers scaffolds at that path when it builds the Test Sandbox.
- Never write a `.git` directory BECAUSE Skillwalker auto-initializes a git repo with `git init` and commits all scaffold files itself.
- Never write lock files (`package-lock.json`, `Gemfile.lock`, `go.sum`) or dependency directories (`node_modules`, `vendor`, `__pycache__`) unless one is itself a planted signal BECAUSE they add hundreds of generated lines the target agent never inspects and bury the signals that matter.
- Never mark a signal with comments like `BUG HERE` or `INTENTIONAL ISSUE` BECAUSE a signal the agent can find by reading a comment measures nothing about its analysis; signals must require the same work a real codebase would.
- Always keep every file syntactically valid for its language (it should parse or compile apart from intentional logic bugs) BECAUSE a file that fails to parse makes the agent report the syntax error instead of the planted signal.
- In trigger mode, place every cue where Claude can see it before deciding to delegate — `CLAUDE.md` (auto-loaded into context), `README.md`, top-level file and directory names, and files the test prompt names explicitly — BECAUSE an `agent-call` test replaces the agent body with a no-op, so nothing inside the scaffold is ever analyzed; only what is visible before the delegation can move the decision.
- Keep interview turns compact: present the list, then the question. Put explanation in the "Why" line of each signal rather than in surrounding prose.

## Step 1: Parse arguments

Parse the user's input into three parts:

- **`plugin:agent`** (required) — the first token, which contains a colon. Split on the colon to extract the plugin name (before the colon) and the agent name (after the colon).
- **`--for trigger`** (optional flag, anywhere after the first token) — selects trigger mode. Absent means quality mode.
- **Description** (optional) — everything else after the first token. This describes the technology and shape of the scaffold project (e.g., "for a rails 7 project with postgres as the database").

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

**Trigger conditions (trigger mode only)** — From the `description` in the agent's frontmatter, list the "use when" conditions and every "does not … use X" boundary. Then Glob `{plugin}/agents/*.md` and `{plugin}/skills/*/SKILL.md` and read each sibling's `description`; a sibling skill can absorb a request that should have reached the agent just as a sibling agent can. The cues worth planting are the repo facts that make one of those conditions true or false — a `docs/prd.md` for a gap analyzer, a test directory for a test engineer, a `CLAUDE.md` line naming the project's conventions — and the facts that push an ambiguous prompt toward a sibling instead.

**Graceful skip:** If the analysis reveals the agent does not operate on project files — for example, it queries GitHub APIs (`gh` commands), operates on pull request state, or generates content from conversation context rather than analyzing files in a working directory — inform the user that a file scaffold would not be useful for this agent type and stop. Explain what the agent operates on instead. In trigger mode this skip applies only when no repo fact could change the delegation decision either; a `CLAUDE.md` cue can still matter for an agent that otherwise works on external state.

## Step 3: Interview Phase 1 — Analysis and project shape

Present the following in one message:

1. **Mode** — quality or trigger, and what the scaffold is for in that mode
2. **Agent purpose** — a one-sentence summary of what the agent does
3. **Expected inputs** — what file types, config files, and project structure the agent expects to find in a working directory
4. **Signal categories** (quality mode) or **trigger conditions and boundaries** (trigger mode) — the kinds of issues the agent detects, grouped, or the description clauses and sibling boundaries a cue could exercise
5. **Environment requirements** — any specific project conventions the scaffold needs to follow (e.g., needs a Gemfile for Ruby, needs a go.mod for Go)
6. **Existing scaffolds** — use Glob on `evals/{agent}/scaffolds/*/` and list any found by name so the user can avoid duplicating one; if the eval directory does not exist yet, note that it will be created
7. **Proposed project** — if a description was provided in the arguments, restate the tech stack and project shape it implies; otherwise propose one or two options that fit the agent's expected environment from Step 2. In trigger mode a minimal shape is enough; the project only has to look real at a glance.
8. **Proposed scaffold name** — derive it from the description: kebab-case with a `-project` suffix in quality mode (e.g., "rails 7 with postgres" becomes `rails-postgres-project`) or a `-context-project` suffix in trigger mode (e.g., `rails-postgres-context-project`). If `evals/{agent}/scaffolds/{name}/` already exists, say so and ask whether to overwrite it or choose a different name.

Ask the user to confirm or correct the analysis, the tech stack, and the scaffold name in one reply. Wait for their answer, and carry any corrections into the remaining steps.

## Step 4: Interview Phase 2 — Signals or cues to plant

**Quality mode.** Based on the Step 2 analysis, suggest specific signals to plant in the scaffold. Present them as a numbered list where each entry includes:

- **What** — the signal itself (e.g., "SQL injection via string interpolation in a database query")
- **Where** — where it would live in the scaffold (e.g., "in a database access layer module")
- **Why** — why this matters for the target agent (e.g., "the agent specifically checks for parameterized queries vs. string interpolation")

Draw suggestions from the agent definition — what the agent's instructions explicitly check for and what analysis patterns it follows.

**Trigger mode.** Based on the trigger conditions in Step 2, suggest specific context cues. Present them as a numbered list where each entry includes:

- **What** — the cue itself (e.g., "a `docs/prd.md` with three numbered requirements")
- **Where** — the visible location (e.g., "top-level `docs/` directory plus a line in `CLAUDE.md` pointing at it")
- **Direction** — whether the cue's presence should make Claude delegate to the agent, or should make it prefer a sibling or stay silent
- **Why** — which description clause or sibling boundary the cue exercises

One scaffold carries one context. Suggest the cues for the context the user wants first (usually the one that should trigger delegation), and note that the counterpart — the same project with the cues absent or pointing at a sibling — is a second run of this skill.

Present the list and ask the user to:

- Approve the list as-is
- Remove signals that are not relevant to their testing goals
- Modify signals to be more specific to their project context
- Add signals not covered by the analysis

Wait for the user to finalize the list before proceeding.

## Step 5: Interview Phase 3 — File plan

Present a complete file plan as a structured list. For each file include:

- **Path** — relative to the scaffold root directory
- **Description** — what the file contains and its role in the project
- **Signals** — which signals or cues from Step 4 this file carries (reference by number), or "none" for clean files

Design the file plan against these guidelines:

- Include the standard config files for the tech stack (package.json, Gemfile, go.mod, requirements.txt, etc.) BECAUSE the agent uses them to detect the language and framework.
- Keep the plan focused — enough structure to feel like a real project, but only files the agent would actually inspect or that establish necessary context — BECAUSE every extra file costs the eval run tokens without adding signal.
- In quality mode, plan source files at roughly 50-150 lines each BECAUSE shorter files read as stubs and longer ones hide signals in bulk. In trigger mode, files are as short as the cue allows BECAUSE nothing inside them is analyzed.
- In quality mode, spread signals across multiple source files in a realistic directory structure, and include some files with no intentional signals, BECAUSE real projects mix clean and problematic code; an agent shown only problem files is never tested on telling the two apart.

Present the file plan and wait for the user to approve it. The user may request additions, removals, or modifications to the file plan.

## Step 6: Generate scaffold

After the user approves the file plan:

1. Create the directory structure using `mkdir -p evals/{agent}/scaffolds/{name}/` including any subdirectories needed for the planned files.

2. Write each file using the Write tool. For each file, generate realistic content that matches the tech stack and project context, and include its planned signals or cues the way a real developer would have written them — the Constraints above govern what the content may and may not contain.

3. Validate the result by running `${CLAUDE_SKILL_DIR}/scripts/validate-scaffold.sh evals/{agent}/scaffolds/{name}`. It checks the Constraints mechanically and prints one finding per line between `findings-start` and `findings-end` as `{error|warning} {path} {message}`, plus `errors`, `warnings`, and `status`. Fix every `error` (delete the offending file or rewrite it), review each `warning` and fix the ones that are not deliberate, then re-run until `errors: 0`. A syntax error in `package.json` can make every `.js` file fail its check, so fix invalid JSON first. Extensions listed under `syntax-unchecked` had no parser available on this machine; re-read those files yourself for syntax problems. In trigger mode, short-file warnings are expected and stay.

4. Report the outcome: the scaffold path first, then the complete list of files created with their paths relative to the repository root, then any warnings you left in place and why. In trigger mode, add the next step: run `/write-acil-evals {plugin}:{agent}` and name this scaffold for the prompts that depend on it.
