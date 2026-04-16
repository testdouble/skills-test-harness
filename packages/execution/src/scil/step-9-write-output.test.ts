import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  writeFile:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@testdouble/harness-data', () => ({
  ensureOutputDir: vi.fn().mockResolvedValue(undefined),
}))

import { appendFile, writeFile } from 'node:fs/promises'
import { ensureOutputDir } from '@testdouble/harness-data'
import type { IterationResult, QueryResult } from './types.js'
import { writeIterationOutput, writeSummaryOutput } from './step-9-write-output.js'

beforeEach(() => {
  vi.clearAllMocks()
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
    events:    [{ type: 'system' } as any],
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

describe('writeIterationOutput', () => {
  it('writes test_run_id as the first field in the JSON line', async () => {
    const iteration = makeIteration({ iteration: 2 })
    await writeIterationOutput('/out/run-abc', 'run-abc', iteration)

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.test_run_id).toBe('run-abc')
    expect(Object.keys(parsed)[0]).toBe('test_run_id')
  })

  it('appends to scil-iteration.jsonl in the run directory', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration())

    expect(vi.mocked(appendFile).mock.calls[0][0]).toMatch(/scil-iteration\.jsonl$/)
    expect(vi.mocked(appendFile).mock.calls[0][0]).toContain('/out/run-abc')
  })

  it('includes the iteration number and accuracies in the output', async () => {
    const iteration = makeIteration({ iteration: 3, trainAccuracy: 0.75, testAccuracy: 0.5 })
    await writeIterationOutput('/out/run-abc', 'run-abc', iteration)

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.iteration).toBe(3)
    expect(parsed.trainAccuracy).toBe(0.75)
    expect(parsed.testAccuracy).toBe(0.5)
  })

  it('strips events from trainResults', async () => {
    const result = makeQueryResult({ events: [{ type: 'system' } as any, { type: 'assistant' } as any] })
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration({ trainResults: [result] }))

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.trainResults[0]).not.toHaveProperty('events')
    expect(parsed.trainResults[0].testName).toBe('Test A')
  })

  it('strips events from testResults', async () => {
    const result = makeQueryResult({ expected: false, actual: false, passed: true })
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration({ testResults: [result] }))

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.testResults[0]).not.toHaveProperty('events')
  })

  it('ends the line with a newline', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration())

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    expect(written.endsWith('\n')).toBe(true)
  })

  it('creates the run directory', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration())
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/out/run-abc')
  })
})

describe('writeSummaryOutput', () => {
  it('writes test_run_id as the first field', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [iteration], iteration)

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.test_run_id).toBe('run-abc')
    expect(Object.keys(parsed)[0]).toBe('test_run_id')
  })

  it('writes to scil-summary.json in the run directory', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [iteration], iteration)

    expect(vi.mocked(writeFile).mock.calls[0][0]).toMatch(/scil-summary\.json$/)
    expect(vi.mocked(writeFile).mock.calls[0][0]).toContain('/out/run-abc')
  })

  it('includes originalDescription, bestIteration, and bestDescription', async () => {
    const best = makeIteration({ iteration: 2, description: 'best desc' })
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [best], best)

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.originalDescription).toBe('original desc')
    expect(parsed.bestIteration).toBe(2)
    expect(parsed.bestDescription).toBe('best desc')
  })

  it('includes a slim iterations array (no trainResults/testResults)', async () => {
    const iter1 = makeIteration({ iteration: 1, description: 'desc 1', trainAccuracy: 0.5, testAccuracy: null })
    const iter2 = makeIteration({ iteration: 2, description: 'desc 2', trainAccuracy: 1.0, testAccuracy: 0.8 })
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iter1, iter2], iter2)

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.iterations).toHaveLength(2)
    expect(parsed.iterations[0]).toEqual({ iteration: 1, trainAccuracy: 0.5, testAccuracy: null, description: 'desc 1' })
    expect(parsed.iterations[1]).toEqual({ iteration: 2, trainAccuracy: 1.0, testAccuracy: 0.8, description: 'desc 2' })
    expect(parsed.iterations[0]).not.toHaveProperty('trainResults')
    expect(parsed.iterations[0]).not.toHaveProperty('testResults')
  })

  it('does not use "runId" as a field name', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iteration], iteration)

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed).not.toHaveProperty('runId')
  })

  it('creates the run directory', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iteration], iteration)
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/out/run-abc')
  })
})

describe('writeIterationOutput — additional coverage', () => {
  it('preserves the description field in the output', async () => {
    const iteration = makeIteration({ description: 'My specific desc' })
    await writeIterationOutput('/out/run-abc', 'run-abc', iteration)

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.description).toBe('My specific desc')
  })

  it('strips events from all results when multiple exist', async () => {
    const r1 = makeQueryResult({ testName: 'A', events: [{ type: 'a' } as any] })
    const r2 = makeQueryResult({ testName: 'B', events: [{ type: 'b' } as any] })
    const r3 = makeQueryResult({ testName: 'C', events: [{ type: 'c' } as any] })
    const iteration = makeIteration({
      trainResults: [r1, r2],
      testResults:  [r3],
    })
    await writeIterationOutput('/out/run-abc', 'run-abc', iteration)

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    for (const r of [...parsed.trainResults, ...parsed.testResults]) {
      expect(r).not.toHaveProperty('events')
      expect(r).toHaveProperty('testName')
    }
  })
})
