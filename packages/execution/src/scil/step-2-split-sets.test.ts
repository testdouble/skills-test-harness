import type { TestCase } from '@testdouble/harness-data'
import { describe, expect, it } from 'vitest'
import { splitSets } from './step-2-split-sets.js'

function makeTest(name: string, triggerValue: boolean): TestCase {
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
    tests.push(makeTest(`pos-${i}`, true))
  }
  for (let i = 0; i < negativeCount; i++) {
    tests.push(makeTest(`neg-${i}`, false))
  }
  return tests
}

describe('splitSets', () => {
  // TP-011: holdout=0 assigns all tests to train
  it('assigns all tests to train when holdout is 0', () => {
    const tests = makeManyTests(3, 2)
    const result = splitSets('suite', 'p:s', tests, 0)
    expect(result).toHaveLength(5)
    expect(result.every((t) => t.set === 'train')).toBe(true)
  })

  // TP-012: Deterministic splitting — same inputs produce same outputs
  it('produces identical results for identical inputs', () => {
    const tests = makeManyTests(5, 5)
    const result1 = splitSets('suite', 'p:s', tests, 0.3)
    const result2 = splitSets('suite', 'p:s', tests, 0.3)

    const assignments1 = result1.map((t) => `${t.name}:${t.set}`)
    const assignments2 = result2.map((t) => `${t.name}:${t.set}`)
    expect(assignments1).toEqual(assignments2)
  })

  // TP-013: Stratification — positive and negative groups split independently
  it('stratifies by expected trigger value', () => {
    const tests = makeManyTests(6, 6)
    const result = splitSets('suite', 'p:s', tests, 0.4)

    const positives = result.filter((t) =>
      t.expect.some((e) => e.type === 'skill-call' && (e as { value: boolean }).value === true),
    )
    const negatives = result.filter((t) =>
      t.expect.some((e) => e.type === 'skill-call' && (e as { value: boolean }).value === false),
    )

    // Each stratum should have both train and test items
    expect(positives.some((t) => t.set === 'train')).toBe(true)
    expect(positives.some((t) => t.set === 'test')).toBe(true)
    expect(negatives.some((t) => t.set === 'train')).toBe(true)
    expect(negatives.some((t) => t.set === 'test')).toBe(true)
  })

  // TP-014: Single-element group becomes all train
  it('assigns single-element groups to train', () => {
    const tests = [makeTest('pos-0', true), makeTest('neg-0', false)]
    const result = splitSets('suite', 'p:s', tests, 0.5)
    expect(result.every((t) => t.set === 'train')).toBe(true)
  })

  // TP-003: Holdout value of 1.0
  it('preserves at least 1 train sample even with holdout=1.0', () => {
    const tests = makeManyTests(4, 4)
    const result = splitSets('suite', 'p:s', tests, 1.0)

    const trainCount = result.filter((t) => t.set === 'train').length
    // Math.min(testCount, length-1) ensures at least 1 train per stratum
    expect(trainCount).toBeGreaterThanOrEqual(2) // at least 1 per stratum
  })

  // TP-015: Holdout is NaN
  it('handles NaN holdout without crashing', () => {
    const tests = makeManyTests(3, 3)
    // NaN !== 0 so it enters the split path; Math.max(1, NaN) = 1
    const result = splitSets('suite', 'p:s', tests, NaN)
    expect(result).toHaveLength(6)
    expect(result.every((t) => t.set === 'train' || t.set === 'test')).toBe(true)
  })

  // TP-015: Holdout is negative
  it('handles negative holdout without crashing', () => {
    const tests = makeManyTests(3, 3)
    // Math.round(3 * -0.5) = -2, Math.max(1, -2) = 1
    const result = splitSets('suite', 'p:s', tests, -0.5)
    expect(result).toHaveLength(6)
    expect(result.every((t) => t.set === 'train' || t.set === 'test')).toBe(true)
  })

  // TP-016/TP-023: Test with no skill-call expectation defaults to true
  it('treats tests without skill-call expectations as positive', () => {
    const tests: TestCase[] = [
      {
        name: 'no-skill-call',
        type: 'skill-call',
        promptFile: 'test.md',
        expect: [{ type: 'result-contains' as const, value: 'hello' }],
      },
      makeTest('neg-0', false),
      makeTest('neg-1', false),
      makeTest('neg-2', false),
    ]
    const result = splitSets('suite', 'p:s', tests, 0.5)

    // no-skill-call test should be in the positive stratum (single element → train)
    const noSkillCall = result.find((t) => t.name === 'no-skill-call')
    expect(noSkillCall).toBeDefined()
    expect(noSkillCall?.set).toBe('train')
  })

  // TP-017: Empty test array
  it('returns empty array for empty input', () => {
    const result = splitSets('suite', 'p:s', [], 0.3)
    expect(result).toEqual([])
  })

  // TP-020: Empty group (all positive, no negatives) produces correct output
  it('handles all-positive tests with holdout', () => {
    const tests = makeManyTests(6, 0)
    const result = splitSets('suite', 'p:s', tests, 0.3)
    expect(result).toHaveLength(6)
    // Should have both train and test since group is large enough
    expect(result.some((t) => t.set === 'train')).toBe(true)
    expect(result.some((t) => t.set === 'test')).toBe(true)
  })

  // TP-021: Different suite/skill combinations produce different splits
  it('produces different splits for different suite/skill combinations', () => {
    const tests = makeManyTests(10, 0)
    const result1 = splitSets('suite-a', 'p:s', tests, 0.3)
    const result2 = splitSets('suite-b', 'p:s', tests, 0.3)

    const assignments1 = result1.map((t) => `${t.name}:${t.set}`)
    const assignments2 = result2.map((t) => `${t.name}:${t.set}`)
    // With 10 items, probability of identical shuffle is negligible
    expect(assignments1).not.toEqual(assignments2)
  })

  // TP-022: Normal holdout ratio produces expected proportions
  it('produces expected train/test proportions', () => {
    const tests = makeManyTests(10, 0)
    const result = splitSets('suite', 'p:s', tests, 0.2)

    const trainCount = result.filter((t) => t.set === 'train').length
    const testCount = result.filter((t) => t.set === 'test').length
    // Math.round(10 * 0.2) = 2 test, min(2, 9) = 2 test, 8 train
    expect(testCount).toBe(2)
    expect(trainCount).toBe(8)
  })

  // TP-024: All tests same trigger value works without error
  it('handles all-negative tests with holdout', () => {
    const tests = makeManyTests(0, 6)
    const result = splitSets('suite', 'p:s', tests, 0.3)
    expect(result).toHaveLength(6)
    expect(result.some((t) => t.set === 'train')).toBe(true)
    expect(result.some((t) => t.set === 'test')).toBe(true)
  })

  describe('agent-call type splitting', () => {
    it('getExpectedTrigger handles agent-call expectations', () => {
      const tests: TestCase[] = [
        makeAgentTest('agent-pos-0', true),
        makeAgentTest('agent-pos-1', true),
        makeAgentTest('agent-neg-0', false),
        makeAgentTest('agent-neg-1', false),
      ]
      const result = splitSets('suite', 'p:a', tests, 0)
      expect(result).toHaveLength(4)
      expect(result.every((t) => t.set === 'train')).toBe(true)
    })

    it('stratifies agent-call tests by expected trigger value', () => {
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
      expect(result1.map((t) => `${t.name}:${t.set}`)).toEqual(result2.map((t) => `${t.name}:${t.set}`))
    })
  })

  // TP-001 (T1/EC1): Mixed skill-call and agent-call tests stratified together
  it('stratifies mixed skill-call and agent-call tests together', () => {
    const tests: TestCase[] = [
      makeTest('skill-pos-0', true),
      makeTest('skill-pos-1', true),
      makeTest('skill-pos-2', true),
      makeAgentTest('agent-pos-0', true),
      makeAgentTest('agent-pos-1', true),
      makeAgentTest('agent-pos-2', true),
      makeTest('skill-neg-0', false),
      makeTest('skill-neg-1', false),
      makeTest('skill-neg-2', false),
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
})
