import { describe, it, expect } from 'vitest'
import type { QueryResult, IterationResult } from '@testdouble/harness-data'
import { scoreResults, selectBestIteration } from './score.js'

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

function makeIteration(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    iteration:     1,
    description:   'iteration 1',
    trainResults:  [],
    testResults:   [],
    trainAccuracy: 0,
    testAccuracy:  null,
    ...overrides,
  }
}

describe('scoreResults', () => {
  it('returns trainAccuracy=1 when all train results pass', () => {
    const { trainAccuracy, testAccuracy } = scoreResults(
      [makeResult(true), makeResult(true)],
      []
    )
    expect(trainAccuracy).toBe(1)
    expect(testAccuracy).toBeNull()
  })

  it('returns trainAccuracy=0 for empty train results', () => {
    const { trainAccuracy } = scoreResults([], [makeResult(true)])
    expect(trainAccuracy).toBe(0)
  })

  it('returns testAccuracy=null for empty test results', () => {
    const { testAccuracy } = scoreResults([makeResult(true)], [])
    expect(testAccuracy).toBeNull()
  })

  it('computes correct fractions for mixed pass/fail', () => {
    const train = [makeResult(true), makeResult(true), makeResult(false)]
    const test = [makeResult(true), makeResult(false), makeResult(false), makeResult(false)]
    const { trainAccuracy, testAccuracy } = scoreResults(train, test)
    expect(trainAccuracy).toBeCloseTo(2 / 3)
    expect(testAccuracy).toBe(0.25)
  })

  it('returns 0 and null when both arrays are empty', () => {
    const { trainAccuracy, testAccuracy } = scoreResults([], [])
    expect(trainAccuracy).toBe(0)
    expect(testAccuracy).toBeNull()
  })
})

describe('selectBestIteration', () => {
  it('returns null for empty iterations', () => {
    expect(selectBestIteration([], 0)).toBeNull()
    expect(selectBestIteration([], 0.3)).toBeNull()
  })

  it('returns the single iteration', () => {
    const iter = makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: 0.3 })
    expect(selectBestIteration([iter], 0.3)).toBe(iter)
  })

  it('selects by testAccuracy when holdout > 0', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.9, testAccuracy: 0.3 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.5, testAccuracy: 0.8 }),
      makeIteration({ iteration: 3, trainAccuracy: 0.7, testAccuracy: 0.6 }),
    ]
    expect(selectBestIteration(iterations, 0.3)!.iteration).toBe(2)
  })

  it('selects by trainAccuracy when holdout is 0', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.3, testAccuracy: 0.9 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.8, testAccuracy: 0.1 }),
    ]
    expect(selectBestIteration(iterations, 0)!.iteration).toBe(2)
  })

  it('favors earlier iteration on tie', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.7 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.7 }),
    ]
    expect(selectBestIteration(iterations, 0)!.iteration).toBe(1)
  })

  it('treats null testAccuracy as 0', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.9 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.5, testAccuracy: 0.5 }),
    ]
    expect(selectBestIteration(iterations, 0.3)!.iteration).toBe(2)
  })

  it('uses train accuracy as tiebreaker when test scores are equal', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: 0.5 }),
      makeIteration({ iteration: 2, trainAccuracy: 1.0, testAccuracy: 0.5 }),
    ]
    expect(selectBestIteration(iterations, 0.5)!.iteration).toBe(2)
  })

  it('favors earlier iteration when both test and train accuracy are equal', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.7, testAccuracy: 0.5 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.7, testAccuracy: 0.5 }),
    ]
    expect(selectBestIteration(iterations, 0.5)!.iteration).toBe(1)
  })

  // TP-004: NaN testAccuracy coerced to 0 in primary score
  it('treats NaN testAccuracy as 0 when holdout > 0 (EC7)', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: NaN }),
      makeIteration({ iteration: 2, trainAccuracy: 0.5, testAccuracy: 0.5 }),
    ]
    expect(selectBestIteration(iterations, 0.3)!.iteration).toBe(2)
  })

  // TP-004: All-NaN testAccuracies with tiebreaker on trainAccuracy
  it('selects by trainAccuracy when all testAccuracies are NaN with holdout > 0 (EC7)', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: 0.3, testAccuracy: NaN }),
      makeIteration({ iteration: 2, trainAccuracy: 0.8, testAccuracy: NaN }),
    ]
    // Both NaN → coerced to 0, tied on primary score, tiebreaker on trainAccuracy
    expect(selectBestIteration(iterations, 0.3)!.iteration).toBe(2)
  })

  // EC5: NaN trainAccuracy in tiebreaker — coerced to 0, so real value wins
  it('selects later iteration when earlier has NaN trainAccuracy in tiebreaker (EC5)', () => {
    const iterations = [
      makeIteration({ iteration: 1, trainAccuracy: NaN, testAccuracy: 0.5 }),
      makeIteration({ iteration: 2, trainAccuracy: 0.8, testAccuracy: 0.5 }),
    ]
    // NaN coerced to 0 in tiebreaker, 0.8 > 0 — later iteration wins
    const best = selectBestIteration(iterations, 0.5)
    expect(best!.iteration).toBe(2)
  })
})
