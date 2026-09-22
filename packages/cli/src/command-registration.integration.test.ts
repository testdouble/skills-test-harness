import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const entryPoint = fileURLToPath(new URL('../index.ts', import.meta.url))

function runCli(...args: string[]): { status: number; output: string } {
  return runCliWithEnv(process.env, ...args)
}

function runCliWithEnv(env: NodeJS.ProcessEnv, ...args: string[]): { status: number; output: string } {
  const result = spawnSync('bun', [entryPoint, ...args], { encoding: 'utf8', env })
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` }
}

/**
 * Yargs lists each registered command as `skillwalker <name>` in its help output.
 * Reading the command column rather than the whole page keeps a command's
 * description from being mistaken for a registration.
 */
function topLevelCommandNames(helpOutput: string): string[] {
  return helpOutput
    .split('\n')
    .map((line) => /^\s{2}skillwalker (\S+)/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
}

describe('top-level command registration', () => {
  it('registers sandbox as a top-level command', () => {
    const { output } = runCli('--help')
    expect(topLevelCommandNames(output)).toContain('sandbox')
  })

  it('no longer registers the flat sandbox command names', () => {
    const names = topLevelCommandNames(runCli('--help').output)
    expect(names).not.toContain('clean')
    expect(names).not.toContain('shell')
    expect(names).not.toContain('sandbox-setup')
  })

  it('rejects a removed flat command name', () => {
    const { status, output } = runCli('clean')
    expect(status).toBe(1)
    expect(output).toContain('Unknown argument: clean')
  })
})

describe('sandbox sub-command registration', () => {
  it('lists all four sub-commands and fails when none is given', () => {
    const { status, output } = runCli('sandbox')
    expect(status).toBe(1)
    expect(output).toContain('skillwalker sandbox create')
    expect(output).toContain('skillwalker sandbox update')
    expect(output).toContain('skillwalker sandbox clean')
    expect(output).toContain('skillwalker sandbox shell')
  })

  it('rejects an unknown sub-command', () => {
    const { status, output } = runCli('sandbox', 'bogus')
    expect(status).toBe(1)
    expect(output).toContain('Unknown argument: bogus')
  })
})

describe('command handler errors', () => {
  it('prints a domain error as a single Error line without help text', () => {
    const { status, output } = runCli('test-eval', 'no-such-run-id')
    expect(status).toBe(1)
    expect(output).toMatch(/^Error: Test run directory not found:/m)
    expect(output).not.toContain('Options:')
    expect(output).not.toContain('RunNotFoundError')
  })

  describe('when sbx fails', () => {
    let fakeBinDir: string

    beforeEach(async () => {
      fakeBinDir = await mkdtemp(path.join(tmpdir(), 'skillwalker-fake-sbx-'))
      const fakeSbx = path.join(fakeBinDir, 'sbx')
      await writeFile(fakeSbx, '#!/bin/sh\necho "You are not logged in." >&2\nexit 1\n', 'utf8')
      await chmod(fakeSbx, 0o755)
    })

    afterEach(async () => {
      await rm(fakeBinDir, { recursive: true, force: true })
    })

    it('prints a sandbox error as a single Error line without help text or a stack trace', () => {
      const env = { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` }

      const { status, output } = runCliWithEnv(env, 'sandbox', 'shell')

      expect(status).toBe(1)
      expect(output).toMatch(/^Error: Unable to list sandboxes with sbx/m)
      expect(output).not.toContain('Options:')
      expect(output).not.toMatch(/^\s+at /m)
    })
  })
})
