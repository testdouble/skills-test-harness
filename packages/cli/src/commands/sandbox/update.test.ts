import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/sandbox-integration', () => ({
  updateSandbox: vi.fn(),
  SandboxError: class SandboxError extends Error {
    exitCode: number | null
    constructor(message: string, exitCode: number | null) {
      super(message)
      this.name = 'SandboxError'
      this.exitCode = exitCode
    }
  },
}))

import { SandboxError, updateSandbox } from '@testdouble/sandbox-integration'
import { SkillwalkerError } from '@testdouble/skillwalker-execution'
import { builder, command, describe as commandDescribe, handler } from './update.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateSandbox).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sandbox update command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('update')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('sandbox update builder', () => {
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

  it('configures repo-root with default process.cwd()', () => {
    const options = buildOptions()
    expect(options['repo-root']).toMatchObject({ type: 'string', default: process.cwd() })
  })
})

describe('sandbox update handler', () => {
  it('calls updateSandbox with the resolved repo-root', async () => {
    await handler({ 'repo-root': '/repo/root' })
    expect(vi.mocked(updateSandbox)).toHaveBeenCalledWith('/repo/root')
  })

  it('throws SkillwalkerError when updateSandbox throws SandboxError', async () => {
    vi.mocked(updateSandbox).mockRejectedValue(new SandboxError('sbx template rm failed (exit code 1): in use', 1))

    await expect(handler({ 'repo-root': '/repo/root' })).rejects.toThrow(SkillwalkerError)
  })
})
