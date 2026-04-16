import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  queryTestRunSummaries: vi.fn(),
  queryTestRunDetails: vi.fn(),
}))

import { queryTestRunDetails, queryTestRunSummaries } from '@testdouble/harness-data'
import { getTestRunById, getTestRuns } from './test-runs.js'

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

describe('getTestRuns', () => {
  it('returns run summaries from queryTestRunSummaries', async () => {
    const mockRuns = [
      {
        test_run_id: '20240103T120000',
        suite: 'suite-a',
        date: '2024-01-03T12:00:00.000Z',
        total_tests: 2,
        passed: 1,
        failed: 1,
      },
      {
        test_run_id: '20240101T080000',
        suite: 'suite-b',
        date: '2024-01-01T08:00:00.000Z',
        total_tests: 1,
        passed: 1,
        failed: 0,
      },
    ]
    vi.mocked(queryTestRunSummaries).mockResolvedValue(mockRuns)
    const { c, jsonMock } = makeMockContext()

    await getTestRuns(c, '/data')

    const { runs } = jsonMock.mock.calls[0][0] as { runs: any[] }
    expect(runs).toHaveLength(2)
    expect(runs[0].test_run_id).toBe('20240103T120000')
    expect(runs[0].total_tests).toBe(2)
    expect(runs[0].passed).toBe(1)
    expect(runs[0].failed).toBe(1)
  })

  it('passes dataDir to queryTestRunSummaries', async () => {
    vi.mocked(queryTestRunSummaries).mockResolvedValue([])
    const { c } = makeMockContext()

    await getTestRuns(c, '/custom-data')

    expect(vi.mocked(queryTestRunSummaries)).toHaveBeenCalledWith('/custom-data')
  })

  it('returns empty runs array when no data exists', async () => {
    vi.mocked(queryTestRunSummaries).mockResolvedValue([])
    const { c, jsonMock } = makeMockContext()

    await getTestRuns(c, '/data')

    const { runs } = jsonMock.mock.calls[0][0] as { runs: any[] }
    expect(runs).toEqual([])
  })

  it('passes through runs without re-aggregating', async () => {
    const mockRuns = [
      {
        test_run_id: '20240103T120000',
        suite: 'suite-a',
        date: '2024-01-03T12:00:00.000Z',
        total_tests: 5,
        passed: 3,
        failed: 2,
      },
    ]
    vi.mocked(queryTestRunSummaries).mockResolvedValue(mockRuns)
    const { c, jsonMock } = makeMockContext()

    await getTestRuns(c, '/data')

    const { runs } = jsonMock.mock.calls[0][0] as { runs: any[] }
    expect(runs).toEqual(mockRuns)
  })
})

describe('getTestRunById', () => {
  it('returns summary and expectations for a valid run ID', async () => {
    const summary = [{ test_run_id: 'run-abc', test_name: 'test 1' }]
    const expectations = [{ test_run_id: 'run-abc', passed: true }]
    vi.mocked(queryTestRunDetails).mockResolvedValue({ summary, expectations } as any)
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-abc' } })

    await getTestRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ summary, expectations })
  })

  it('returns 404 JSON when run is not found', async () => {
    vi.mocked(queryTestRunDetails).mockRejectedValue(new Error('Test run not found: run-xyz'))
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await getTestRunById(c, '/data')

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('defaults to empty string runId when param is missing', async () => {
    vi.mocked(queryTestRunDetails).mockRejectedValue(new Error('Test run not found: '))
    const { c, jsonMock } = makeMockContext()

    await getTestRunById(c, '/data')

    expect(vi.mocked(queryTestRunDetails)).toHaveBeenCalledWith('/data', '')
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Not found' }, 404)
  })

  it('re-throws unexpected errors', async () => {
    vi.mocked(queryTestRunDetails).mockRejectedValue(new Error('Database connection failed'))
    const { c } = makeMockContext({ param: { runId: 'run-abc' } })

    await expect(getTestRunById(c, '/data')).rejects.toThrow('Database connection failed')
  })

  it('re-throws non-Error throwable even if message matches "not found" pattern (EC3)', async () => {
    vi.mocked(queryTestRunDetails).mockRejectedValue('Test run not found: run-xyz')
    const { c, jsonMock } = makeMockContext({ param: { runId: 'run-xyz' } })

    await expect(getTestRunById(c, '/data')).rejects.toBe('Test run not found: run-xyz')
    expect(jsonMock).not.toHaveBeenCalled()
  })
})
