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
      ['sbx', 'rm', '--force', 'claude-skills-skillwalker'],
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
      stdout: makeStream('claude-skills-skillwalker\n'),
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
        exitCode: 0,
      })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')
    await createSandbox('/repo/root')

    expect((globalThis as any).Bun.spawn).toHaveBeenCalledTimes(2)
    const runArgs = (globalThis as any).Bun.spawn.mock.calls[1][0]
    expect(runArgs).toEqual(['sbx', 'run', '--name', 'claude-skills-skillwalker', 'claude', '/repo/root'])

    stderrSpy.mockRestore()
  })

  it('throws SandboxError and does not report the sandbox ready when sbx run fails', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce({
        stdout: makeStream('other-sandbox\n'),
        stderr: makeStream(''),
        exited: Promise.resolve(),
        exitCode: 0,
      })
      .mockReturnValueOnce({
        exited: Promise.resolve(),
        exitCode: 1,
      })
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')

    await expect(createSandbox('/repo/root')).rejects.toBeInstanceOf(SandboxError)
    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('is ready'))
  })

  function stubNoSandboxThenRun() {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce({
        stdout: makeStream('other-sandbox\n'),
        stderr: makeStream(''),
        exited: Promise.resolve(),
        exitCode: 0,
      })
      .mockReturnValueOnce({
        exited: Promise.resolve(),
        exitCode: 0,
      })
  }

  it('mounts extra workspaces read-only after the repo root', async () => {
    stubNoSandboxThenRun()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')
    await createSandbox('/repo/root', ['/skillwalker/build'])

    const runArgs = (globalThis as any).Bun.spawn.mock.calls[1][0]
    expect(runArgs).toEqual([
      'sbx',
      'run',
      '--name',
      'claude-skills-skillwalker',
      'claude',
      '/repo/root',
      '/skillwalker/build:ro',
    ])
  })

  it('skips extra workspaces already inside the repo root', async () => {
    stubNoSandboxThenRun()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { createSandbox } = await import('./lifecycle.js')
    await createSandbox('/repo/root', ['/repo/root/build', '/repo/root-sibling'])

    const runArgs = (globalThis as any).Bun.spawn.mock.calls[1][0]
    expect(runArgs).toEqual([
      'sbx',
      'run',
      '--name',
      'claude-skills-skillwalker',
      'claude',
      '/repo/root',
      '/repo/root-sibling:ro',
    ])
  })
})

describe('updateSandbox', () => {
  const templateList = [
    'REPOSITORY                 TAG                  IMAGE ID       FLAVOR               CREATED',
    'docker/sandbox-templates   claude-code-docker   6f873d7e6093   claude-code-docker   4 months ago',
    'docker/sandbox-templates   claude-code-docker   94670d5b2a24   claude-code-docker   4 months ago',
    'docker/sandbox-templates   codex-docker         aaaaaaaaaaaa   codex-docker         4 months ago',
    'myimage                    claude-code-custom   bbbbbbbbbbbb   custom               1 day ago',
    '',
  ].join('\n')

  function makeCapturedProc(stdout: string, exitCode = 0) {
    return { stdout: makeStream(stdout), stderr: makeStream(''), exited: Promise.resolve(), exitCode }
  }

  function spawnedArgs(): string[][] {
    return (globalThis as any).Bun.spawn.mock.calls.map((call: unknown[]) => call[0])
  }

  it('removes the sandbox and cached Claude Code templates, then creates a new sandbox', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce(makeCapturedProc('claude-skills-skillwalker\n'))
      .mockReturnValueOnce(makeCapturedProc(''))
      .mockReturnValueOnce(makeCapturedProc(templateList))
      .mockReturnValueOnce(makeCapturedProc(''))
      .mockReturnValueOnce(makeCapturedProc(''))
      .mockReturnValueOnce(makeCapturedProc(''))
      .mockReturnValueOnce({ exited: Promise.resolve(), exitCode: 0 })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { updateSandbox } = await import('./lifecycle.js')
    await updateSandbox('/repo/root', ['/skillwalker/build'])

    expect(spawnedArgs()).toEqual([
      ['sbx', 'ls', '--quiet'],
      ['sbx', 'rm', '--force', 'claude-skills-skillwalker'],
      ['sbx', 'template', 'ls'],
      ['sbx', 'template', 'rm', '6f873d7e6093'],
      ['sbx', 'template', 'rm', '94670d5b2a24'],
      ['sbx', 'ls', '--quiet'],
      ['sbx', 'run', '--name', 'claude-skills-skillwalker', 'claude', '/repo/root', '/skillwalker/build:ro'],
    ])

    stderrSpy.mockRestore()
  })

  it('skips sandbox removal when no sandbox exists', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce(makeCapturedProc(templateList.split('\n')[0]))
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce({ exited: Promise.resolve(), exitCode: 0 })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { updateSandbox } = await import('./lifecycle.js')
    await updateSandbox('/repo/root')

    expect(spawnedArgs()).toEqual([
      ['sbx', 'ls', '--quiet'],
      ['sbx', 'template', 'ls'],
      ['sbx', 'ls', '--quiet'],
      ['sbx', 'run', '--name', 'claude-skills-skillwalker', 'claude', '/repo/root'],
    ])

    stderrSpy.mockRestore()
  })

  it('continues when a template image was already removed along with an earlier one', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce(makeCapturedProc(templateList))
      .mockReturnValueOnce(makeCapturedProc(''))
      .mockReturnValueOnce(makeCapturedProc("ERROR: sandboxd error: status 404: no template image '94670d5b2a24'", 1))
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce({ exited: Promise.resolve(), exitCode: 0 })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { updateSandbox } = await import('./lifecycle.js')
    await updateSandbox('/repo/root')

    expect(spawnedArgs().at(-1)).toEqual(['sbx', 'run', '--name', 'claude-skills-skillwalker', 'claude', '/repo/root'])

    stderrSpy.mockRestore()
  })

  it('throws SandboxError when a template image cannot be removed', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce(makeCapturedProc(templateList))
      .mockReturnValueOnce(makeCapturedProc('image in use', 1))

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { updateSandbox } = await import('./lifecycle.js')
    await expect(updateSandbox('/repo/root')).rejects.toThrow(SandboxError)

    stderrSpy.mockRestore()
  })

  it('throws SandboxError when template listing fails', async () => {
    ;(globalThis as any).Bun.spawn
      .mockReturnValueOnce(makeCapturedProc('other-sandbox\n'))
      .mockReturnValueOnce(makeCapturedProc('not logged in', 1))

    const { updateSandbox } = await import('./lifecycle.js')
    await expect(updateSandbox('/repo/root')).rejects.toThrow(SandboxError)
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
    expect(args).toEqual(['sbx', 'exec', '-it', 'claude-skills-skillwalker', 'bash'])
  })
})
