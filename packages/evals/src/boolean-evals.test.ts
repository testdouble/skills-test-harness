import { describe, it, expect } from 'vitest'
import {
  evaluateResultContains,
  evaluateResultDoesNotContain,
  evaluateSkillCall,
  evaluateAgentCall,
  evaluateExpectation,
  evaluateAllExpectations,
} from './boolean-evals.js'
import type { StreamJsonEvent, TestExpectation } from '@testdouble/harness-data'

const resultEvent = (text: string): StreamJsonEvent => ({ type: 'result', result: text })
const skillEvent = (name: string): StreamJsonEvent => ({
  type: 'user',
  tool_use_result: { commandName: name, success: true },
})
const agentEvent = (agentType: string): StreamJsonEvent => ({
  type: 'user',
  tool_use_result: { agentType, agentId: 'test-id', status: 'completed' },
})
const noEvents: StreamJsonEvent[] = []

describe('evaluateResultContains', () => {
  it('returns true when result includes value', () => {
    expect(evaluateResultContains('hello', [resultEvent('say hello world')])).toBe(true)
  })

  it('returns false when result does not include value', () => {
    expect(evaluateResultContains('missing', [resultEvent('say hello world')])).toBe(false)
  })

  it('returns false when no result event exists', () => {
    expect(evaluateResultContains('hello', noEvents)).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(evaluateResultContains('Hello', [resultEvent('hello')])).toBe(false)
  })
})

describe('evaluateResultDoesNotContain', () => {
  it('returns true when result does not include value', () => {
    expect(evaluateResultDoesNotContain('absent', [resultEvent('present')])).toBe(true)
  })

  it('returns false when result includes value', () => {
    expect(evaluateResultDoesNotContain('present', [resultEvent('present')])).toBe(false)
  })

  it('returns false when no result event exists', () => {
    expect(evaluateResultDoesNotContain('anything', noEvents)).toBe(false)
  })
})

describe('evaluateSkillCall', () => {
  it('returns true when skill was invoked and shouldBeCalled is true', () => {
    expect(evaluateSkillCall('my-skill', true, [skillEvent('my-skill')])).toBe(true)
  })

  it('returns false when skill was not invoked and shouldBeCalled is true', () => {
    expect(evaluateSkillCall('my-skill', true, [skillEvent('other-skill')])).toBe(false)
  })

  it('returns true when skill was not invoked and shouldBeCalled is false', () => {
    expect(evaluateSkillCall('my-skill', false, [skillEvent('other-skill')])).toBe(true)
  })

  it('returns false when skill was invoked and shouldBeCalled is false', () => {
    expect(evaluateSkillCall('my-skill', false, [skillEvent('my-skill')])).toBe(false)
  })

  it('returns false for empty events when shouldBeCalled is true', () => {
    expect(evaluateSkillCall('my-skill', true, noEvents)).toBe(false)
  })

  it('returns true for empty events when shouldBeCalled is false', () => {
    expect(evaluateSkillCall('my-skill', false, noEvents)).toBe(true)
  })
})

describe('evaluateAgentCall', () => {
  it('returns true when agent was invoked and shouldBeCalled is true', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', true, [agentEvent('r-and-d:gap-analyzer')])).toBe(true)
  })

  it('returns false when agent was not invoked and shouldBeCalled is true', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', true, [agentEvent('r-and-d:other')])).toBe(false)
  })

  it('returns true when agent was not invoked and shouldBeCalled is false', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', false, [agentEvent('r-and-d:other')])).toBe(true)
  })

  it('returns false when agent was invoked and shouldBeCalled is false', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', false, [agentEvent('r-and-d:gap-analyzer')])).toBe(false)
  })

  it('returns false for empty events when shouldBeCalled is true', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', true, noEvents)).toBe(false)
  })

  it('returns true for empty events when shouldBeCalled is false', () => {
    expect(evaluateAgentCall('r-and-d:gap-analyzer', false, noEvents)).toBe(true)
  })
})

