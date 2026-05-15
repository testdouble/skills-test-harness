import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SandboxError } from './errors.js'

function makeStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (content) controller.enqueue(new TextEncoder().encode(content))
      controller.close()
    },
  })
}

beforeEach(() => {
  vi.stubGlobal('Bun', {
    spawn: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ensureSandboxExists', () => {
  it('resolves when sandbox is found in sbx ls output', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('claude-skills-harness\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).resolves.toBeUndefined()
  })

  it('throws SandboxError when sandbox is not found', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('some-other-sandbox\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow(SandboxError)
  })

  it('throws SandboxError when sbx ls exits non-zero', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(''),
      stderr: makeStream('not logged in'),
      exited: Promise.resolve(),
      exitCode: 1,
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow(/sbx login/)
  })

  it('throws SandboxError when sbx is missing', async () => {
    const error = new Error('spawn sbx ENOENT') as Error & { code: string }
    error.code = 'ENOENT'
    ;(globalThis as any).Bun.spawn.mockImplementation(() => {
      throw error
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow(/sbx CLI was not found/)
  })
})

describe('execInSandbox', () => {
  it('returns SandboxResult with exitCode, stdout, and stderr', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('sandbox output'),
      stderr: makeStream('stderr output'),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    const result = await execInSandbox('/path/to/script', ['--print', 'hello'], null, false)

    expect((globalThis as any).Bun.spawn).toHaveBeenCalledWith(
      ['sbx', 'exec', 'claude-skills-harness', '/path/to/script', '', '--print', 'hello'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' }),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('sandbox output')
    expect(result.stderr).toBe('stderr output')
  })

  it('streams stdout to process.stdout when debug is true', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('debug output'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    await execInSandbox('/path/to/script', ['--print', 'hello'], null, true)

    expect(stdoutSpy).toHaveBeenCalledWith('debug output')
    stdoutSpy.mockRestore()
  })

  it('does not stream to process.stdout when debug is false', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('silent output'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    await execInSandbox('/path/to/script', ['--print', 'hello'], null, false)

    expect(stdoutSpy).not.toHaveBeenCalled()
    stdoutSpy.mockRestore()
  })

  it('defaults exitCode to 1 when proc.exitCode is null', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(''),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: null,
    })

    const { execInSandbox } = await import('./sandbox.js')
    const result = await execInSandbox('/path/to/script', [], null, false)

    expect(result.exitCode).toBe(1)
  })
})
