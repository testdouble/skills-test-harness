import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-execution', () => ({
  runTestSuite: vi.fn(),
  exitWithResult: vi.fn(),
}))
vi.mock('../paths.js', () => ({
  outputDir: '/mock/output',
  testsDir: '/mock/tests',
  repoRoot: '/mock/repo',
  getAllTestSuites: vi.fn(),
}))

import { exitWithResult, runTestSuite } from '@testdouble/harness-execution'
import { getAllTestSuites } from '../paths.js'
import { builder, command, describe as commandDescribe, handler } from './test-run.js'

const mockResult = {
  testRunId: 'run-123',
  totalDurationMs: 100,
  totalInputTokens: 50,
  totalOutputTokens: 25,
  failures: 0,
}

const defaultArgv = {
  suite: 'my-suite',
  test: undefined,
  debug: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runTestSuite).mockResolvedValue(mockResult)
  vi.mocked(exitWithResult).mockImplementation((() => {}) as any)
  vi.mocked(getAllTestSuites).mockReturnValue(['suite-a', 'suite-b'])
})

describe('test-run command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('test-run')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('test-run builder', () => {
  it('configures suite as an optional string option', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    expect(options.suite).toMatchObject({ type: 'string' })
    expect(options.suite).not.toHaveProperty('demandOption')
  })

  it('configures debug with a boolean default of false', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    expect(options.debug).toMatchObject({ type: 'boolean', default: false })
  })
})

describe('test-run handler', () => {
  it('calls runTestSuite with correct options', async () => {
    await handler(defaultArgv)
    expect(vi.mocked(runTestSuite)).toHaveBeenCalledWith({
      suites: ['my-suite'],
      testFilter: undefined,
      debug: false,
      outputDir: '/mock/output',
      testsDir: '/mock/tests',
      repoRoot: '/mock/repo',
    })
  })

  it('passes test filter when provided', async () => {
    await handler({ ...defaultArgv, test: 'my-test' })
    expect(vi.mocked(runTestSuite)).toHaveBeenCalledWith(expect.objectContaining({ testFilter: 'my-test' }))
  })

  it('passes failures from result to exitWithResult', async () => {
    vi.mocked(runTestSuite).mockResolvedValue({ ...mockResult, failures: 3 })
    await handler(defaultArgv)
    expect(vi.mocked(exitWithResult)).toHaveBeenCalledWith(3)
  })

  it('runs all discovered suites when --suite is omitted', async () => {
    await handler({ ...defaultArgv, suite: undefined })
    expect(vi.mocked(getAllTestSuites)).toHaveBeenCalled()
    expect(vi.mocked(runTestSuite)).toHaveBeenCalledWith(expect.objectContaining({ suites: ['suite-a', 'suite-b'] }))
  })

  it('does not call getAllTestSuites when --suite is provided', async () => {
    await handler(defaultArgv)
    expect(vi.mocked(getAllTestSuites)).not.toHaveBeenCalled()
  })
})
