import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { HarnessError } = vi.hoisted(() => {
  class HarnessError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'HarnessError'
    }
  }
  return { HarnessError }
})

vi.mock('@testdouble/harness-execution', () => ({
  HarnessError,
  runAcilLoop: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../paths.js', () => ({
  outputDir: '/mock/output',
  testsDir: '/mock/tests',
  repoRoot: '/mock/repo',
}))

import { handler, command, describe as commandDescribe, builder } from './acil.js'
import { runAcilLoop } from '@testdouble/harness-execution'

beforeEach(() => {
  vi.clearAllMocks()
})

function fullArgv(): Record<string, unknown> {
  return {
    suite:                'my-suite',
    agent:                'plugin:agent',
    'max-iterations':     10,
    holdout:              0.2,
    concurrency:          4,
    'runs-per-query':     3,
    model:                'sonnet',
    debug:                true,
    apply:                true,
  }
}

describe('acil command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('acil')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('acil builder', () => {
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
    expect(options['suite']).toMatchObject({ type: 'string', demandOption: true })
  })

  it('configures max-iterations with default 5', () => {
    const options = buildOptions()
    expect(options['max-iterations']).toMatchObject({ type: 'number', default: 5 })
  })

  it('configures holdout with default 0', () => {
    const options = buildOptions()
    expect(options['holdout']).toMatchObject({ type: 'number', default: 0 })
  })

  it('configures concurrency with default 1', () => {
    const options = buildOptions()
    expect(options['concurrency']).toMatchObject({ type: 'number', default: 1 })
  })

  it('configures runs-per-query with default 1', () => {
    const options = buildOptions()
    expect(options['runs-per-query']).toMatchObject({ type: 'number', default: 1 })
  })

  it('configures model with default opus', () => {
    const options = buildOptions()
    expect(options['model']).toMatchObject({ type: 'string', default: 'opus' })
  })

  it('configures debug with default false', () => {
    const options = buildOptions()
    expect(options['debug']).toMatchObject({ type: 'boolean', default: false })
  })

  it('configures apply with default false', () => {
    const options = buildOptions()
    expect(options['apply']).toMatchObject({ type: 'boolean', default: false })
  })

  it('configures agent as an optional string', () => {
    const options = buildOptions()
    expect(options['agent']).toMatchObject({ type: 'string' })
    expect(options['agent']).not.toHaveProperty('demandOption')
  })
})

describe('acil handler', () => {
  it('maps argv keys to AcilConfig and calls runAcilLoop', async () => {
    await handler(fullArgv())

    expect(runAcilLoop).toHaveBeenCalledOnce()
    expect(runAcilLoop).toHaveBeenCalledWith({
      suite:             'my-suite',
      agent:             'plugin:agent',
      maxIterations:     10,
      holdout:           0.2,
      concurrency:       4,
      runsPerQuery:      3,
      model:             'sonnet',
      debug:             true,
      apply:             true,
      outputDir:         '/mock/output',
      testsDir:          '/mock/tests',
      repoRoot:          '/mock/repo',
    })
  })

  it('passes agent as undefined when not provided', async () => {
    const argv = fullArgv()
    argv.agent = undefined
    await handler(argv)

    const config = vi.mocked(runAcilLoop).mock.calls[0][0]
    expect(config.agent).toBeUndefined()
  })

  it('propagates errors from runAcilLoop', async () => {
    const error = new Error('loop failed')
    vi.mocked(runAcilLoop).mockRejectedValueOnce(error)
    await expect(handler(fullArgv())).rejects.toThrow('loop failed')
  })
})

