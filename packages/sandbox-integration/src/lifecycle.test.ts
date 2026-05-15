import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SandboxError } from './errors.js'

vi.mock('./sandbox.js', async (importActual) => ({
  ...(await importActual<typeof import('./sandbox.js')>()),
  ensureSandboxExists: vi.fn(),
}))

import { ensureSandboxExists } from './sandbox.js'

function makeStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (content) controller.enqueue(new TextEncoder().encode(content))
      controller.close()
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Bun', {
    spawn: vi.fn(),
  })
  vi.mocked(ensureSandboxExists).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('removeSandbox', () => {
  it('spawns sbx rm with the sandbox name', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream(''),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const { removeSandbox } = await import('./lifecycle.js')
    await removeSandbox()

    expect((globalThis as any).Bun.spawn).toHaveBeenCalledWith(
      ['sbx', 'rm', '--force', 'claude-skills-harness'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' }),
    )
  })

  it('throws SandboxError on non-zero exit code', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      stdout: makeStream('error output'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 1,
    })

    const { removeSandbox } = await import('./lifecycle.js')
    await expect(removeSandbox()).rejects.toThrow(SandboxError)
  })
})

describe('createSandbox', () => {
  it('returns early when sandbox already exists', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValueOnce({
      stdout: makeStream('claude-skills-harness\n'),
      stderr: makeStream(''),
      exited: Promise.resolve(),
      exitCode: 0,
    })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')
    await createSandbox('/repo/root')

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
    expect((globalThis as any).Bun.spawn).toHaveBeenCalledTimes(1)

    stderrSpy.mockRestore()
  })

  it('spawns interactive sandbox when one does not exist', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce({
        stdout: makeStream('other-sandbox\n'),
        stderr: makeStream(''),
        exited: Promise.resolve(),
        exitCode: 0,
      })
      .mockReturnValueOnce({
        exited: Promise.resolve(),
      })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')
    await createSandbox('/repo/root')

    expect((globalThis as any).Bun.spawn).toHaveBeenCalledTimes(2)
    const runArgs = (globalThis as any).Bun.spawn.mock.calls[1][0]
    expect(runArgs).toEqual(['sbx', 'run', '--name', 'claude-skills-harness', 'claude', '/repo/root'])

    stderrSpy.mockRestore()
  })
})

describe('openShell', () => {
  it('calls ensureSandboxExists before spawning', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      exited: Promise.resolve(),
    })

    const { openShell } = await import('./lifecycle.js')
    await openShell()

    expect(vi.mocked(ensureSandboxExists)).toHaveBeenCalled()
  })

  it('spawns interactive bash in the sandbox', async () => {
    ;(globalThis as any).Bun.spawn.mockReturnValue({
      exited: Promise.resolve(),
    })

    const { openShell } = await import('./lifecycle.js')
    await openShell()

    const args = (globalThis as any).Bun.spawn.mock.calls[0][0]
    expect(args).toEqual(['sbx', 'exec', '-it', 'claude-skills-harness', 'bash'])
  })
})
