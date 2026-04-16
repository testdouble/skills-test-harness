import { describe, it, expect } from 'vitest'
import {
  parseStreamJsonLines,
  getResultText,
  getSkillInvocations,
  getAgentInvocations,
  extractMetrics,
} from './stream-parser.js'
import type { StreamJsonEvent } from './types.js'

describe('parseStreamJsonLines', () => {
  it('parses multiple JSON lines', () => {
    const raw = '{"type":"system","subtype":"init","session_id":"abc"}\n{"type":"result","result":"done"}\n'
    const events = parseStreamJsonLines(raw)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'system', subtype: 'init' })
    expect(events[1]).toMatchObject({ type: 'result', result: 'done' })
  })

  it('ignores blank lines', () => {
    const raw = '{"type":"result","result":"ok"}\n\n   \n'
    expect(parseStreamJsonLines(raw)).toHaveLength(1)
  })

  it('returns empty array for empty string', () => {
    expect(parseStreamJsonLines('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseStreamJsonLines('   \n  \n')).toEqual([])
  })

  it('skips non-JSON lines like plain text output', () => {
    const raw = '{"type":"result","result":"done"}\nError response from daemon\n'
    const events = parseStreamJsonLines(raw)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'result', result: 'done' })
  })

  it('skips initialization messages before JSON stream begins', () => {
    const raw = 'Initialized session abc123\n{"type":"system","subtype":"init","session_id":"abc"}\n{"type":"result","result":"ok"}\n'
    const events = parseStreamJsonLines(raw)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'system', subtype: 'init' })
    expect(events[1]).toMatchObject({ type: 'result', result: 'ok' })
  })

  it('throws on malformed JSON that starts with {', () => {
    const raw = '{"type":"result","result":"ok"}\n{"truncated\n'
    expect(() => parseStreamJsonLines(raw)).toThrow()
  })

  it('skips multiple non-JSON lines interspersed with JSON', () => {
    const raw = 'Starting up...\n{"type":"system","subtype":"init","session_id":"x"}\nsome warning\n{"type":"result","result":"done"}\ncleanup complete\n'
    const events = parseStreamJsonLines(raw)
    expect(events).toHaveLength(2)
  })
})

describe('getResultText', () => {
  it('returns the result string from the result event', () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'x' },
      { type: 'result', result: 'the answer' },
    ]
    expect(getResultText(events)).toBe('the answer')
  })

  it('returns null when there is no result event', () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'x' },
    ]
    expect(getResultText(events)).toBeNull()
  })

  it('returns null when result event has no result field', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result' },
    ]
    expect(getResultText(events)).toBeNull()
  })

  it('returns null for empty events array', () => {
    expect(getResultText([])).toBeNull()
  })
})

describe('getSkillInvocations', () => {
  it('returns skill names from successful user tool_use_result events', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { commandName: 'my-skill', success: true },
      },
    ]
    expect(getSkillInvocations(events)).toEqual(['my-skill'])
  })

  it('excludes failed tool_use_result events', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { commandName: 'failing-skill', success: false },
      },
    ]
    expect(getSkillInvocations(events)).toEqual([])
  })

  it('excludes user events with no commandName', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { success: true },
      },
    ]
    expect(getSkillInvocations(events)).toEqual([])
  })

  it('excludes non-user events', () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'x' },
      { type: 'result', result: 'done' },
    ]
    expect(getSkillInvocations(events)).toEqual([])
  })

  it('returns multiple skill names in order', () => {
    const events: StreamJsonEvent[] = [
      { type: 'user', tool_use_result: { commandName: 'skill-a', success: true } },
      { type: 'user', tool_use_result: { commandName: 'skill-b', success: true } },
    ]
    expect(getSkillInvocations(events)).toEqual(['skill-a', 'skill-b'])
  })

  it('returns empty array for empty events', () => {
    expect(getSkillInvocations([])).toEqual([])
  })
})

