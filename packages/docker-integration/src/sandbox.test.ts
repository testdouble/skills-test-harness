import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DockerError } from './errors.js'

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
  it('resolves when sandbox is found in docker ls output', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('claude-skills-harness\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).resolves.toBeUndefined()
  })

  it('throws DockerError when sandbox is not found', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('some-other-sandbox\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow(DockerError)
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
