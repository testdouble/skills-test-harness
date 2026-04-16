import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@testdouble/harness-data', () => ({
  ensureOutputDir: vi.fn().mockResolvedValue(undefined),
}))

import { appendFile, writeFile } from 'node:fs/promises'
import { ensureOutputDir } from '@testdouble/harness-data'
import { writeIterationOutput, writeSummaryOutput } from './step-9-write-output.js'
import type { AcilIterationResult, AcilQueryResult } from './types.js'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeQueryResult(overrides: Partial<AcilQueryResult> = {}): AcilQueryResult {
  return {
    testName: 'test-1',
    agentFile: 'r-and-d:gap-analyzer',
    promptContent: 'test prompt',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    events: [{ type: 'system' } as any],
    ...overrides,
  }
}

function makeIteration(overrides: Partial<AcilIterationResult> = {}): AcilIterationResult {
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

describe('writeIterationOutput (ACIL)', () => {
  it('appends to acil-iteration.jsonl in the run directory', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration())

    expect(vi.mocked(appendFile).mock.calls[0][0]).toMatch(/acil-iteration\.jsonl$/)
    expect(vi.mocked(appendFile).mock.calls[0][0]).toContain('/out/run-abc')
  })

  it('delegates to common writeIterationOutput with acil prefix', async () => {
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration())

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.test_run_id).toBe('run-abc')
    expect(parsed.iteration).toBe(1)
  })

  it('strips events from results', async () => {
    const result = makeQueryResult({ events: [{ type: 'system' } as any, { type: 'assistant' } as any] })
    await writeIterationOutput('/out/run-abc', 'run-abc', makeIteration({ trainResults: [result] }))

    const written = vi.mocked(appendFile).mock.calls[0][1] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.trainResults[0]).not.toHaveProperty('events')
    expect(parsed.trainResults[0].testName).toBe('test-1')
  })
})

describe('writeSummaryOutput (ACIL)', () => {
  it('writes to acil-summary.json in the run directory', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original desc', [iteration], iteration)

    expect(vi.mocked(writeFile).mock.calls[0][0]).toMatch(/acil-summary\.json$/)
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

  it('creates the run directory', async () => {
    const iteration = makeIteration()
    await writeSummaryOutput('/out/run-abc', 'run-abc', 'original', [iteration], iteration)
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/out/run-abc')
  })
})