describe('getAgentInvocations', () => {
  it('returns agent types from completed user tool_use_result events', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { agentType: 'r-and-d:gap-analyzer', agentId: 'ae0cc5e57350ea3cb', status: 'completed' },
      },
    ]
    expect(getAgentInvocations(events)).toEqual(['r-and-d:gap-analyzer'])
  })

  it('excludes non-completed agent tool_use_result events', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { agentType: 'r-and-d:gap-analyzer', agentId: 'ae0cc5e57350ea3cb', status: 'failed' },
      },
    ]
    expect(getAgentInvocations(events)).toEqual([])
  })

  it('excludes skill events (commandName-based)', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { commandName: 'r-and-d:code-review', success: true },
      },
    ]
    expect(getAgentInvocations(events)).toEqual([])
  })

  it('excludes non-user events', () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'x' },
      { type: 'result', result: 'done' },
    ]
    expect(getAgentInvocations(events)).toEqual([])
  })

  it('returns multiple agent types in order', () => {
    const events: StreamJsonEvent[] = [
      { type: 'user', tool_use_result: { agentType: 'r-and-d:gap-analyzer', agentId: 'a1', status: 'completed' } },
      { type: 'user', tool_use_result: { agentType: 'r-and-d:code-review', agentId: 'a2', status: 'completed' } },
    ]
    expect(getAgentInvocations(events)).toEqual(['r-and-d:gap-analyzer', 'r-and-d:code-review'])
  })

  it('excludes events with status=completed but no agentType', () => {
    const events: StreamJsonEvent[] = [
      {
        type: 'user',
        tool_use_result: { status: 'completed' },
      },
    ]
    expect(getAgentInvocations(events)).toEqual([])
  })

  it('returns empty array for empty events', () => {
    expect(getAgentInvocations([])).toEqual([])
  })
})

describe('extractMetrics', () => {
  it('sums duration_ms across result events', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result', duration_ms: 1000 },
      { type: 'result', duration_ms: 500 },
    ]
    const metrics = extractMetrics(events)
    expect(metrics.durationMs).toBe(1500)
  })

  it('sums input_tokens from assistant message.usage', () => {
    const events: StreamJsonEvent[] = [
      { type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: 'assistant', message: { usage: { input_tokens: 200, output_tokens: 75 } } },
    ]
    const metrics = extractMetrics(events)
    expect(metrics.inputTokens).toBe(300)
    expect(metrics.outputTokens).toBe(125)
  })

  it('sums input_tokens from result event usage', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result', usage: { input_tokens: 400, output_tokens: 200 }, result: 'done' },
    ]
    const metrics = extractMetrics(events)
    expect(metrics.inputTokens).toBe(400)
    expect(metrics.outputTokens).toBe(200)
  })

  it('sets isError true when any result event has is_error=true', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result', is_error: true },
    ]
    expect(extractMetrics(events).isError).toBe(true)
  })

  it('sets isError false when no result event has is_error', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result', result: 'ok' },
    ]
    expect(extractMetrics(events).isError).toBe(false)
  })

  it('captures result text', () => {
    const events: StreamJsonEvent[] = [
      { type: 'result', result: 'final answer' },
    ]
    expect(extractMetrics(events).result).toBe('final answer')
  })

  it('returns zero metrics for empty events', () => {
    const metrics = extractMetrics([])
    expect(metrics).toEqual({ durationMs: 0, inputTokens: 0, outputTokens: 0, isError: false, result: null })
  })

  it('sums tokens from both assistant and result events in the same stream', () => {
    const events: StreamJsonEvent[] = [
      { type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: 'result', usage: { input_tokens: 400, output_tokens: 200 }, result: 'done' },
    ]
    const metrics = extractMetrics(events)
    expect(metrics.inputTokens).toBe(500)
    expect(metrics.outputTokens).toBe(250)
  })

  it('handles events with no usage gracefully', () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'x' },
    ]
    const metrics = extractMetrics(events)
    expect(metrics.inputTokens).toBe(0)
    expect(metrics.outputTokens).toBe(0)
  })
})
