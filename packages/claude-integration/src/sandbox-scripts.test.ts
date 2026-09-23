import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveSandboxScripts } from './sandbox-scripts.js'

const packageDir = fileURLToPath(new URL('..', import.meta.url))

let scriptsDir: string

beforeEach(async () => {
  scriptsDir = await mkdtemp(path.join(tmpdir(), 'sandbox-scripts-'))
})

afterEach(async () => {
  await rm(scriptsDir, { recursive: true, force: true })
})

describe('resolveSandboxScripts', () => {
  it('uses the scripts bundled with the package when SKILLWALKER_SCRIPTS_DIR is unset', () => {
    const scripts = resolveSandboxScripts({})

    expect(scripts.runScript).toBe(path.join(packageDir, 'sandbox-run.sh'))
    expect(scripts.extractScript).toBe(path.join(packageDir, 'sandbox-extract.sh'))
    expect(scripts.scriptsDir).toBe(path.resolve(packageDir))
  })

  it('uses the scripts in SKILLWALKER_SCRIPTS_DIR when it is set', async () => {
    await writeFile(path.join(scriptsDir, 'sandbox-run.sh'), '')
    await writeFile(path.join(scriptsDir, 'sandbox-extract.sh'), '')

    const scripts = resolveSandboxScripts({ SKILLWALKER_SCRIPTS_DIR: scriptsDir })

    expect(scripts).toEqual({
      runScript: path.join(scriptsDir, 'sandbox-run.sh'),
      extractScript: path.join(scriptsDir, 'sandbox-extract.sh'),
      scriptsDir,
    })
  })

  it('resolves a relative SKILLWALKER_SCRIPTS_DIR to an absolute folder for the sandbox mount', async () => {
    await writeFile(path.join(scriptsDir, 'sandbox-run.sh'), '')
    await writeFile(path.join(scriptsDir, 'sandbox-extract.sh'), '')

    const scripts = resolveSandboxScripts({ SKILLWALKER_SCRIPTS_DIR: path.relative(process.cwd(), scriptsDir) })

    expect(scripts.scriptsDir).toBe(scriptsDir)
  })

  it('names SKILLWALKER_SCRIPTS_DIR when that folder is missing a script', async () => {
    await writeFile(path.join(scriptsDir, 'sandbox-run.sh'), '')

    expect(() => resolveSandboxScripts({ SKILLWALKER_SCRIPTS_DIR: scriptsDir })).toThrow(
      `SKILLWALKER_SCRIPTS_DIR is set to ${scriptsDir}, but it has no sandbox-extract.sh`,
    )
  })
})
