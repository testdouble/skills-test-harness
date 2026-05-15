# Skip Permissions in Test Sandbox

- **Status:** proposed
- **Date Created:** 2026-03-26 08:48
- **Last Updated:** 2026-03-26 08:48
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**

## Context

The test harness runs Claude Code in `--print` mode (non-interactive) inside an isolated Test Sandbox. In this mode, Claude cannot prompt the user for permission approval. When a prompt test invokes a skill via the `Skill` tool, Claude Code denies the call because `Skill` is not in any auto-approved tools list. Claude then falls back to performing the task manually — bypassing the skill entirely — which causes `skill-call` expectations to fail consistently.

This was discovered through the code-review test suite, where the prompt `run a /code-review on lib/example.rb` correctly triggered a `Skill` tool call, but the call returned `is_error: true` with the `Skill` tool listed in `permission_denials`. Claude's thinking confirmed the fallback: "Let me read the file first and then do the code review manually."

The problem affects all prompt-type tests that expect skill invocation, making it impossible to validate that skills are triggered correctly from natural language prompts.

## Decision Drivers

- Tests must run non-interactively — no human is present to approve permission prompts
- The Test Sandbox already provides process and filesystem isolation
- Permission denials are infrastructure artifacts, not skill quality signals — they mask real test results
- The test harness is ephemeral and disposable; it is not a production workload
- Test results must be deterministic and reproducible across runs

## Considered Options

1. **`--allowedTools Skill`** — Add only the `Skill` tool to the auto-approved list via the `--allowedTools` CLI flag.

   - Pro: Minimal permission surface; only approves what's strictly needed for skill invocation
   - Pro: Leaves all other permission checks intact as a safety net
   - Con: May be insufficient — once a skill executes, its body invokes additional tools (`Bash(git *)`, `Read`, `Grep`, `Glob`, `Agent`). While the skill's `allowed-tools` frontmatter should cover these, untested permission interactions could cause silent failures deeper in execution
   - Con: Requires incremental flag additions as new permission issues are discovered, creating ongoing maintenance burden

2. **`--dangerously-skip-permissions`** — Skip all permission checks entirely in the Test Sandbox.

   - Pro: Eliminates the entire class of permission-related test failures
   - Pro: Simple, deterministic, and zero-maintenance — no classifier behavior or incremental flag additions to reason about
   - Pro: The Test Sandbox already provides the isolation boundary that permissions would otherwise enforce
   - Con: No permission guardrails at all within the sandbox; a misbehaving test could modify or delete sandbox contents unchecked
   - Con: The flag name itself signals risk, which could cause concern during code review

3. **Auto mode (`--enable-auto-mode --permission-mode auto`)** — Use Anthropic's ML-based classifiers to auto-approve safe actions and block dangerous ones.

   - Pro: Smart permission handling — the architecturally "correct" solution per [Anthropic's auto mode guidance](https://www.anthropic.com/engineering/claude-code-auto-mode)
   - Pro: Maintains safety boundaries without human intervention
   - Con: Requires a Team plan, which may not be available in all environments
   - Con: Adds classifier latency to every tool call, increasing test run times
   - Con: Classifier behavior can change between Claude Code releases, making test results less deterministic

## Decision

We will use **`--dangerously-skip-permissions`** because the Test Sandbox already provides the isolation boundary that makes permission checks redundant in this context. The test harness exists to evaluate skill quality — not to test Claude Code's permission system. Stripping permissions eliminates an entire class of infrastructure-artifact failures and keeps test results focused on what matters: whether skills trigger correctly and produce quality output.

The flag will be added to the Claude CLI arguments in both the prompt test runner and the skill-call test runner.

## Consequences

**Positive:**

- All permission-denied test failures are eliminated, unblocking skill-call expectation testing for prompt-type tests
- No ongoing maintenance burden from discovering and adding individual tool permissions
- Test results reflect skill behavior rather than permission infrastructure behavior

**Negative:**

- Tests cannot catch cases where a skill requests tools it shouldn't (e.g., a read-only skill attempting writes) — permission violations that would surface in real usage are invisible in the test sandbox
- The flag name may raise questions during code review and requires this ADR as justification

**Neutral:**

- The Test Sandbox isolation model is unchanged — it already prevents test actions from affecting the host system regardless of permission settings

## Notes

**Key files:**

| File | Purpose |
|------|---------|
| `tests/packages/cli/src/test-runners/prompt/index.ts` | Prompt test runner — builds Claude CLI args (lines 74-79) |
| `tests/packages/cli/src/test-runners/skill-call/index.ts` | Skill-call test runner — builds Claude CLI args (lines 77-82) |
| `tests/packages/sandbox-integration/src/sandbox.ts` | Test Sandbox executor — passes args to `sbx exec` |
| `tests/packages/sandbox-integration/sandbox-run.sh` | Shell script inside sandbox that invokes `claude "$@"` |
| `tests/packages/cli/src/commands/sandbox-setup.ts` | Sandbox creation and OAuth setup (delegates to `@testdouble/sandbox-integration`) |

**Related documentation:**

- [Claude Code Auto Mode](https://www.anthropic.com/engineering/claude-code-auto-mode) — Anthropic's guidance on permission handling in automated environments
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) — Full CLI flag documentation including `--dangerously-skip-permissions` and `--allowedTools`
- [Claude Code Permission Modes](https://code.claude.com/docs/en/permission-modes) — Permission mode documentation
- [Sandbox Integration](../sandbox-integration.md) — Full API reference for the sandbox execution package
