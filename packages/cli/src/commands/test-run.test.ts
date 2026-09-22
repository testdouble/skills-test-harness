import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/skillwalker-execution', () => ({
  runEvals: vi.fn(),
  exitWithResult: vi.fn(),
}))
vi.mock('../paths.js', () => ({
  outputDir: '/mock/output',
  testsDir: '/mock/tests',
  getAllEvals: vi.fn(),
}))

import { exitWithResult, runEvals } from '@testdouble/skillwalker-execution'
import { getAllEvals } from '../paths.js'
import { builder, command, describe as commandDescribe, handler } from './test-run.js'

const mockResult = {
  testRunId: 'run-123',
  totalDurationMs: 100,
  totalInputTokens: 50,
  totalOutputTokens: 25,
  failures: 0,
}

const defaultArgv = {
  eval: 'my-eval',
  test: undefined,
  debug: false,
  'repo-root': '/mock/repo',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runEvals).mockResolvedValue(mockResult)
  vi.mocked(exitWithResult).mockImplementation((() => {}) as any)
  vi.mocked(getAllEvals).mockReturnValue(['eval-a', 'eval-b'])
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
  it('configures eval as an optional string option', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    expect(options.eval).toMatchObject({ type: 'string' })
    expect(options.eval).not.toHaveProperty('demandOption')
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

  it('configures repo-root as a string option defaulting to process.cwd()', () => {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    expect(options['repo-root']).toMatchObject({ type: 'string', default: process.cwd() })
  })
})

describe('test-run handler', () => {
  it('calls runEvals with correct options', async () => {
    await handler(defaultArgv)
    expect(vi.mocked(runEvals)).toHaveBeenCalledWith({
      evals: ['my-eval'],
      testFilter: undefined,
      debug: false,
      outputDir: '/mock/output',
      testsDir: '/mock/tests',
      repoRoot: '/mock/repo',
    })
  })

  it('passes test filter when provided', async () => {
    await handler({ ...defaultArgv, test: 'my-test' })
    expect(vi.mocked(runEvals)).toHaveBeenCalledWith(expect.objectContaining({ testFilter: 'my-test' }))
  })

  it('passes failures from result to exitWithResult', async () => {
    vi.mocked(runEvals).mockResolvedValue({ ...mockResult, failures: 3 })
    await handler(defaultArgv)
    expect(vi.mocked(exitWithResult)).toHaveBeenCalledWith(3)
  })

  it('runs all discovered evals when --eval is omitted', async () => {
    await handler({ ...defaultArgv, eval: undefined })
    expect(vi.mocked(getAllEvals)).toHaveBeenCalled()
    expect(vi.mocked(runEvals)).toHaveBeenCalledWith(expect.objectContaining({ evals: ['eval-a', 'eval-b'] }))
  })

  it('does not call getAllEvals when --eval is provided', async () => {
    await handler(defaultArgv)
    expect(vi.mocked(getAllEvals)).not.toHaveBeenCalled()
  })
})
