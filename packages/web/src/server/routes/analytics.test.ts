import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/skillwalker-data', () => ({
  queryPerTest: vi.fn(),
}))

import { queryPerTest } from '@testdouble/skillwalker-data'
import { getPerTestAnalytics } from './analytics.js'

function makeMockContext(query?: Record<string, string | undefined>) {
  const jsonMock = vi.fn((data: unknown) => ({ data }))
  return {
    c: {
      json: jsonMock,
      req: {
        query: (key: string) => query?.[key],
      },
    } as any,
    jsonMock,
  }
}

const fixtureRows = [
  { test_run_id: 'run-1', eval: 'eval-a', test_name: 'test 1' },
  { test_run_id: 'run-2', eval: 'eval-b', test_name: 'test 2' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(queryPerTest).mockResolvedValue(fixtureRows as any)
})

describe('getPerTestAnalytics', () => {
  it('returns all rows when no eval filter is provided', async () => {
    const { c, jsonMock } = makeMockContext()
    await getPerTestAnalytics(c, '/data')
    const { rows } = jsonMock.mock.calls[0][0] as { rows: any[] }
    expect(rows).toHaveLength(2)
  })

  it('filters rows by eval when eval query param is provided', async () => {
    const { c, jsonMock } = makeMockContext({ eval: 'eval-a' })
    await getPerTestAnalytics(c, '/data')
    const { rows } = jsonMock.mock.calls[0][0] as { rows: any[] }
    expect(rows).toHaveLength(1)
    expect(rows[0].eval).toBe('eval-a')
  })

  it('returns empty rows when eval filter matches nothing', async () => {
    const { c, jsonMock } = makeMockContext({ eval: 'nonexistent-eval' })
    await getPerTestAnalytics(c, '/data')
    const { rows } = jsonMock.mock.calls[0][0] as { rows: any[] }
    expect(rows).toHaveLength(0)
  })

  it('passes dataDir to queryPerTest', async () => {
    const { c } = makeMockContext()
    await getPerTestAnalytics(c, '/custom-data')
    expect(vi.mocked(queryPerTest)).toHaveBeenCalledWith('/custom-data')
  })
})
