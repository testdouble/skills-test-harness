import { describe, it, expect } from 'vitest'
import type { QueryResult, IterationResult } from './types.js'
import { scoreResults, selectBestIteration } from './step-6-score.js'

function makeResult(passed: boolean): QueryResult {
  return {
    testName: 'test',
    skillFile: 'p:s',
    expected: true,
    actual: passed,
    passed,
    promptContent: 'test prompt',
    runIndex: 0,
    events: []
  }
}

function makeIteration(
  iteration: number,
  trainAccuracy: number,
  testAccuracy: number | null
): IterationResult {
  return {
    iteration,
    description: `iteration ${iteration}`,
    trainResults: [],
    testResults: [],
    trainAccuracy,
    testAccuracy
  }
}

describe('scoreResults', () => {
  // TP-015: all pass → trainAccuracy=1
  it('returns trainAccuracy=1 when all train results pass', () => {
    const { trainAccuracy, testAccuracy } = scoreResults(
      [makeResult(true), makeResult(true), makeResult(true)],
      []
    )
    expect(trainAccuracy).toBe(1)
    expect(testAccuracy).toBeNull()
  })

  // TP-016: empty train → 0
  it('returns trainAccuracy=0 for empty train results', () => {
    const { trainAccuracy } = scoreResults([], [makeResult(true)])
    expect(trainAccuracy).toBe(0)
  })

  // TP-017: empty test → null
  it('returns testAccuracy=null for empty test results', () => {
    const { testAccuracy } = scoreResults([makeResult(true)], [])
    expect(testAccuracy).toBeNull()
  })

  // TP-018: mixed results compute correct fractions
  it('computes correct fractions for mixed pass/fail', () => {
    const train = [makeResult(true), makeResult(true), makeResult(false)]
    const test = [makeResult(true), makeResult(false), makeResult(false), makeResult(false)]
    const { trainAccuracy, testAccuracy } = scoreResults(train, test)
    expect(trainAccuracy).toBeCloseTo(2 / 3)
    expect(testAccuracy).toBe(0.25)
  })

  // TP-016+017: both empty
  it('returns 0 and null when both arrays are empty', () => {
    const { trainAccuracy, testAccuracy } = scoreResults([], [])
    expect(trainAccuracy).toBe(0)
    expect(testAccuracy).toBeNull()
  })
})

describe('selectBestIteration', () => {
  // TP-019: empty iterations → null
  it('returns null for empty iterations', () => {
    expect(selectBestIteration([], 0)).toBeNull()
    expect(selectBestIteration([], 0.3)).toBeNull()
  })

  // TP-020: single iteration returns it
  it('returns the single iteration', () => {
    const iter = makeIteration(1, 0.5, 0.3)
    expect(selectBestIteration([iter], 0.3)).toBe(iter)
  })

  // TP-004: uses testAccuracy when holdout > 0
  it('selects by testAccuracy when holdout > 0', () => {
    const iterations = [
      makeIteration(1, 0.9, 0.3),
      makeIteration(2, 0.5, 0.8),
      makeIteration(3, 0.7, 0.6)
    ]
    const best = selectBestIteration(iterations, 0.3)
    expect(best!.iteration).toBe(2)
  })

  // TP-005: uses trainAccuracy when holdout = 0
  it('selects by trainAccuracy when holdout is 0', () => {
    const iterations = [
      makeIteration(1, 0.3, 0.9),
      makeIteration(2, 0.8, 0.1),
      makeIteration(3, 0.6, 0.5)
    ]
    const best = selectBestIteration(iterations, 0)
    expect(best!.iteration).toBe(2)
  })

  // TP-006: tie-breaking favors earlier iteration
  it('favors earlier iteration on tie', () => {
    const iterations = [
      makeIteration(1, 0.7, null),
      makeIteration(2, 0.7, null),
      makeIteration(3, 0.7, null)
    ]
    const best = selectBestIteration(iterations, 0)
    expect(best!.iteration).toBe(1)
  })

  // TP-021: null testAccuracy treated as 0
  it('treats null testAccuracy as 0', () => {
    const iterations = [
      makeIteration(1, 0.9, null),
      makeIteration(2, 0.5, 0.5)
    ]
    const best = selectBestIteration(iterations, 0.3)
    expect(best!.iteration).toBe(2)
  })

  // TP-014: all null testAccuracy with holdout > 0 → best train wins
  it('returns iteration with best train accuracy when all testAccuracy are null and holdout > 0', () => {
    const iterations = [
      makeIteration(1, 0.3, null),
      makeIteration(2, 0.9, null),
      makeIteration(3, 0.7, null)
    ]
    const best = selectBestIteration(iterations, 0.5)
    expect(best!.iteration).toBe(2)
  })

  // Tiebreaker: equal test accuracy, different train accuracy → higher train wins
  it('uses train accuracy as tiebreaker when test scores are equal', () => {
    const iterations = [
      makeIteration(1, 0.5, 0.5),
      makeIteration(2, 1.0, 0.5)
    ]
    const best = selectBestIteration(iterations, 0.5)
    expect(best!.iteration).toBe(2)
  })

  // Tiebreaker: equal test AND train accuracy → earlier iteration wins
  it('favors earlier iteration when both test and train accuracy are equal', () => {
    const iterations = [
      makeIteration(1, 0.7, 0.5),
      makeIteration(2, 0.7, 0.5)
    ]
    const best = selectBestIteration(iterations, 0.5)
    expect(best!.iteration).toBe(1)
  })

  // TP-027: holdout exactly 0 uses train score
  it('uses train score when holdout is exactly 0', () => {
    const iterations = [
      makeIteration(1, 0.4, 0.9),
      makeIteration(2, 0.8, 0.1)
    ]
    const best = selectBestIteration(iterations, 0)
    expect(best!.iteration).toBe(2)
  })

  // TP-028: NaN trainAccuracy — first iteration wins since NaN > NaN is false
  it('first iteration wins when trainAccuracy is NaN', () => {
    const iterations = [
      makeIteration(1, NaN, null),
      makeIteration(2, NaN, null)
    ]
    const best = selectBestIteration(iterations, 0)
    expect(best!.iteration).toBe(1)
  })

  // TP-007 (EC7): negative holdout treated as holdout=0
  it('treats negative holdout like holdout=0 (uses trainAccuracy)', () => {
    const iterations = [
      makeIteration(1, 0.3, 0.9),
      makeIteration(2, 0.8, 0.1)
    ]
    const best = selectBestIteration(iterations, -1)
    expect(best!.iteration).toBe(2)
  })
})
