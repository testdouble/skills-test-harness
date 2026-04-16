import { describe, expect, it } from 'vitest'
import { splitSets } from './scil-split.js'
import type { TestCase } from './types.js'

function makeSkillTest(name: string, triggerValue: boolean): TestCase {
  return {
    name,
    type: 'skill-call',
    promptFile: `${name}.md`,
    expect: [{ type: 'skill-call' as const, value: triggerValue, skillFile: 'p:s' }],
  }
}

function makeAgentTest(name: string, triggerValue: boolean): TestCase {
  return {
    name,
    type: 'agent-call',
    promptFile: `${name}.md`,
    expect: [{ type: 'agent-call' as const, value: triggerValue, agentFile: 'p:a' }],
  }
}

function makeManyTests(positiveCount: number, negativeCount: number): TestCase[] {
  const tests: TestCase[] = []
  for (let i = 0; i < positiveCount; i++) {
    tests.push(makeSkillTest(`pos-${i}`, true))
  }
  for (let i = 0; i < negativeCount; i++) {
    tests.push(makeSkillTest(`neg-${i}`, false))
  }
  return tests
}

describe('splitSets', () => {
  it('assigns all tests to train when holdout is 0', () => {
    const tests = makeManyTests(3, 2)
    const result = splitSets('suite', 'p:s', tests, 0)
    expect(result).toHaveLength(5)
    expect(result.every((t) => t.set === 'train')).toBe(true)
  })

  it('produces identical results for identical inputs (deterministic)', () => {
    const tests = makeManyTests(5, 5)
    const result1 = splitSets('suite', 'p:s', tests, 0.3)
    const result2 = splitSets('suite', 'p:s', tests, 0.3)
    const assignments1 = result1.map((t) => `${t.name}:${t.set}`)
    const assignments2 = result2.map((t) => `${t.name}:${t.set}`)
    expect(assignments1).toEqual(assignments2)
  })

  it('stratifies by expected trigger value', () => {
    const tests = makeManyTests(6, 6)
    const result = splitSets('suite', 'p:s', tests, 0.4)
    const positives = result.filter((t) =>
      t.expect.some((e) => e.type === 'skill-call' && (e as { value: boolean }).value === true),
    )
    const negatives = result.filter((t) =>
      t.expect.some((e) => e.type === 'skill-call' && (e as { value: boolean }).value === false),
    )
    expect(positives.some((t) => t.set === 'train')).toBe(true)
    expect(positives.some((t) => t.set === 'test')).toBe(true)
    expect(negatives.some((t) => t.set === 'train')).toBe(true)
    expect(negatives.some((t) => t.set === 'test')).toBe(true)
  })

  it('assigns single-element groups to train', () => {
    const tests = [makeSkillTest('pos-0', true), makeSkillTest('neg-0', false)]
    const result = splitSets('suite', 'p:s', tests, 0.5)
    expect(result.every((t) => t.set === 'train')).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(splitSets('suite', 'p:s', [], 0.3)).toEqual([])
  })

  it('produces different splits for different suite/entityFile combinations', () => {
    const tests = makeManyTests(10, 0)
    const result1 = splitSets('suite-a', 'p:s', tests, 0.3)
    const result2 = splitSets('suite-b', 'p:s', tests, 0.3)
    const a1 = result1.map((t) => `${t.name}:${t.set}`)
    const a2 = result2.map((t) => `${t.name}:${t.set}`)
    expect(a1).not.toEqual(a2)
  })

  it('produces expected train/test proportions', () => {
    const tests = makeManyTests(10, 0)
    const result = splitSets('suite', 'p:s', tests, 0.2)
    const trainCount = result.filter((t) => t.set === 'train').length
    const testCount = result.filter((t) => t.set === 'test').length
    expect(testCount).toBe(2)
    expect(trainCount).toBe(8)
  })

  describe('agent-call type splitting', () => {
    it('getExpectedTrigger returns correct value for agent-call expectations', () => {
      const positiveTests = [makeAgentTest('agent-pos-0', true), makeAgentTest('agent-pos-1', true)]
      const negativeTests = [makeAgentTest('agent-neg-0', false), makeAgentTest('agent-neg-1', false)]
      const allTests = [...positiveTests, ...negativeTests]
      const result = splitSets('suite', 'p:a', allTests, 0)
      // holdout=0 → all train, but verify all 4 are present (getExpectedTrigger didn't crash)
      expect(result).toHaveLength(4)
      expect(result.every((t) => t.set === 'train')).toBe(true)
    })

    it('produces correct train/test splits for agent-call test cases', () => {
      const tests: TestCase[] = []
      for (let i = 0; i < 6; i++) {
        tests.push(makeAgentTest(`agent-pos-${i}`, true))
      }
      for (let i = 0; i < 6; i++) {
        tests.push(makeAgentTest(`agent-neg-${i}`, false))
      }
      const result = splitSets('suite', 'p:a', tests, 0.4)
      const positives = result.filter((t) =>
        t.expect.some((e) => e.type === 'agent-call' && (e as { value: boolean }).value === true),
      )
      const negatives = result.filter((t) =>
        t.expect.some((e) => e.type === 'agent-call' && (e as { value: boolean }).value === false),
      )
      expect(positives.some((t) => t.set === 'train')).toBe(true)
      expect(positives.some((t) => t.set === 'test')).toBe(true)
      expect(negatives.some((t) => t.set === 'train')).toBe(true)
      expect(negatives.some((t) => t.set === 'test')).toBe(true)
    })

    it('produces deterministic splits for agent-call cases', () => {
      const tests: TestCase[] = []
      for (let i = 0; i < 5; i++) {
        tests.push(makeAgentTest(`agent-pos-${i}`, true))
      }
      for (let i = 0; i < 5; i++) {
        tests.push(makeAgentTest(`agent-neg-${i}`, false))
      }
      const result1 = splitSets('suite', 'p:a', tests, 0.3)
      const result2 = splitSets('suite', 'p:a', tests, 0.3)
      const assignments1 = result1.map((t) => `${t.name}:${t.set}`)
      const assignments2 = result2.map((t) => `${t.name}:${t.set}`)
      expect(assignments1).toEqual(assignments2)
    })
  })

  // TP-001 (T1/EC1): Mixed skill-call and agent-call tests in a single split
  it('stratifies mixed skill-call and agent-call tests together', () => {
    const tests: TestCase[] = [
      makeSkillTest('skill-pos-0', true),
      makeSkillTest('skill-pos-1', true),
      makeSkillTest('skill-pos-2', true),
      makeAgentTest('agent-pos-0', true),
      makeAgentTest('agent-pos-1', true),
      makeAgentTest('agent-pos-2', true),
      makeSkillTest('skill-neg-0', false),
      makeSkillTest('skill-neg-1', false),
      makeSkillTest('skill-neg-2', false),
      makeAgentTest('agent-neg-0', false),
      makeAgentTest('agent-neg-1', false),
      makeAgentTest('agent-neg-2', false),
    ]
    const result = splitSets('suite', 'p:s', tests, 0.4)
    expect(result).toHaveLength(12)
    const positives = result.filter((t) => {
      const e = t.expect[0]
      return (e.type === 'skill-call' || e.type === 'agent-call') && (e as { value: boolean }).value === true
    })
    const negatives = result.filter((t) => {
      const e = t.expect[0]
      return (e.type === 'skill-call' || e.type === 'agent-call') && (e as { value: boolean }).value === false
    })
    expect(positives.some((t) => t.set === 'train')).toBe(true)
    expect(positives.some((t) => t.set === 'test')).toBe(true)
    expect(negatives.some((t) => t.set === 'train')).toBe(true)
    expect(negatives.some((t) => t.set === 'test')).toBe(true)
  })

  // TP-002 (T2): Different entityFile values produce different splits
  it('produces different splits for different entityFile values', () => {
    const tests = makeManyTests(10, 0)
    const result1 = splitSets('suite', 'p:skill-a', tests, 0.3)
    const result2 = splitSets('suite', 'p:skill-b', tests, 0.3)
    const a1 = result1.map((t) => `${t.name}:${t.set}`)
    const a2 = result2.map((t) => `${t.name}:${t.set}`)
    expect(a1).not.toEqual(a2)
  })

  // TP-003 (T8): Multiple expectations — first trigger-type match wins
  it('uses the first skill-call or agent-call expectation for stratification', () => {
    const tests: TestCase[] = [
      {
        name: 'multi-expect',
        type: 'skill-call',
        promptFile: 'test.md',
        expect: [
          { type: 'result-contains' as const, value: 'hello' },
          { type: 'skill-call' as const, value: false, skillFile: 'p:s' },
        ],
      },
      makeSkillTest('pos-0', true),
      makeSkillTest('pos-1', true),
      makeSkillTest('pos-2', true),
    ]
    const result = splitSets('suite', 'p:s', tests, 0.5)
    // multi-expect has skill-call value=false → negative stratum (single element → train)
    const multiExpect = result.find((t) => t.name === 'multi-expect')
    expect(multiExpect).toBeDefined()
    expect(multiExpect?.set).toBe('train')
  })

  // TP-004 (T3): holdout=1.0 preserves at least 1 train per stratum
  it('preserves at least 1 train sample even with holdout=1.0', () => {
    const tests = makeManyTests(4, 4)
    const result = splitSets('suite', 'p:s', tests, 1.0)
    const trainCount = result.filter((t) => t.set === 'train').length
    expect(trainCount).toBeGreaterThanOrEqual(2)
  })

  // TP-005 (T4/EC2): Tests without trigger expectations default to positive stratum
  it('treats tests without skill-call or agent-call expectations as positive', () => {
    const tests: TestCase[] = [
      {
        name: 'no-trigger',
        type: 'skill-call',
        promptFile: 'test.md',
        expect: [{ type: 'result-contains' as const, value: 'hello' }],
      },
      makeSkillTest('neg-0', false),
      makeSkillTest('neg-1', false),
      makeSkillTest('neg-2', false),
    ]
    const result = splitSets('suite', 'p:s', tests, 0.5)
    // no-trigger defaults to positive (single element in positive stratum → train)
    const noTrigger = result.find((t) => t.name === 'no-trigger')
    expect(noTrigger).toBeDefined()
    expect(noTrigger?.set).toBe('train')
  })
})
