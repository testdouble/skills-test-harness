import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile:  vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink:    vi.fn().mockResolvedValue(undefined),
}))

import { readFile, writeFile, unlink } from 'node:fs/promises'
import { getReEvaluatedRuns, markAsReEvaluated, clearReEvaluatedRuns } from './re-eval-marker.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getReEvaluatedRuns', () => {
  it('returns parsed array from marker file', async () => {
    vi.mocked(readFile).mockResolvedValue('["run-1","run-2"]' as any)
    const result = await getReEvaluatedRuns('/output')
    expect(result).toEqual(['run-1', 'run-2'])
  })

  it('returns empty array when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await getReEvaluatedRuns('/output')
    expect(result).toEqual([])
  })
})

describe('markAsReEvaluated', () => {
  it('adds runId to existing list', async () => {
    vi.mocked(readFile).mockResolvedValue('["run-1"]' as any)
    await markAsReEvaluated('/output', 'run-2')
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining('.re-evaluated-runs.json'),
      '["run-1","run-2"]',
      'utf8'
    )
  })

  it('does not duplicate existing runId', async () => {
    vi.mocked(readFile).mockResolvedValue('["run-1"]' as any)
    await markAsReEvaluated('/output', 'run-1')
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled()
  })

  it('creates new file when none exists', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    await markAsReEvaluated('/output', 'run-1')
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining('.re-evaluated-runs.json'),
      '["run-1"]',
      'utf8'
    )
  })
})

describe('clearReEvaluatedRuns', () => {
  it('removes specified runIds from the list', async () => {
    vi.mocked(readFile).mockResolvedValue('["run-1","run-2","run-3"]' as any)
    await clearReEvaluatedRuns('/output', ['run-1', 'run-3'])
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining('.re-evaluated-runs.json'),
      '["run-2"]',
      'utf8'
    )
  })

  it('deletes file when all runs are cleared', async () => {
    vi.mocked(readFile).mockResolvedValue('["run-1"]' as any)
    await clearReEvaluatedRuns('/output', ['run-1'])
    expect(vi.mocked(unlink)).toHaveBeenCalled()
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled()
  })

  it('does nothing when runIds array is empty', async () => {
    await clearReEvaluatedRuns('/output', [])
    expect(vi.mocked(readFile)).not.toHaveBeenCalled()
  })
})
