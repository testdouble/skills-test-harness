import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-execution', () => ({
  runScilLoop: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../paths.js', () => ({
  outputDir: '/mock/output',
  testsDir: '/mock/tests',
}))

import { runScilLoop } from '@testdouble/harness-execution'
import { builder, command, describe as commandDescribe, handler } from './scil.js'

beforeEach(() => {
  vi.clearAllMocks()
})

function fullArgv(): Record<string, unknown> {
  return {
    suite: 'my-suite',
    skill: 'plugin:skill',
    'max-iterations': 10,
    holdout: 0.2,
    concurrency: 4,
    'runs-per-query': 3,
    model: 'sonnet',
    debug: true,
    apply: true,
    'repo-root': '/mock/repo',
  }
}

describe('scil command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('scil')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('scil builder', () => {
  function buildOptions() {
    const options: Record<string, unknown> = {}
    const fakeYargs = {
      option(name: string, opts: unknown) {
        options[name] = opts
        return fakeYargs
      },
    } as any
    builder(fakeYargs)
    return options
  }

  it('configures suite as a required string option', () => {
    const options = buildOptions()
    expect(options.suite).toMatchObject({ type: 'string', demandOption: true })
  })

  it('configures max-iterations with default 5', () => {
    const options = buildOptions()
    expect(options['max-iterations']).toMatchObject({ type: 'number', default: 5 })
  })

  it('configures holdout with default 0', () => {
    const options = buildOptions()
    expect(options.holdout).toMatchObject({ type: 'number', default: 0 })
  })

  it('configures concurrency with default 1', () => {
    const options = buildOptions()
    expect(options.concurrency).toMatchObject({ type: 'number', default: 1 })
  })

  it('configures runs-per-query with default 1', () => {
    const options = buildOptions()
    expect(options['runs-per-query']).toMatchObject({ type: 'number', default: 1 })
  })

  it('configures model with default opus', () => {
    const options = buildOptions()
    expect(options.model).toMatchObject({ type: 'string', default: 'opus' })
  })

  it('configures debug with default false', () => {
    const options = buildOptions()
    expect(options.debug).toMatchObject({ type: 'boolean', default: false })
  })

  it('configures apply with default false', () => {
    const options = buildOptions()
    expect(options.apply).toMatchObject({ type: 'boolean', default: false })
  })

  it('configures skill as an optional string', () => {
    const options = buildOptions()
    expect(options.skill).toMatchObject({ type: 'string' })
    expect(options.skill).not.toHaveProperty('demandOption')
  })

  it('configures repo-root with default process.cwd()', () => {
    const options = buildOptions()
    expect(options['repo-root']).toMatchObject({ type: 'string', default: process.cwd() })
  })
})

describe('scil handler', () => {
  it('maps argv keys to ScilConfig and calls runScilLoop', async () => {
    await handler(fullArgv())

    expect(runScilLoop).toHaveBeenCalledOnce()
    expect(runScilLoop).toHaveBeenCalledWith({
      suite: 'my-suite',
      skill: 'plugin:skill',
      maxIterations: 10,
      holdout: 0.2,
      concurrency: 4,
      runsPerQuery: 3,
      model: 'sonnet',
      debug: true,
      apply: true,
      outputDir: '/mock/output',
      testsDir: '/mock/tests',
      repoRoot: '/mock/repo',
    })
  })

  it('passes skill as undefined when not provided', async () => {
    const argv = fullArgv()
    argv.skill = undefined
    await handler(argv)

    const config = vi.mocked(runScilLoop).mock.calls[0][0]
    expect(config.skill).toBeUndefined()
  })
})
