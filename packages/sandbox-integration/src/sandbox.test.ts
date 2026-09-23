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

function makeSandboxList(sandboxes: { name: string; workspaces: string[] }[]): string {
  return JSON.stringify({ sandboxes })
}

function mockSbxLs(stdout: string) {
  ;(globalThis as any).Bun.spawn.mockReturnValue({
    stdout: makeStream(stdout),
    stderr: makeStream(''),
    exited: Promise.resolve(),
    exitCode: 0,
  })
}

describe('ensureSandboxExists', () => {
  it('resolves when sandbox is found in sbx ls --json output', async () => {
    mockSbxLs(makeSandboxList([{ name: 'claude-skills-skillwalker', workspaces: ['/repo'] }]))

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).resolves.toBeUndefined()
    expect((globalThis as any).Bun.spawn.mock.calls[0][0]).toEqual(['sbx', 'ls', '--json'])
  })

  it('throws SandboxError when sandbox is not found', async () => {
    mockSbxLs(makeSandboxList([{ name: 'some-other-sandbox', workspaces: ['/repo'] }]))

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow(SandboxError)
  })

  it('throws the not-found SandboxError when sbx lists no sandboxes', async () => {
    mockSbxLs(JSON.stringify({ sandboxes: null }))

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow("Run 'skillwalker sandbox create' first.")
  })

  it('resolves when every required path is under a mounted workspace', async () => {
    mockSbxLs(
      makeSandboxList([{ name: 'claude-skills-skillwalker', workspaces: ['/target/repo', '/skillwalker/build'] }]),
    )

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists(['/target/repo/plugins', '/skillwalker/build'])).resolves.toBeUndefined()
  })

  it('treats a workspace listed with a :ro suffix as mounting its path', async () => {
    mockSbxLs(
      makeSandboxList([{ name: 'claude-skills-skillwalker', workspaces: ['/target/repo', '/skillwalker/build:ro'] }]),
    )

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists(['/skillwalker/build'])).resolves.toBeUndefined()
  })

  it('throws SandboxError naming the path and sandbox update when a required path is not mounted', async () => {
    mockSbxLs(makeSandboxList([{ name: 'claude-skills-skillwalker', workspaces: ['/target/repo'] }]))

    const { ensureSandboxExists } = await import('./sandbox.js')
    const result = ensureSandboxExists(['/skillwalker/build'])

    await expect(result).rejects.toThrow(SandboxError)
    await expect(result).rejects.toThrow(/does not mount \/skillwalker\/build.*sandbox update/s)
  })

  it('throws SandboxError when sbx ls exits non-zero', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(''),
      stderr: makeStream('not logged in'),
      exited: Promise.resolve(),
      exitCode: 1,
    })

    const { ensureSandboxExists } = await import('./sandbox.js')
    await expect(ensureSandboxExists()).rejects.toThrow('Run `sbx login`, then retry `skillwalker sandbox create`.')
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
      ['sbx', 'exec', 'claude-skills-skillwalker', '/path/to/script', '', '--print', 'hello'],
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

  it('throws SandboxError when sbx reports the command could not be started, despite exit code 0', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(
        'OCI runtime exec failed: executable file `/host/build/sandbox-run.sh` not found: No such file or directory\n',
      ),
      stderr: makeStream('Sandbox claude-skills-skillwalker started successfully\nINFO: Starting Docker daemon\n'),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    const result = execInSandbox('/host/build/sandbox-run.sh', [], null, false)

    await expect(result).rejects.toThrow(SandboxError)
    await expect(result).rejects.toThrow(/sandbox update/)
  })

  it('throws SandboxError when the exec failure is reported on stderr after other lines', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(''),
      stderr: makeStream('INFO: Starting Docker daemon\nOCI runtime exec failed: executable file not found\n'),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    await expect(execInSandbox('/path/to/script', [], null, false)).rejects.toThrow(SandboxError)
  })

  it('does not throw when the message appears mid-line in command output', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('{"text":"OCI runtime exec failed is a docker error"}\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { execInSandbox } = await import('./sandbox.js')
    const result = await execInSandbox('/path/to/script', [], null, false)

    expect(result.exitCode).toBe(0)
  })
})
