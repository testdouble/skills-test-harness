import type { TestExpectation, StreamJsonEvent, ExpectationResult } from '@testdouble/harness-data'
import { getResultText, getSkillInvocations, getAgentInvocations } from '@testdouble/harness-data'

export function evaluateResultContains(value: string, events: StreamJsonEvent[]): boolean {
  const r = getResultText(events)
  if (!r) return false
  return r.includes(value)
}

export function evaluateResultDoesNotContain(value: string, events: StreamJsonEvent[]): boolean {
  const r = getResultText(events)
  if (!r) return false
  return !r.includes(value)
}

export function evaluateSkillCall(skillFile: string, shouldBeCalled: boolean, events: StreamJsonEvent[]): boolean {
  const called = getSkillInvocations(events).includes(skillFile)
  return shouldBeCalled ? called : !called
}

export function evaluateAgentCall(agentFile: string, shouldBeCalled: boolean, events: StreamJsonEvent[]): boolean {
  const called = getAgentInvocations(events).includes(agentFile)
  return shouldBeCalled ? called : !called
}

type EvaluableExpectation = Exclude<TestExpectation, { type: 'llm-judge' }>

export function evaluateExpectation(expectation: EvaluableExpectation, events: StreamJsonEvent[]): ExpectationResult {
  let passed: boolean
  switch (expectation.type) {
    case 'result-contains':
      passed = evaluateResultContains(expectation.value, events)
      break
    case 'result-does-not-contain':
      passed = evaluateResultDoesNotContain(expectation.value, events)
      break
    case 'skill-call':
      passed = evaluateSkillCall(expectation.skillFile, expectation.value, events)
      break
    case 'agent-call':
      passed = evaluateAgentCall(expectation.agentFile, expectation.value, events)
      break
    default: {
      const _exhaustive: never = expectation
      throw new Error(`Unknown expectation type: ${(_exhaustive as any).type}`)
    }
  }
  return { expect_type: expectation.type, expect_value: String(expectation.value), passed }
}

export function evaluateAllExpectations(expectations: TestExpectation[], events: StreamJsonEvent[]): ExpectationResult[] {
  return expectations
    .filter((e): e is EvaluableExpectation => e.type !== 'llm-judge')
    .map(e => evaluateExpectation(e, events))
}
