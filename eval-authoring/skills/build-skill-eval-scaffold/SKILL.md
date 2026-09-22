---
name: build-skill-eval-scaffold
description: "Creates a realistic project scaffold — a test fixture — for evaluating a Claude Code skill. By default the scaffold carries planted signals the skill should find, for rubric-based skill-prompt tests; with --for trigger it carries the repo context cues that decide whether the skill should fire, for skill-call tests. Analyzes the target skill's SKILL.md, references, and dispatched agent definitions, then interviews the user in three phases (technology and shape, signals or cues to plant, file plan) before writing the scaffold to tests/test-suites/{skill}/scaffolds/{name}/. Use when creating, building, or setting up a test scaffold, fixture project, or sample codebase for a skill eval. Does not create tests.json entries or rubric files — use write-scil-evals or write-skill-eval-rubric. Does not create agent scaffolds — use build-agent-eval-scaffold."
argument-hint: "[plugin:skill] [optional description] [--for trigger] e.g. example-plugin:code-review for a rails 7 project with postgres"
allowed-tools: Read, Write, Glob, Grep, Bash(mkdir *)
---

Build a realistic project fixture Skillwalker runs the target skill against. In **quality mode** (the default) the fixture holds signals the skill is designed to find, so an LLM judge can score the skill's output against a rubric. In **trigger mode** (`--for trigger`) the fixture holds the repository context that decides whether the skill should fire at all, so a `skill-call` test can measure trigger accuracy on prompts that depend on repo state. Either way the fixture only works when it reads like a project a real developer wrote, so this workflow analyzes the target skill first, then interviews the user in three phases before writing any files.

## Constraints

These apply to every scaffold and shape both the file plan (Step 5) and generation (Step 6):

- Always write the scaffold to `tests/test-suites/{skill}/scaffolds/{name}/`, relative to the repository root, BECAUSE Skillwalker discovers scaffolds at that path when it builds the Test Sandbox.
- Never write a `.git` directory BECAUSE Skillwalker auto-initializes a git repo with `git init` and commits all scaffold files itself.
- Never write lock files (`package-lock.json`, `Gemfile.lock`, `go.sum`) or dependency directories (`node_modules`, `vendor`, `__pycache__`) unless one is itself a planted signal BECAUSE they add hundreds of generated lines the target skill never inspects and bury the signals that matter.
- Never mark a signal with comments like `BUG HERE` or `INTENTIONAL ISSUE` BECAUSE a signal the skill can find by reading a comment measures nothing about its analysis; signals must require the same work a real codebase would.
- Always keep every file syntactically valid for its language (it should parse or compile apart from intentional logic bugs) BECAUSE a file that fails to parse makes the skill report the syntax error instead of the planted signal.
- In trigger mode, place every cue where Claude can see it before deciding to call the skill — `CLAUDE.md` (auto-loaded into context), `README.md`, top-level file and directory names, and files the test prompt names explicitly — BECAUSE a `skill-call` test replaces the skill body with a no-op, so nothing inside the scaffold is ever analyzed; only what is visible before the call can move the decision.
- Keep interview turns compact: present the list, then the question. Put explanation in the "Why" line of each signal rather than in surrounding prose.

## Step 1: Parse arguments

Parse the user's input into three parts:

- **`plugin:skill`** (required) — the first token, which contains a colon. Split on the colon to extract the plugin name (before the colon) and the skill name (after the colon).
- **`--for trigger`** (optional flag, anywhere after the first token) — selects trigger mode. Absent means quality mode.
- **Description** (optional) — everything else after the first token. This describes the technology and shape of the scaffold project (e.g., "for a rails 7 project with postgres as the database").

If no argument was provided, or the first token contains no colon, ask the user which `plugin:skill` to create a scaffold for and stop until they answer.

