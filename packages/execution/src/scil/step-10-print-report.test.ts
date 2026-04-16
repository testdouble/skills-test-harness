import { beforeEach, describe, expect, it, vi } from 'vitest'
import { printFinalSummary, printIterationProgress } from './step-10-print-report.js'
import type { IterationResult, QueryResult } from './types.js'

let output: string

beforeEach(() => {
  output = ''
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  })
})

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    testName: 'Test A',
    skillFile: 'plugin:skill',
    promptContent: 'test prompt',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    events: [],
    ...overrides,
  }
}

function makeIteration(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    iteration: 1,
    phase: 'explore',
    description: 'A description',
    trainResults: [makeQueryResult()],
    testResults: [],
    trainAccuracy: 1.0,
    testAccuracy: null,
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
    printIterationProgress(makeIteration({ trainAccuracy: 0.8, testAccuracy: 0.6 }), 5, null)

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
    printIterationProgress(makeIteration({ trainResults: [failResult] }), 5, null)

    expect(output).toContain('FAIL (should trigger): "bad-query"')
  })

  it('prints should-NOT-trigger direction for negative tests', () => {
    const failResult = makeQueryResult({
      testName: 'false-positive',
      expected: false,
      actual: true,
      passed: false,
    })
    printIterationProgress(makeIteration({ trainResults: [failResult] }), 5, null)

    expect(output).toContain('FAIL (should NOT trigger): "false-positive"')
  })

  it('prints new description preview when provided', () => {
    printIterationProgress(makeIteration(), 5, 'A brand new description')

    expect(output).toContain('New description: A brand new description')
  })

  it('shows full description without truncation', () => {
    const longDesc = 'A'.repeat(100)
    printIterationProgress(makeIteration(), 5, longDesc)

    expect(output).toContain('A'.repeat(100))
  })

  it('does not print new description when null', () => {
    printIterationProgress(makeIteration(), 5, null)

    expect(output).not.toContain('New description:')
  })

  it('prints pass/total counts', () => {
    const pass = makeQueryResult({ passed: true })
    const fail = makeQueryResult({ passed: false })
    printIterationProgress(makeIteration({ trainResults: [pass, fail, pass], trainAccuracy: 0.67 }), 5, null)

    expect(output).toContain('(2/3)')
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
    const bestLine = lines.find((l) => l.includes('best'))
    expect(bestLine).toContain('2')
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

    // The table should show the dash character for null test accuracy
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

  it('rounds fractional accuracy correctly', () => {
    const iter = makeIteration({ iteration: 1, trainAccuracy: 0.666 })
    printFinalSummary([iter], iter, 'desc')

    expect(output).toContain('67%')
  })
})

describe('printIterationProgress — additional coverage', () => {
  it('displays 0% for NaN train accuracy', () => {
    printIterationProgress(makeIteration({ trainResults: [], trainAccuracy: NaN }), 5, null)

    expect(output).toContain('train: 0%')
    expect(output).not.toContain('NaN')
  })

  it('prints test accuracy pass/total counts', () => {
    const pass = makeQueryResult({ passed: true })
    const fail = makeQueryResult({ passed: false })
    printIterationProgress(makeIteration({ testAccuracy: 0.5, testResults: [pass, fail] }), 5, null)

    expect(output).toContain('test: 50% (1/2)')
  })

  it('shows full description without truncation for long descriptions', () => {
    const desc200 = 'A'.repeat(200)
    printIterationProgress(makeIteration(), 5, desc200)

    expect(output).toContain(desc200)
    expect(output).not.toContain('...')
  })

  it('displays test accuracy of 0 as 0%', () => {
    printIterationProgress(
      makeIteration({ testAccuracy: 0, testResults: [makeQueryResult({ passed: false })] }),
      5,
      null,
    )

    expect(output).toContain('test: 0%')
  })
})
