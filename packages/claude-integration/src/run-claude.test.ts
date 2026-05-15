import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/sandbox-integration', () => ({
  execInSandbox: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'output', stderr: '' }),
}))
vi.mock('@testdouble/bun-helpers', () => ({
  resolveRelativePath: vi.fn().mockReturnValue('/resolved/sandbox-run.sh'),
}))

import { execInSandbox } from '@testdouble/sandbox-integration'
import { runClaude } from './run-claude.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(execInSandbox).mockResolvedValue({ exitCode: 0, stdout: 'output', stderr: '' })
})

describe('runClaude', () => {
  it('calls execInSandbox with the sandbox-run script', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello' })

    const scriptArg = vi.mocked(execInSandbox).mock.calls[0][0]
    expect(scriptArg).toBe('/resolved/sandbox-run.sh')
  })

  it('builds claude args with required flags', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello' })

    const args = vi.mocked(execInSandbox).mock.calls[0][1]
    expect(args).toContain('--no-session-persistence')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--verbose')
    expect(args).toContain('--dangerously-skip-permissions')
  })

  it('includes model in args', async () => {
    await runClaude({ model: 'opus', prompt: 'hello' })

    const args = vi.mocked(execInSandbox).mock.calls[0][1]
    const modelIdx = args.indexOf('--model')
    expect(modelIdx).toBeGreaterThan(-1)
    expect(args[modelIdx + 1]).toBe('opus')
  })

  it('includes prompt as --print arg', async () => {
    await runClaude({ model: 'sonnet', prompt: 'test prompt' })

    const args = vi.mocked(execInSandbox).mock.calls[0][1]
    const printIdx = args.indexOf('--print')
    expect(printIdx).toBeGreaterThan(-1)
    expect(args[printIdx + 1]).toBe('test prompt')
  })

  it('passes pluginDirs as positional args for sandbox-run.sh to copy', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello', pluginDirs: ['/path/a', '/path/b'] })

    const args = vi.mocked(execInSandbox).mock.calls[0][1]
    // Plugin dirs are passed as: count, dir1, dir2, ..., then claude args
    expect(args[0]).toBe('2')
    expect(args[1]).toBe('/path/a')
    expect(args[2]).toBe('/path/b')
    // --plugin-dir flags are NOT in the args (sandbox-run.sh adds them after copying)
    expect(args.slice(3)).not.toContain('--plugin-dir')
  })

  it('passes scaffold to execInSandbox', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello', scaffold: '/scaffold/path' })

    const scaffoldArg = vi.mocked(execInSandbox).mock.calls[0][2]
    expect(scaffoldArg).toBe('/scaffold/path')
  })

  it('defaults scaffold to null', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello' })

    const scaffoldArg = vi.mocked(execInSandbox).mock.calls[0][2]
    expect(scaffoldArg).toBeNull()
  })

  it('passes debug flag to execInSandbox', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello', debug: true })

    const debugArg = vi.mocked(execInSandbox).mock.calls[0][3]
    expect(debugArg).toBe(true)
  })

  it('defaults debug to false', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello' })

    const debugArg = vi.mocked(execInSandbox).mock.calls[0][3]
    expect(debugArg).toBe(false)
  })

  it('defaults pluginDirs to empty (count 0, no dirs)', async () => {
    await runClaude({ model: 'sonnet', prompt: 'hello' })

    const args = vi.mocked(execInSandbox).mock.calls[0][1]
    expect(args[0]).toBe('0')
    expect(args).not.toContain('--plugin-dir')
  })

  it('returns the result from execInSandbox', async () => {
    vi.mocked(execInSandbox).mockResolvedValue({ exitCode: 42, stdout: 'test', stderr: 'err' })

    const result = await runClaude({ model: 'sonnet', prompt: 'hello' })

    expect(result).toEqual({ exitCode: 42, stdout: 'test', stderr: 'err' })
  })
})
