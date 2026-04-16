import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../paths.js', () => ({
  outputDir: '/mock-output',
  dataDir: '/mock-data',
}))
vi.mock('@testdouble/harness-data', () => ({
  updateAllParquet: vi.fn(),
}))
vi.mock('@testdouble/harness-execution', () => ({
  getReEvaluatedRuns: vi.fn(),
  clearReEvaluatedRuns: vi.fn(),
}))

import { updateAllParquet } from '@testdouble/harness-data'
import { getReEvaluatedRuns, clearReEvaluatedRuns } from '@testdouble/harness-execution'
import { handler, command, describe as commandDescribe, builder } from './update-analytics.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateAllParquet).mockResolvedValue({ updated: [] } as any)
  vi.mocked(getReEvaluatedRuns).mockResolvedValue([])
  vi.mocked(clearReEvaluatedRuns).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('update-analytics command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('update-analytics-data')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('update-analytics builder', () => {
  it('configures output-dir with a default from paths', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) { options[name] = opts; return fakeYargs },
    } as any
    builder(fakeYargs)
    expect(options['output-dir']).toMatchObject({ type: 'string', default: '/mock-output' })
  })

  it('configures data-dir with a default from paths', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) { options[name] = opts; return fakeYargs },
    } as any
    builder(fakeYargs)
    expect(options['data-dir']).toMatchObject({ type: 'string', default: '/mock-data' })
  })
})

describe('update-analytics handler', () => {
  it('passes output-dir, data-dir, and reEvaluatedRunIds to updateAllParquet', async () => {
    await handler({ 'output-dir': '/custom-output', 'data-dir': '/custom-data' })
    expect(vi.mocked(updateAllParquet)).toHaveBeenCalledWith({
      outputDir: '/custom-output',
      dataDir: '/custom-data',
      reEvaluatedRunIds: [],
    })
  })

  it('passes re-evaluated run IDs from the marker to updateAllParquet', async () => {
    vi.mocked(getReEvaluatedRuns).mockResolvedValue(['run-1', 'run-2'])

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    expect(vi.mocked(updateAllParquet)).toHaveBeenCalledWith(expect.objectContaining({
      reEvaluatedRunIds: ['run-1', 'run-2'],
    }))
  })

  it('clears re-evaluated run IDs from the marker after updateAllParquet succeeds', async () => {
    vi.mocked(getReEvaluatedRuns).mockResolvedValue(['run-1', 'run-2'])

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    expect(vi.mocked(clearReEvaluatedRuns)).toHaveBeenCalledWith('/mock-output', ['run-1', 'run-2'])
  })

  it('does not call clearReEvaluatedRuns when there are no re-evaluated runs', async () => {
    vi.mocked(getReEvaluatedRuns).mockResolvedValue([])

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    expect(vi.mocked(clearReEvaluatedRuns)).not.toHaveBeenCalled()
  })

  it('logs "updated" for tables that were updated', async () => {
    vi.mocked(updateAllParquet).mockResolvedValue({ updated: ['test-config', 'test-run'] } as any)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    const messages = logSpy.mock.calls.map(([s]) => s)
    expect(messages).toContain('  updated: test-config.parquet')
    expect(messages).toContain('  updated: test-run.parquet')
  })

  it('logs "no data found" for tables not in updated list', async () => {
    vi.mocked(updateAllParquet).mockResolvedValue({ updated: ['test-config'] } as any)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    const messages = logSpy.mock.calls.map(([s]) => s)
    expect(messages).toContain('  no data found for: test-run')
    expect(messages).toContain('  no data found for: test-results')
    expect(messages).toContain('  no data found for: scil-iteration')
    expect(messages).toContain('  no data found for: scil-summary')
  })

  it('logs "updated" for SCIL tables when they are in the updated list', async () => {
    vi.mocked(updateAllParquet).mockResolvedValue({ updated: ['scil-iteration', 'scil-summary'] } as any)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    const messages = logSpy.mock.calls.map(([s]) => s)
    expect(messages).toContain('  updated: scil-iteration.parquet')
    expect(messages).toContain('  updated: scil-summary.parquet')
  })

  it('logs "replaced" for test-results when re-evaluated runs were processed', async () => {
    vi.mocked(getReEvaluatedRuns).mockResolvedValue(['run-1', 'run-2'])
    vi.mocked(updateAllParquet).mockResolvedValue({ updated: ['test-results'] } as any)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    const messages = logSpy.mock.calls.map(([s]) => s)
    expect(messages).toContain('  replaced: test-results.parquet (2 re-evaluated run(s))')
    expect(messages).not.toContain('  updated: test-results.parquet')
  })

  it('logs "updated" for test-results when no re-evaluated runs were present', async () => {
    vi.mocked(getReEvaluatedRuns).mockResolvedValue([])
    vi.mocked(updateAllParquet).mockResolvedValue({ updated: ['test-results'] } as any)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })

    const messages = logSpy.mock.calls.map(([s]) => s)
    expect(messages).toContain('  updated: test-results.parquet')
    expect(messages).not.toContain(expect.stringContaining('replaced'))
  })

  it('completes without throwing on success', async () => {
    await expect(handler({ 'output-dir': '/mock-output', 'data-dir': '/mock-data' })).resolves.toBeUndefined()
  })
})