Collect the target's inputs by running `${CLAUDE_SKILL_DIR}/scripts/collect-target-inputs.sh {plugin} {skill}` from the repository root. It prints `status`, the `skill-file` path, the reference files between `reference-files-start` and `reference-files-end` (or `reference-files: none`), and one line per dispatched agent between `agents-start` and `agents-end` (or `agents: none`) in the form `{agent-plugin}:{agent} {path} {found|missing}`. If it reports `status: error`, show the `reason` to the user and ask them to correct the input.

## Step 2: Analyze target skill

Read three categories of material listed by the script to understand what the scaffold needs to provide:

**2a. SKILL.md** — Read the `skill-file`. Analyze the full body to identify:

- What inputs and environment the skill expects (source code files, config files, documentation, specific project structure)
- What outputs the skill produces (code reviews, coding standards, ADRs, test plans, documentation)
- What signals the skill looks for (bugs, security flaws, architectural patterns, missing documentation, coding style issues)
- What tools the skill uses (Read, Glob, Grep, Bash commands — these reveal what file types and patterns the skill inspects)
- Whether the skill operates on project files at all, or whether it operates on external state (GitHub PRs, CI pipelines, conversation context)

**2b. References** — Read every file listed between `reference-files-start` and `reference-files-end`. Reference files contain templates, checklists, and domain knowledge that reveal what the skill checks for in detail. These are critical for understanding the specific signals the scaffold should contain.

**2c. Agents** — Read the `{path}` of every agent line marked `found`. The script already resolved each `subagent_type` value to the plugin that defines the agent, which is often not the target skill's plugin. Agent definitions describe specific analysis focuses (structural coupling, security vulnerabilities, concurrency patterns, etc.) that inform what signals should be planted in the scaffold. Carry any agent marked `missing` into the Step 3 summary and continue with what was found.

**2d. Trigger conditions (trigger mode only)** — From the `description` in the skill-file's frontmatter, list the "use when" conditions and every "does not … use X" boundary. Then Glob `{plugin}/skills/*/SKILL.md` and read each sibling's `description`. The cues worth planting are the repo facts that make one of those conditions true or false — a `docs/adr/` directory for an ADR skill, a failing spec for an investigation skill, a `CLAUDE.md` line naming the project's review conventions — and the facts that push an ambiguous prompt toward a sibling instead.

**Graceful skip:** If the analysis reveals the skill does not operate on project files — for example, it queries GitHub APIs (`gh` commands), operates on pull request state, or generates content from conversation context rather than analyzing files in a working directory — inform the user that a file scaffold would not be useful for this skill type and stop. Explain what the skill operates on instead. In trigger mode this skip applies only when no repo fact could change the trigger decision either; a `CLAUDE.md` cue can still matter for a skill that otherwise works on external state.

## Step 3: Interview Phase 1 — Analysis and project shape

Present the following in one message:

1. **Mode** — quality or trigger, and what the scaffold is for in that mode
2. **Skill purpose** — a one-sentence summary of what the skill does
3. **Expected inputs** — what file types, config files, and project structure the skill expects to find in a working directory
4. **Signal categories** (quality mode) or **trigger conditions and boundaries** (trigger mode) — the kinds of issues the skill detects, grouped, or the description clauses and sibling boundaries a cue could exercise
5. **Environment requirements** — any specific project conventions the scaffold needs to follow (e.g., needs a Gemfile for Ruby, needs a go.mod for Go)
6. **Existing scaffolds** — use Glob on `tests/test-suites/{skill}/scaffolds/*/` and list any found by name so the user can avoid duplicating one; if the suite directory does not exist yet, note that it will be created
7. **Proposed project** — if a description was provided in the arguments, restate the tech stack and project shape it implies; otherwise propose one or two options that fit the skill's expected environment from Step 2. In trigger mode a minimal shape is enough; the project only has to look real at a glance.
8. **Proposed scaffold name** — derive it from the description: kebab-case with a `-project` suffix in quality mode (e.g., "rails 7 with postgres" becomes `rails-postgres-project`) or a `-context-project` suffix in trigger mode (e.g., `rails-postgres-context-project`). If `tests/test-suites/{skill}/scaffolds/{name}/` already exists, say so and ask whether to overwrite it or choose a different name.

