import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const entryPoint = fileURLToPath(new URL('../index.ts', import.meta.url))

function runCli(...args: string[]): { status: number; output: string } {
  const result = spawnSync('bun', [entryPoint, ...args], { encoding: 'utf8' })
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
  it('lists all three sub-commands and fails when none is given', () => {
    const { status, output } = runCli('sandbox')
    expect(status).toBe(1)
    expect(output).toContain('skillwalker sandbox create')
    expect(output).toContain('skillwalker sandbox clean')
    expect(output).toContain('skillwalker sandbox shell')
  })

  it('rejects an unknown sub-command', () => {
    const { status, output } = runCli('sandbox', 'bogus')
    expect(status).toBe(1)
    expect(output).toContain('Unknown argument: bogus')
  })
})
