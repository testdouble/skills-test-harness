import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IterationResult, QueryResult } from '@testdouble/harness-data'
import { printIterationProgress, printFinalSummary } from './print-report.js'

let output: string

beforeEach(() => {
  output = ''
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    testName:  'Test A',
    skillFile: 'plugin:skill',
    promptContent: 'test prompt',
    expected:  true,
    actual:    true,
    passed:    true,
    runIndex:  0,
    events:    [],
    ...overrides,
  }
}

function makeIteration(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    iteration:     1,
    phase:         'explore',
    description:   'A description',
    trainResults:  [makeQueryResult()],
    testResults:   [],
    trainAccuracy: 1.0,
    testAccuracy:  null,
    ...overrides,
  }
}

describe('printIterationProgress', () => {
  it('prints iteration number and train accuracy', () => {
    printIterationProgress(makeIteration({ iteration: 2, trainAccuracy: 0.75 }), 5, null)

    expect(output).toContain('Iteration 2/5')
    expect(output).toContain('train: 75%')
  })

  it('prints test accuracy when present', () => {
    printIterationProgress(
      makeIteration({ trainAccuracy: 0.8, testAccuracy: 0.6 }),
      5,
      null
    )

    expect(output).toContain('test: 60%')
  })

  it('omits test accuracy when null', () => {
    printIterationProgress(makeIteration({ testAccuracy: null }), 5, null)

    expect(output).not.toContain('test:')
  })

  it('prints failing train results with direction', () => {
    const failResult = makeQueryResult({
      testName: 'bad-query',
      expected: true,
      actual: false,
      passed: false,
    })
    printIterationProgress(
      makeIteration({ trainResults: [failResult] }),
      5,
      null
    )

    expect(output).toContain('FAIL (should trigger): "bad-query"')
  })

  it('prints should-NOT-trigger direction for negative tests', () => {
    const failResult = makeQueryResult({
      testName: 'false-positive',
      expected: false,
      actual: true,
      passed: false,
    })
    printIterationProgress(
      makeIteration({ trainResults: [failResult] }),
      5,
      null
    )

    expect(output).toContain('FAIL (should NOT trigger): "false-positive"')
  })

  it('prints new description when provided', () => {
    printIterationProgress(makeIteration(), 5, 'A brand new description')

    expect(output).toContain('New description: A brand new description')
  })

  it('does not print new description when null', () => {
    printIterationProgress(makeIteration(), 5, null)

    expect(output).not.toContain('New description:')
  })

  it('displays 0% for NaN train accuracy', () => {
    printIterationProgress(
      makeIteration({ trainResults: [], trainAccuracy: NaN }),
      5,
      null
    )

    expect(output).toContain('train: 0%')
    expect(output).not.toContain('NaN')
  })

  it('prints pass/total counts for train results', () => {
    const pass = makeQueryResult({ passed: true })
    const fail = makeQueryResult({ passed: false })
    printIterationProgress(
      makeIteration({ trainResults: [pass, fail, pass], trainAccuracy: 0.67 }),
      5,
      null
    )

    expect(output).toContain('(2/3)')
  })

  // TP-002: NaN testAccuracy omitted from iteration progress
  it('omits test accuracy when testAccuracy is NaN (EC5)', () => {
    printIterationProgress(
      makeIteration({ testAccuracy: NaN, testResults: [] }),
      5,
      null
    )

    expect(output).not.toContain('test:')
    expect(output).not.toContain('NaN')
  })

  it('prints pass/total counts for test results', () => {
    const pass = makeQueryResult({ passed: true })
    const fail = makeQueryResult({ passed: false })
    printIterationProgress(
      makeIteration({ testAccuracy: 0.5, testResults: [pass, fail] }),
      5,
      null
    )

    expect(output).toContain('test: 50% (1/2)')
  })
})

