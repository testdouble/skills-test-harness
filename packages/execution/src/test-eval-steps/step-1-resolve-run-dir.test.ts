import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveRunDir } from './step-1-resolve-run-dir.js'
import { RunNotFoundError } from '../lib/errors.js'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

import { stat } from 'node:fs/promises'
const mockStat = stat as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveRunDir', () => {
  it('returns the run directory path when it exists', async () => {
    mockStat.mockResolvedValue({})
    const result = await resolveRunDir('20260320T094845', '/mock/output')
    expect(result.runDir).toBe('/mock/output/20260320T094845')
  })

  it('calls stat on the expected path', async () => {
    mockStat.mockResolvedValue({})
    await resolveRunDir('my-run-id', '/mock/output')
    expect(mockStat).toHaveBeenCalledWith('/mock/output/my-run-id')
  })

  it('throws RunNotFoundError when directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'))

    await expect(resolveRunDir('missing-run', '/mock/output')).rejects.toThrow(RunNotFoundError)
    await expect(resolveRunDir('missing-run', '/mock/output')).rejects.toThrow('/mock/output/missing-run')
  })
})
