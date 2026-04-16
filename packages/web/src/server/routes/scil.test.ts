import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  queryScilHistory: vi.fn(),
  queryScilRunDetails: vi.fn(),
}))

import { queryScilHistory, queryScilRunDetails } from '@testdouble/harness-data'
import { getScilHistory, getScilRunById } from './scil.js'

function makeMockContext(overrides?: { param?: Record<string, string> }) {
  const jsonMock = vi.fn((data: unknown) => ({ data }))
  return {
    c: {
      json: jsonMock,
      req: {
        param: (key: string) => overrides?.param?.[key] ?? '',
      },
    } as any,
    jsonMock,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getScilHistory', () => {
  it('returns { runs } with correct shape', async () => {
    const mockRuns = [
      { test_run_id: 'run-1', skill_file: 'skill.md', iteration_count: 3, best_train_accuracy: 0.85 },
      { test_run_id: 'run-2', skill_file: 'other.md', iteration_count: 5, best_train_accuracy: 1.0 },
    ]
    vi.mocked(queryScilHistory).mockResolvedValue(mockRuns)
    const { c, jsonMock } = makeMockContext()

    await getScilHistory(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ runs: mockRuns })
  })

  it('passes dataDir to queryScilHistory', async () => {
    vi.mocked(queryScilHistory).mockResolvedValue([])
    const { c } = makeMockContext()

    await getScilHistory(c, '/custom-data')

    expect(vi.mocked(queryScilHistory)).toHaveBeenCalledWith('/custom-data')
  })

  it('returns empty runs array when no data exists', async () => {
    vi.mocked(queryScilHistory).mockResolvedValue([])
    const { c, jsonMock } = makeMockContext()

    await getScilHistory(c, '/data')

    const { runs } = jsonMock.mock.calls[0][0] as { runs: any[] }
    expect(runs).toEqual([])
  })

  it('returns empty runs when parquet file does not exist (TP-003)', async () => {
    vi.mocked(queryScilHistory).mockRejectedValue(new Error('IO Error: No such file or directory: scil-iteration.parquet'))
    const { c, jsonMock } = makeMockContext()

    await getScilHistory(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ runs: [] })
  })

  it('re-throws unexpected errors (TP-004)', async () => {
    vi.mocked(queryScilHistory).mockRejectedValue(new Error('Database connection failed'))
    const { c } = makeMockContext()

    await expect(getScilHistory(c, '/data')).rejects.toThrow('Database connection failed')
  })

  it('re-throws non-Error throwable (TP-004)', async () => {
    vi.mocked(queryScilHistory).mockRejectedValue('some string error')
    const { c } = makeMockContext()

    await expect(getScilHistory(c, '/data')).rejects.toBe('some string error')
  })
})

describe('getScilRunById', () => {
  it('returns summary and iterations for a valid run ID', async () => {
    const summary = { test_run_id: 'run-abc', originalDescription: 'test', bestIteration: 2, bestDescription: 'better' }
    const iterations = [{ test_run_id: 'run-abc', iteration: 1 }]
    vi.mocked(queryScilRunDetails).mockResolvedValue({ summary, iterations } as any)
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-abc' } })

    await getScilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ summary, iterations })
  })

  it('returns 404 JSON when run is not found', async () => {
    vi.mocked(queryScilRunDetails).mockRejectedValue(new Error('SCIL run not found: run-xyz'))
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await getScilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('defaults to empty string runId when param is missing', async () => {
    vi.mocked(queryScilRunDetails).mockRejectedValue(new Error('SCIL run not found: '))
    const { c, jsonMock } = makeMockContext()

    await getScilRunById(c, '/data')

    expect(vi.mocked(queryScilRunDetails)).toHaveBeenCalledWith('/data', '')
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('re-throws unexpected errors', async () => {
    vi.mocked(queryScilRunDetails).mockRejectedValue(new Error('Database connection failed'))
    const { c } = makeMockContext({ param: { runId: 'run-abc' } })

    await expect(getScilRunById(c, '/data')).rejects.toThrow('Database connection failed')
  })

  it('returns 404 when parquet file does not exist (EC5)', async () => {
    vi.mocked(queryScilRunDetails).mockRejectedValue(new Error('IO Error: No such file or directory: scil-summary.parquet'))
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-abc' } })

    await getScilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('re-throws non-Error throwable even if message matches "not found" pattern', async () => {
    vi.mocked(queryScilRunDetails).mockRejectedValue('SCIL run not found: run-xyz')
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await expect(getScilRunById(c, '/data')).rejects.toBe('SCIL run not found: run-xyz')
    expect(jsonMock).not.toHaveBeenCalled()
  })
})
