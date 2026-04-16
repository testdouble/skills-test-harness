import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  ensureOutputDir: vi.fn(),
  appendTestConfig: vi.fn(),
  appendTestRun: vi.fn(),
  buildTestCaseId: vi.fn(),
}))

import { ensureOutputDir, appendTestConfig, appendTestRun, buildTestCaseId } from '@testdouble/harness-data'
import { writeTestOutput } from './output.js'

const mockTest = {
  name: 'my test',
  promptFile: 'prompt.md',
  expect: [],
}

const mockEvents = [
  { type: 'system' as const, subtype: 'init' as const, session_id: 'abc' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buildTestCaseId).mockReturnValue('my-suite-my-test')
  vi.mocked(ensureOutputDir).mockResolvedValue(undefined)
  vi.mocked(appendTestConfig).mockResolvedValue(undefined)
  vi.mocked(appendTestRun).mockResolvedValue(undefined)
})

describe('writeTestOutput', () => {
  it('calls ensureOutputDir with runDir', async () => {
    await writeTestOutput('/output/run-1', 'run-1', 'my-suite', ['r-and-d'], mockTest as any, mockEvents as any)
    expect(vi.mocked(ensureOutputDir)).toHaveBeenCalledWith('/output/run-1')
  })

  it('calls appendTestConfig with runDir and assembled record', async () => {
    await writeTestOutput('/output/run-1', 'run-1', 'my-suite', ['r-and-d'], mockTest as any, mockEvents as any)
    expect(vi.mocked(appendTestConfig)).toHaveBeenCalledWith('/output/run-1', {
      test_run_id: 'run-1',
      suite: 'my-suite',
      plugins: ['r-and-d'],
      test: mockTest,
    })
  })

  it('calls buildTestCaseId with suite and test name', async () => {
    await writeTestOutput('/output/run-1', 'run-1', 'my-suite', ['r-and-d'], mockTest as any, mockEvents as any)
    expect(vi.mocked(buildTestCaseId)).toHaveBeenCalledWith('my-suite', 'my test')
  })

  it('calls appendTestRun with runDir, events, testRunId, and test case id from buildTestCaseId', async () => {
    vi.mocked(buildTestCaseId).mockReturnValue('my-suite-my-test')
    await writeTestOutput('/output/run-1', 'run-1', 'my-suite', ['r-and-d'], mockTest as any, mockEvents as any)
    expect(vi.mocked(appendTestRun)).toHaveBeenCalledWith('/output/run-1', mockEvents, 'run-1', 'my-suite-my-test')
  })
})