describe('printFinalSummary', () => {
  it('prints the best iteration number', () => {
    const iter = makeIteration({ iteration: 3, trainAccuracy: 0.9 })
    printFinalSummary([iter], iter, 'best desc')

    expect(output).toContain('Best iteration: 3')
  })

  it('prints a table with train column', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0 })
    printFinalSummary([iter1, iter2], iter2, 'best desc')

    expect(output).toContain('Iteration  Phase')
    expect(output).toContain('50%')
    expect(output).toContain('100%')
  })

  it('includes test column when any iteration has test accuracy', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: 0.4 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0, testAccuracy: 0.8 })
    printFinalSummary([iter1, iter2], iter2, 'best desc')

    expect(output).toContain('Test')
    expect(output).toContain('40%')
    expect(output).toContain('80%')
  })

  it('marks the best iteration with an arrow', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0 })
    printFinalSummary([iter1, iter2], iter2, 'best desc')

    const lines = output.split('\n')
    const bestLine = lines.find(l => l.includes('best'))
    expect(bestLine).toContain('← best')
  })

  it('prints the best description at the end', () => {
    const iter = makeIteration()
    printFinalSummary([iter], iter, 'The ultimate description')

    expect(output).toContain('Best description:')
    expect(output).toContain('The ultimate description')
  })

  it('uses a dash for missing test accuracy in table', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: 0.4 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0, testAccuracy: null })
    printFinalSummary([iter1, iter2], iter2, 'desc')

    expect(output).toMatch(/—/)
  })

  it('omits test column when no iteration has test accuracy', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: null })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0, testAccuracy: null })
    printFinalSummary([iter1, iter2], iter2, 'desc')

    expect(output).toContain('Iteration  Phase')
    expect(output).not.toContain('Test')
  })

  it('displays 0% for NaN train accuracy', () => {
    const iter = makeIteration({ trainAccuracy: NaN })
    printFinalSummary([iter], iter, 'desc')

    expect(output).toContain('0%')
    expect(output).not.toContain('NaN')
  })

  // TP-003: NaN testAccuracy displays as dash in summary table
  it('displays dash for NaN test accuracy in table (EC6)', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5, testAccuracy: 0.4 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 1.0, testAccuracy: NaN })
    printFinalSummary([iter1, iter2], iter2, 'desc')

    expect(output).not.toContain('NaN')
    expect(output).toMatch(/—/)
  })

  it('rounds fractional accuracy correctly', () => {
    const iter = makeIteration({ iteration: 1, trainAccuracy: 0.666 })
    printFinalSummary([iter], iter, 'desc')

    expect(output).toContain('67%')
  })

  it('prints warning when all iterations have the same accuracy', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 0.5 })
    printFinalSummary([iter1, iter2], iter1, 'desc')

    expect(output).toContain('same accuracy')
  })

  it('does not print warning when iterations have different accuracies', () => {
    const iter1 = makeIteration({ iteration: 1, trainAccuracy: 0.5 })
    const iter2 = makeIteration({ iteration: 2, trainAccuracy: 0.8 })
    printFinalSummary([iter1, iter2], iter2, 'desc')

    expect(output).not.toContain('same accuracy')
  })

  it('does not print warning for a single iteration', () => {
    const iter = makeIteration({ iteration: 1, trainAccuracy: 0.5 })
    printFinalSummary([iter], iter, 'desc')

    expect(output).not.toContain('same accuracy')
  })

  it('includes Phase column with phase names in table', () => {
    const iter1 = makeIteration({ iteration: 1, phase: 'explore', trainAccuracy: 0.5 })
    const iter2 = makeIteration({ iteration: 2, phase: 'converge', trainAccuracy: 1.0 })
    printFinalSummary([iter1, iter2], iter2, 'desc')

    expect(output).toContain('explore')
    expect(output).toContain('converge')
  })

  it('shows dash for legacy iterations without phase', () => {
    const iter = makeIteration({ iteration: 1, phase: undefined, trainAccuracy: 0.8 })
    printFinalSummary([iter], iter, 'desc')

    expect(output).toContain('—')
  })
})

describe('printIterationProgress — phase tag', () => {
  it('includes [explore] tag when phase is explore', () => {
    printIterationProgress(makeIteration({ phase: 'explore' }), 5, null)
    expect(output).toContain('[explore]')
  })

  it('includes [transition] tag when phase is transition', () => {
    printIterationProgress(makeIteration({ phase: 'transition' }), 5, null)
    expect(output).toContain('[transition]')
  })

  it('includes [converge] tag when phase is converge', () => {
    printIterationProgress(makeIteration({ phase: 'converge' }), 5, null)
    expect(output).toContain('[converge]')
  })

  it('omits phase tag when phase is undefined (legacy)', () => {
    printIterationProgress(makeIteration({ phase: undefined }), 5, null)
    expect(output).not.toContain('[')
    expect(output).not.toContain(']')
  })
})
