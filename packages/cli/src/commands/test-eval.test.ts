import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-execution', () => ({
  runTestEval: vi.fn(),
  exitWithResult: vi.fn(),
}))
vi.mock('../paths.js', () => ({
  outputDir: '/mock-output',
  testsDir: '/mock-tests',
}))

import { exitWithResult, runTestEval } from '@testdouble/harness-execution'
import { builder, command, describe as commandDescribe, handler } from './test-eval.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runTestEval).mockResolvedValue(undefined)
  vi.mocked(exitWithResult).mockImplementation((() => {}) as any)
})

describe('test-eval command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('test-eval [test_run_id]')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('test-eval builder', () => {
  it('configures test_run_id as a string positional', () => {
    const positionals: Record<string, unknown> = {}
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      positional(name: string, opts: unknown) {
        positionals[name] = opts
        return fakeYargs
      },
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    expect(positionals.test_run_id).toMatchObject({ type: 'string' })
  })
})

describe('test-eval handler', () => {
  it('calls runTestEval with correct options', async () => {
    await handler({ test_run_id: 'run-abc', debug: false })

    expect(vi.mocked(runTestEval)).toHaveBeenCalledWith({
      testRunId: 'run-abc',
      debug: false,
      outputDir: '/mock-output',
      testsDir: '/mock-tests',
    })
  })

  it('passes undefined testRunId when not provided', async () => {
    await handler({ test_run_id: undefined, debug: false })

    expect(vi.mocked(runTestEval)).toHaveBeenCalledWith(expect.objectContaining({ testRunId: undefined }))
  })

  it('always exits with 0', async () => {
    await handler({ test_run_id: 'run-1', debug: false })
    expect(vi.mocked(exitWithResult)).toHaveBeenCalledWith(0)
  })
})