describe('acil handler validation', () => {
  it('throws HarnessError for validation failures (EC8)', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = 0
    await expect(handler(argv)).rejects.toBeInstanceOf(HarnessError)
  })

  // -- max-iterations --

  it('rejects --max-iterations of 0', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = 0
    await expect(handler(argv)).rejects.toThrow('--max-iterations must be a finite number >= 1')
  })

  it('rejects negative --max-iterations', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = -3
    await expect(handler(argv)).rejects.toThrow('--max-iterations must be a finite number >= 1')
  })

  it('accepts --max-iterations of exactly 1', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = 1
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  it('rejects NaN --max-iterations (EC1)', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = NaN
    await expect(handler(argv)).rejects.toThrow('--max-iterations must be a finite number >= 1')
  })

  it('rejects Infinity --max-iterations (EC5)', async () => {
    const argv = fullArgv()
    argv['max-iterations'] = Infinity
    await expect(handler(argv)).rejects.toThrow('--max-iterations must be a finite number >= 1')
  })

  // -- runs-per-query --

  it('rejects --runs-per-query of 0', async () => {
    const argv = fullArgv()
    argv['runs-per-query'] = 0
    await expect(handler(argv)).rejects.toThrow('--runs-per-query must be a finite number >= 1')
  })

  it('rejects negative --runs-per-query', async () => {
    const argv = fullArgv()
    argv['runs-per-query'] = -1
    await expect(handler(argv)).rejects.toThrow('--runs-per-query must be a finite number >= 1')
  })

  it('accepts --runs-per-query of exactly 1', async () => {
    const argv = fullArgv()
    argv['runs-per-query'] = 1
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  it('rejects NaN --runs-per-query (EC3)', async () => {
    const argv = fullArgv()
    argv['runs-per-query'] = NaN
    await expect(handler(argv)).rejects.toThrow('--runs-per-query must be a finite number >= 1')
  })

  it('rejects Infinity --runs-per-query', async () => {
    const argv = fullArgv()
    argv['runs-per-query'] = Infinity
    await expect(handler(argv)).rejects.toThrow('--runs-per-query must be a finite number >= 1')
  })

  // -- concurrency --

  it('rejects --concurrency of 0 (EC4)', async () => {
    const argv = fullArgv()
    argv.concurrency = 0
    await expect(handler(argv)).rejects.toThrow('--concurrency must be a finite number >= 1')
  })

  it('rejects negative --concurrency', async () => {
    const argv = fullArgv()
    argv.concurrency = -2
    await expect(handler(argv)).rejects.toThrow('--concurrency must be a finite number >= 1')
  })

  it('rejects NaN --concurrency', async () => {
    const argv = fullArgv()
    argv.concurrency = NaN
    await expect(handler(argv)).rejects.toThrow('--concurrency must be a finite number >= 1')
  })

  it('rejects Infinity --concurrency', async () => {
    const argv = fullArgv()
    argv.concurrency = Infinity
    await expect(handler(argv)).rejects.toThrow('--concurrency must be a finite number >= 1')
  })

  it('accepts --concurrency of 1', async () => {
    const argv = fullArgv()
    argv.concurrency = 1
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  // -- holdout --

  it('rejects --holdout of 1.0', async () => {
    const argv = fullArgv()
    argv.holdout = 1.0
    await expect(handler(argv)).rejects.toThrow('--holdout must be >= 0 and < 1.0')
  })

  it('rejects negative --holdout', async () => {
    const argv = fullArgv()
    argv.holdout = -0.1
    await expect(handler(argv)).rejects.toThrow('--holdout must be >= 0 and < 1.0')
  })

  it('accepts --holdout of 0', async () => {
    const argv = fullArgv()
    argv.holdout = 0
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  it('accepts --holdout of 0.99', async () => {
    const argv = fullArgv()
    argv.holdout = 0.99
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  it('rejects NaN --holdout (EC2)', async () => {
    const argv = fullArgv()
    argv.holdout = NaN
    await expect(handler(argv)).rejects.toThrow('--holdout must be >= 0 and < 1.0')
  })

  // -- agent format --

  it('rejects --agent without colon separator', async () => {
    const argv = fullArgv()
    argv.agent = 'no-colon'
    await expect(handler(argv)).rejects.toThrow('--agent must be in plugin:agent format')
  })

  it('rejects --agent with empty plugin name', async () => {
    const argv = fullArgv()
    argv.agent = ':agent'
    await expect(handler(argv)).rejects.toThrow('--agent must be in plugin:agent format')
  })

  it('rejects --agent with empty agent name', async () => {
    const argv = fullArgv()
    argv.agent = 'plugin:'
    await expect(handler(argv)).rejects.toThrow('--agent must be in plugin:agent format')
  })

  it('accepts valid --agent in plugin:agent format', async () => {
    const argv = fullArgv()
    argv.agent = 'r-and-d:my-agent'
    await handler(argv)
    expect(runAcilLoop).toHaveBeenCalledOnce()
  })

  it('rejects --agent with uppercase characters', async () => {
    const argv = fullArgv()
    argv.agent = 'MyPlugin:MyAgent'
    await expect(handler(argv)).rejects.toThrow('--agent must be in plugin:agent format')
  })

  // -- non-TTY environment --

  describe('non-TTY environment', () => {
    const originalIsTTY = process.stdin.isTTY

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true })
    })

    it('rejects when stdin is not a TTY and --apply is false', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, writable: true })
      const argv = fullArgv()
      argv.apply = false
      await expect(handler(argv)).rejects.toThrow('Non-interactive environment detected')
    })

    it('rejects when stdin.isTTY is false and --apply is false (EC14)', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true })
      const argv = fullArgv()
      argv.apply = false
      await expect(handler(argv)).rejects.toThrow('Non-interactive environment detected')
    })

    it('allows non-TTY stdin when --apply is true', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, writable: true })
      const argv = fullArgv()
      argv.apply = true
      await handler(argv)
      expect(runAcilLoop).toHaveBeenCalledOnce()
    })
  })
})
