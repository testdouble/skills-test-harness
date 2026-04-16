import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  queryAcilHistory: vi.fn(),
  queryAcilRunDetails: vi.fn(),
}))

import { queryAcilHistory, queryAcilRunDetails } from '@testdouble/harness-data'
import { getAcilHistory, getAcilRunById } from './acil.js'

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

describe('getAcilHistory', () => {
  it('returns { runs } with correct shape', async () => {
    const mockRuns = [
      { test_run_id: 'run-1', agent_file: 'agent.md', iteration_count: 3, best_train_accuracy: 0.85 },
      { test_run_id: 'run-2', agent_file: 'other.md', iteration_count: 5, best_train_accuracy: 1.0 },
    ]
    vi.mocked(queryAcilHistory).mockResolvedValue(mockRuns)
    const { c, jsonMock } = makeMockContext()

    await getAcilHistory(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ runs: mockRuns })
  })

  it('passes dataDir to queryAcilHistory', async () => {
    vi.mocked(queryAcilHistory).mockResolvedValue([])
    const { c } = makeMockContext()

    await getAcilHistory(c, '/custom-data')

    expect(vi.mocked(queryAcilHistory)).toHaveBeenCalledWith('/custom-data')
  })

  it('returns empty runs array when no data exists', async () => {
    vi.mocked(queryAcilHistory).mockResolvedValue([])
    const { c, jsonMock } = makeMockContext()

    await getAcilHistory(c, '/data')

    const { runs } = jsonMock.mock.calls[0][0] as { runs: any[] }
    expect(runs).toEqual([])
  })

  it('returns empty runs when parquet file does not exist', async () => {
    vi.mocked(queryAcilHistory).mockRejectedValue(new Error('IO Error: No such file or directory: acil-iteration.parquet'))
    const { c, jsonMock } = makeMockContext()

    await getAcilHistory(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ runs: [] })
  })

  it('re-throws unexpected errors', async () => {
    vi.mocked(queryAcilHistory).mockRejectedValue(new Error('Database connection failed'))
    const { c } = makeMockContext()

    await expect(getAcilHistory(c, '/data')).rejects.toThrow('Database connection failed')
  })

  it('re-throws non-Error throwable', async () => {
    vi.mocked(queryAcilHistory).mockRejectedValue('some string error')
    const { c } = makeMockContext()

    await expect(getAcilHistory(c, '/data')).rejects.toBe('some string error')
  })
})

describe('getAcilRunById', () => {
  it('returns summary and iterations for a valid run ID', async () => {
    const summary = { test_run_id: 'run-abc', originalDescription: 'test', bestIteration: 2, bestDescription: 'better' }
    const iterations = [{ test_run_id: 'run-abc', iteration: 1 }]
    vi.mocked(queryAcilRunDetails).mockResolvedValue({ summary, iterations } as any)
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-abc' } })

    await getAcilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ summary, iterations })
  })

  it('returns 404 JSON when run is not found', async () => {
    vi.mocked(queryAcilRunDetails).mockRejectedValue(new Error('ACIL run not found: run-xyz'))
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await getAcilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('defaults to empty string runId when param is missing', async () => {
    vi.mocked(queryAcilRunDetails).mockRejectedValue(new Error('ACIL run not found: '))
    const { c, jsonMock } = makeMockContext()

    await getAcilRunById(c, '/data')

    expect(vi.mocked(queryAcilRunDetails)).toHaveBeenCalledWith('/data', '')
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('re-throws unexpected errors', async () => {
    vi.mocked(queryAcilRunDetails).mockRejectedValue(new Error('Database connection failed'))
    const { c } = makeMockContext({ param: { runId: 'run-abc' } })

    await expect(getAcilRunById(c, '/data')).rejects.toThrow('Database connection failed')
  })

  it('returns 404 when parquet file does not exist', async () => {
    vi.mocked(queryAcilRunDetails).mockRejectedValue(new Error('IO Error: No such file or directory: acil-summary.parquet'))
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-abc' } })

    await getAcilRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('re-throws non-Error throwable even if message matches "not found" pattern', async () => {
    vi.mocked(queryAcilRunDetails).mockRejectedValue('ACIL run not found: run-xyz')
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await expect(getAcilRunById(c, '/data')).rejects.toBe('ACIL run not found: run-xyz')
    expect(jsonMock).not.toHaveBeenCalled()
  })
})
