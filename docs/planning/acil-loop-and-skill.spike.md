# Spike: Agent Stream Event Discovery

**Date**: 2026-04-02
**PRD**: [acil-loop-and-skill.prd.md](planning/acil-loop-and-skill.prd.md) (Phase 0, Story 1)

## Objective

Capture and document the stream-json event shape when Claude delegates to a custom agent, so that the ACIL harness can implement reliable agent invocation detection.

## Method

Ran Claude CLI with `--output-format stream-json --verbose --print --plugin-dir r-and-d` and a prompt designed to trigger the `gap-analyzer` agent. Captured full stdout and parsed events.

Command:
```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-testdouble" command claude \
  --print --verbose --output-format stream-json \
  --max-turns 3 --plugin-dir r-and-d \
  -p "Compare the current CLAUDE.md file against the docs/skill-building-guidance/ directory to find gaps"
```

## Findings

### 1. Agent Discovery

Custom agents from plugins appear in the `system.init` event's `agents` array using `plugin:agent` format:

```json
{
  "type": "system",
  "subtype": "init",
  "agents": [
    "general-purpose",
    "statusline-setup",
    "Explore",
    "Plan",
    "claude-code-guide",
    "r-and-d:gap-analyzer",
    "r-and-d:structural-analyst",
    "..."
  ]
}
```

Agents are discovered from the `agents/` directory by convention. The `plugin.json` does NOT need an explicit `"agents"` key for discovery to work (though the PRD's temp plugin builder should include one for explicitness).

### 2. Agent Delegation Event Shape

When Claude delegates to a custom agent, the stream produces four event categories:

#### 2a. Assistant tool_use (delegation request)

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_0189f8WHzBQDbnGMggvJYkeu",
        "name": "Agent",
        "input": {
          "subagent_type": "r-and-d:gap-analyzer",
          "description": "Compare CLAUDE.md vs skill-building docs",
          "prompt": "..."
        }
      }
    ]
  }
}
```

Key field: **`input.subagent_type`** contains the `plugin:agent` identifier.

#### 2b. System task_started

```json
{
  "type": "system",
  "subtype": "task_started",
  "task_id": "ae0cc5e57350ea3cb",
  "tool_use_id": "toolu_0189f8WHzBQDbnGMggvJYkeu",
  "task_type": "local_agent"
}
```

#### 2c. System task_progress (repeated during execution)

```json
{
  "type": "system",
  "subtype": "task_progress",
  "task_id": "ae0cc5e57350ea3cb",
  "tool_use_id": "toolu_0189f8WHzBQDbnGMggvJYkeu",
  "description": "Reading CLAUDE.md",
  "last_tool_name": "Read",
  "usage": { "total_tokens": 11509, "tool_uses": 1, "duration_ms": 3013 }
}
```

#### 2d. System task_notification (completion)

```json
{
  "type": "system",
  "subtype": "task_notification",
  "task_id": "ae0cc5e57350ea3cb",
  "tool_use_id": "toolu_0189f8WHzBQDbnGMggvJYkeu",
  "status": "completed",
  "usage": { "total_tokens": 74928, "tool_uses": 30, "duration_ms": 219805 }
}
```

#### 2e. User tool_use_result (agent response returned to parent)

```json
{
  "type": "user",
  "tool_use_result": {
    "status": "completed",
    "agentId": "ae0cc5e57350ea3cb",
    "agentType": "r-and-d:gap-analyzer",
    "totalDurationMs": 219806,
    "totalTokens": 76750,
    "totalToolUseCount": 30,
    "content": [{ "type": "text", "text": "..." }],
    "prompt": "...",
    "usage": { "input_tokens": 1, "output_tokens": 2122, "..." : "..." }
  }
}
```

Key field: **`tool_use_result.agentType`** contains the `plugin:agent` identifier.

### 3. Detection Strategy for `getAgentInvocations()`

Two viable approaches, both produce the `plugin:agent` identifier:

| Approach | Event Type | Field Path | Analogous to |
|----------|-----------|------------|--------------|
| **A (recommended)** | `user` | `tool_use_result.agentType` | `getSkillInvocations` uses `tool_use_result.commandName` |
| B | `assistant` | `message.content[].input.subagent_type` (where `name === "Agent"`) | N/A (different pattern) |

**Recommendation: Approach A** — mirrors the existing `getSkillInvocations` pattern (both look at `user` events with `tool_use_result`).

### 4. Type Changes Required

The `ToolUseResult` interface needs extending:

```typescript
// Current
export interface ToolUseResult {
  commandName?: string
  success:      boolean
}

// Required additions for agent support
export interface ToolUseResult {
  commandName?: string
  success?:     boolean    // Note: agent results don't have success, just status
  agentType?:   string     // e.g. "r-and-d:gap-analyzer"
  agentId?:     string     // task ID for the agent execution
  status?:      string     // "completed" | "failed" etc.
}
```

Key difference from skill results: agent `tool_use_result` objects do NOT have `commandName` or `success` fields. They have `agentType`, `agentId`, `status`, `content`, `totalDurationMs`, `totalTokens`, `totalToolUseCount`, and `usage`.

### 5. Comparison with Skill Invocation Detection

| Aspect | Skill Invocation | Agent Invocation |
|--------|-----------------|------------------|
| Tool name in assistant event | `Skill` | `Agent` |
| Identifier field in tool_use_result | `commandName` | `agentType` |
| Success indicator | `success: true/false` | `status: "completed"/"failed"` |
| Format | `skill-name` | `plugin:agent-name` |
| System events | None | `task_started`, `task_progress`, `task_notification` |

### 6. Plugin Loading for Tests

Use `--plugin-dir <path>` to load a local plugin directory for the session. This is how the ACIL temp plugin builder should load its test plugins:

```bash
claude --print --verbose --output-format stream-json --plugin-dir /tmp/acil-temp-plugin ...
```

## Fixture Data

Minimal fixture events for `stream-parser.test.ts` are saved at:
`tests/packages/test-fixtures/data/agent-stream-events.json`

The full captured stream data is not committed (too large and contains session-specific data).

## Implications for ACIL Implementation

1. **`getAgentInvocations()`** — Filter `user` events where `tool_use_result.agentType` is defined and `tool_use_result.status === "completed"`. Return the `agentType` values.
2. **`ToolUseResult` type** — Must be extended with optional `agentType`, `agentId`, and `status` fields. The `success` field should become optional since agent results don't include it.
3. **Temp plugin builder** — Use `--plugin-dir` to load the temp plugin. Agents directory is discovered by convention.
4. **No changes to `StreamJsonEvent` union needed** — Agent events use existing `UserEvent` type; only `ToolUseResult` needs extending.