describe('evaluateExpectation', () => {
  it('handles result-contains type', () => {
    const result = evaluateExpectation(
      { type: 'result-contains', value: 'hello' },
      [resultEvent('say hello')]
    )
    expect(result).toEqual({ expect_type: 'result-contains', expect_value: 'hello', passed: true })
  })

  it('handles result-does-not-contain type', () => {
    const result = evaluateExpectation(
      { type: 'result-does-not-contain', value: 'goodbye' },
      [resultEvent('say hello')]
    )
    expect(result).toEqual({ expect_type: 'result-does-not-contain', expect_value: 'goodbye', passed: true })
  })

  it('handles skill-call type when skill was called and value is true', () => {
    const result = evaluateExpectation(
      { type: 'skill-call', value: true, skillFile: 'my-skill' },
      [skillEvent('my-skill')]
    )
    expect(result).toEqual({ expect_type: 'skill-call', expect_value: 'true', passed: true })
  })

  it('handles skill-call type when skill was not called and value is false', () => {
    const result = evaluateExpectation(
      { type: 'skill-call', value: false, skillFile: 'my-skill' },
      [skillEvent('other-skill')]
    )
    expect(result).toEqual({ expect_type: 'skill-call', expect_value: 'false', passed: true })
  })

  it('handles agent-call type when agent was called and value is true', () => {
    const result = evaluateExpectation(
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
      [agentEvent('r-and-d:gap-analyzer')]
    )
    expect(result).toEqual({ expect_type: 'agent-call', expect_value: 'true', passed: true })
  })

  it('handles agent-call type when agent was not called and value is false', () => {
    const result = evaluateExpectation(
      { type: 'agent-call', value: false, agentFile: 'r-and-d:gap-analyzer' },
      [agentEvent('r-and-d:other')]
    )
    expect(result).toEqual({ expect_type: 'agent-call', expect_value: 'false', passed: true })
  })

  it('returns passed: false when expectation fails', () => {
    const result = evaluateExpectation(
      { type: 'result-contains', value: 'missing' },
      [resultEvent('present')]
    )
    expect(result.passed).toBe(false)
  })
})

describe('evaluateAllExpectations', () => {
  it('evaluates all expectations and returns results', () => {
    const events: StreamJsonEvent[] = [resultEvent('hello world'), skillEvent('some-skill')]
    const expectations = [
      { type: 'result-contains' as const, value: 'hello' },
      { type: 'skill-call' as const, value: true, skillFile: 'some-skill' },
      { type: 'result-contains' as const, value: 'missing' },
    ]
    const results = evaluateAllExpectations(expectations, events)
    expect(results).toHaveLength(3)
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(true)
    expect(results[2].passed).toBe(false)
  })

  it('returns empty array for empty expectations', () => {
    expect(evaluateAllExpectations([], [resultEvent('x')])).toEqual([])
  })

  it('evaluates agent-call expectations alongside other types', () => {
    const events: StreamJsonEvent[] = [
      resultEvent('hello world'),
      skillEvent('some-skill'),
      agentEvent('r-and-d:gap-analyzer'),
    ]
    const expectations: TestExpectation[] = [
      { type: 'result-contains', value: 'hello' },
      { type: 'skill-call', value: true, skillFile: 'some-skill' },
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
    ]
    const results = evaluateAllExpectations(expectations, events)
    expect(results).toHaveLength(3)
    expect(results[2]).toEqual({ expect_type: 'agent-call', expect_value: 'true', passed: true })
  })

  it('filters out llm-judge expectations', () => {
    const expectations: TestExpectation[] = [
      { type: 'result-contains', value: 'hello' },
      { type: 'llm-judge', rubricFile: 'test.md' },
    ]
    const results = evaluateAllExpectations(expectations, [resultEvent('hello world')])
    expect(results).toHaveLength(1)
    expect(results[0].expect_type).toBe('result-contains')
  })
})
