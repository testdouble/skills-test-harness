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
import type { IterationResult, QueryResult } from '@testdouble/harness-data'
import { writeIterationOutput, writeSummaryOutput } from './write-output.js'

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
  it('uses the prefix parameter in the output filename', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration(), 'acil')

    expect(vi.mocked(appendFile).mock.calls[0][0]).toMatch(/acil-iteration\.jsonl$/)
  })

  it('writes test_run_id as the first field', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration(), 'acil')

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.test_run_id).toBe('run-abc')
    expect(Object.keys(parsed)[0]).toBe('test_run_id')
  })

  it('strips events from trainResults and testResults', async () => {
    const result = makeQueryResult({ events: [{ type: 'system' } as any, { type: 'assistant' } as any] })
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration({ trainResults: [result], testResults: [result] }), 'custom')

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.trainResults[0]).not.toHaveProperty('events')
    expect(parsed.testResults[0]).not.toHaveProperty('events')
    expect(parsed.trainResults[0].testName).toBe('Test A')
  })

  it('ends the line with a newline', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration(), 'acil')

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    expect(written.endsWith('\n')).toBe(true)
  })

  it('creates the run directory via ensureOutputDir', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration(), 'acil')
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/out/run-abc')
  })
})

describe('writeSummaryOutput', () => {
  it('uses the prefix parameter in the output filename', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [iteration], iteration, 'acil')

    expect(vi.mocked(writeFile).mock.calls[0][0]).toMatch(/acil-summary\.json$/)
  })

  it('writes test_run_id as the first field', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [iteration], iteration, 'custom')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.test_run_id).toBe('run-abc')
    expect(Object.keys(parsed)[0]).toBe('test_run_id')
  })

  it('includes originalDescription, bestIteration, and bestDescription', async () => {
    const best = makeIteration({ iteration: 2, description: 'best desc' })
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [best], best, 'acil')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.originalDescription).toBe('original desc')
    expect(parsed.bestIteration).toBe(2)
    expect(parsed.bestDescription).toBe('best desc')
  })

  it('includes a slim iterations array without trainResults or testResults', async () => {
    const iter1 = makeIteration({ iteration: 1, description: 'desc 1', trainAccuracy: 0.5, testAccuracy: null })
    const iter2 = makeIteration({ iteration: 2, description: 'desc 2', trainAccuracy: 1.0, testAccuracy: 0.8 })
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iter1, iter2], iter2, 'acil')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.iterations).toHaveLength(2)
    expect(parsed.iterations[0]).toEqual({ iteration: 1, trainAccuracy: 0.5, testAccuracy: null, description: 'desc 1' })
    expect(parsed.iterations[0]).not.toHaveProperty('trainResults')
  })

  it('creates the run directory via ensureOutputDir', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iteration], iteration, 'acil')
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/out/run-abc')
  })
})