Ask the user to confirm or correct the analysis, the tech stack, and the scaffold name in one reply. Wait for their answer, and carry any corrections into the remaining steps.

## Step 4: Interview Phase 2 — Signals or cues to plant

**Quality mode.** Based on the Step 2 analysis, suggest specific signals to plant in the scaffold. Present them as a numbered list where each entry includes:

- **What** — the signal itself (e.g., "SQL injection via string interpolation in a database query")
- **Where** — where it would live in the scaffold (e.g., "in a database access layer module")
- **Why** — why this matters for the target skill (e.g., "the security analysis agent specifically checks for parameterized queries vs. string interpolation")

Draw suggestions from all three analysis sources:

- SKILL.md body — what the skill's steps explicitly check for
- Reference files — what templates and checklists define as criteria
- Agent definitions — what each agent's analysis focus covers

**Trigger mode.** Based on Step 2d, suggest specific context cues. Present them as a numbered list where each entry includes:

- **What** — the cue itself (e.g., "a `docs/adr/` directory holding two accepted ADRs")
- **Where** — the visible location (e.g., "top-level directory name plus a line in `CLAUDE.md` pointing at it")
- **Direction** — whether the cue's presence should make the skill fire, or should make it defer to a sibling or stay silent
- **Why** — which description clause or sibling boundary the cue exercises

One scaffold carries one context. Suggest the cues for the context the user wants first (usually the one that should make the skill fire), and note that the counterpart — the same project with the cues absent or pointing at a sibling — is a second run of this skill.

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

- Include the standard config files for the tech stack (package.json, Gemfile, go.mod, requirements.txt, etc.) BECAUSE the skill and its agents use them to detect the language and framework.
- Keep the plan focused — enough structure to feel like a real project, but only files the skill would actually inspect or that establish necessary context — BECAUSE every extra file costs the eval run tokens without adding signal.
- In quality mode, plan source files at roughly 50-150 lines each BECAUSE shorter files read as stubs and longer ones hide signals in bulk. In trigger mode, files are as short as the cue allows BECAUSE nothing inside them is analyzed.
- In quality mode, spread signals across multiple source files in a realistic directory structure, and include some files with no intentional signals, BECAUSE real projects mix clean and problematic code; a skill shown only problem files is never tested on telling the two apart.

Present the file plan and wait for the user to approve it. The user may request additions, removals, or modifications to the file plan.

## Step 6: Generate scaffold

After the user approves the file plan:

1. Create the directory structure using `mkdir -p tests/test-suites/{skill}/scaffolds/{name}/` including any subdirectories needed for the planned files.

2. Write each file using the Write tool. For each file, generate realistic content that matches the tech stack and project context, and include its planned signals or cues the way a real developer would have written them — the Constraints above govern what the content may and may not contain.

3. Validate the result by running `${CLAUDE_SKILL_DIR}/scripts/validate-scaffold.sh tests/test-suites/{skill}/scaffolds/{name}`. It checks the Constraints mechanically and prints one finding per line between `findings-start` and `findings-end` as `{error|warning} {path} {message}`, plus `errors`, `warnings`, and `status`. Fix every `error` (delete the offending file or rewrite it), review each `warning` and fix the ones that are not deliberate, then re-run until `errors: 0`. A syntax error in `package.json` can make every `.js` file fail its check, so fix invalid JSON first. Extensions listed under `syntax-unchecked` had no parser available on this machine; re-read those files yourself for syntax problems. In trigger mode, short-file warnings are expected and stay.

4. Report the outcome: the scaffold path first, then the complete list of files created with their paths relative to the repository root, then any warnings you left in place and why. In trigger mode, add the next step: run `/write-scil-evals {plugin}:{skill}` and name this scaffold for the prompts that depend on it.
