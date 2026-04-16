import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeResults } from './step-4-write-results.js'
import { appendTestResults } from '@testdouble/harness-data'
import type { TestResultRecord } from '@testdouble/harness-data'

vi.mock('@testdouble/harness-data', () => ({
  appendTestResults: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn(),
}))

import { unlink } from 'node:fs/promises'

const mockRecords: TestResultRecord[] = [
  { test_run_id: 'run-1', suite: 'code-review', test_name: 'my-test', expect_type: 'result-contains', expect_value: 'hello', passed: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(appendTestResults).mockResolvedValue(undefined)
})

describe('writeResults', () => {
  it('deletes existing test-results.jsonl before writing', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined)
    await writeResults('/output/run-1', mockRecords)
    expect(vi.mocked(unlink)).toHaveBeenCalledWith('/output/run-1/test-results.jsonl')
  })

  it('does not throw when test-results.jsonl does not exist', async () => {
    vi.mocked(unlink).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    await expect(writeResults('/output/run-1', mockRecords)).resolves.toBeUndefined()
  })

  it('calls appendTestResults with runDir and records', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined)
    await writeResults('/output/run-1', mockRecords)
    expect(vi.mocked(appendTestResults)).toHaveBeenCalledWith('/output/run-1', mockRecords)
  })

  it('calls appendTestResults after unlink', async () => {
    const callOrder: string[] = []
    vi.mocked(unlink).mockImplementation(async () => { callOrder.push('unlink') })
    vi.mocked(appendTestResults).mockImplementation(async () => { callOrder.push('appendTestResults') })

    await writeResults('/output/run-1', mockRecords)
    expect(callOrder).toEqual(['unlink', 'appendTestResults'])
  })
})
