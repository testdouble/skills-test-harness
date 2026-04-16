import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@testdouble/docker-integration', () => ({
  removeSandbox: vi.fn(),
  SANDBOX_NAME: 'claude-skills-harness',
  DockerError: class DockerError extends Error {
    exitCode: number | null
    constructor(message: string, exitCode: number | null) {
      super(message)
      this.name = 'DockerError'
      this.exitCode = exitCode
    }
  },
}))

import { removeSandbox, DockerError } from '@testdouble/docker-integration'
import { handler, command, describe as commandDescribe } from './clean.js'
import { HarnessError } from '@testdouble/harness-execution'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(removeSandbox).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('clean command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('clean')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('clean handler', () => {
  it('calls removeSandbox', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handler()
    expect(vi.mocked(removeSandbox)).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('logs success message on successful removal', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handler()
    expect(logSpy).toHaveBeenCalledWith('Removed sandbox: claude-skills-harness')
    logSpy.mockRestore()
  })

  it('throws HarnessError when removeSandbox throws DockerError', async () => {
    vi.mocked(removeSandbox).mockRejectedValue(new DockerError('Docker sandbox rm failed (exit code 1): error output', 1))

    await expect(handler()).rejects.toThrow(HarnessError)
  })
})
