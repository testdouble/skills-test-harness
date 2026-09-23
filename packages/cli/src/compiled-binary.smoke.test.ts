import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTmpDir, writeRunFixture } from '@testdouble/skillwalker-data/src/analytics-test-helpers.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Runs the binaries `make build` produces. Unit tests stub the Bun runtime, so only
// a compiled binary can show the DuckDB native addon actually loads.
const buildDir = fileURLToPath(new URL('../../../build/', import.meta.url))
const cliBinary = path.join(buildDir, 'skillwalker')
const webBinary = path.join(buildDir, 'skillwalker-web')

const cliPackageVersion: string = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
).version

const TEST_RUN_ID = '20260101T100001'
const WEB_PORT = 39099

async function waitForServer(url: string, proc: ChildProcess, timeoutMs = 10000): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`skillwalker-web exited early with code ${proc.exitCode}`)
    try {
      return await fetch(url)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`skillwalker-web did not answer ${url} within ${timeoutMs}ms`)
}

/**
 * Lays the build out the way Homebrew installs it: real files in libexec/ and a
 * relative symlink to the CLI in bin/.
 */
async function installLikeHomebrew(prefix: string): Promise<string> {
  const libexec = path.join(prefix, 'libexec')
  await mkdir(libexec, { recursive: true })
  for (const file of await readdir(buildDir)) {
    await cp(path.join(buildDir, file), path.join(libexec, file))
  }

  const bin = path.join(prefix, 'bin')
  await mkdir(bin)
  await symlink('../libexec/skillwalker', path.join(bin, 'skillwalker'))
  return path.join(bin, 'skillwalker')
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

let tmpDir: string
let outputDir: string
let dataDir: string

beforeEach(async () => {
  tmpDir = await makeTmpDir()
  outputDir = path.join(tmpDir, 'output')
  dataDir = path.join(tmpDir, 'analytics')
  await writeRunFixture({ outputDir, testRunId: TEST_RUN_ID, eval: 'smoke', testName: 'smoke test' })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── compiled binaries ────────────────────────────────────────────────────────

describe('compiled skillwalker binary', () => {
  it('reports the CLI package version', () => {
    const result = spawnSync(cliBinary, ['--version'], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(cliPackageVersion)
  })

  it('imports run output into parquet with the bundled DuckDB addon', () => {
    const result = spawnSync(cliBinary, ['update-analytics-data', '--output-dir', outputDir, '--data-dir', dataDir], {
      encoding: 'utf8',
    })
    const output = `${result.stdout}${result.stderr}`

    expect(output).not.toContain('Cannot find module')
    expect(result.status).toBe(0)
    expect(existsSync(path.join(dataDir, 'test-run.parquet'))).toBe(true)
  })
})

describe('compiled skillwalker binary installed like Homebrew', () => {
  it('loads its sidecar files through a bin symlink run from another directory', async () => {
    const linkedBinary = await installLikeHomebrew(path.join(tmpDir, 'prefix'))

    const result = spawnSync(linkedBinary, ['update-analytics-data', '--output-dir', outputDir, '--data-dir', dataDir], {
      cwd: tmpDir,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(existsSync(path.join(dataDir, 'test-run.parquet'))).toBe(true)
  })

  it('reads the sandbox scripts from SKILLWALKER_SCRIPTS_DIR', async () => {
    const scriptsDir = path.join(tmpDir, 'sandbox-scripts')
    await mkdir(scriptsDir)
    await writeFile(path.join(scriptsDir, 'sandbox-run.sh'), '')
    await writeFile(path.join(scriptsDir, 'sandbox-extract.sh'), '')

    const result = spawnSync(cliBinary, ['--help'], {
      encoding: 'utf8',
      env: { ...process.env, SKILLWALKER_SCRIPTS_DIR: scriptsDir },
    })

    expect(result.status).toBe(0)
  })

  it('names SKILLWALKER_SCRIPTS_DIR when that folder has no sandbox scripts', async () => {
    const scriptsDir = path.join(tmpDir, 'empty-scripts')
    await mkdir(scriptsDir)

    const result = spawnSync(cliBinary, ['--help'], {
      encoding: 'utf8',
      env: { ...process.env, SKILLWALKER_SCRIPTS_DIR: scriptsDir },
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`SKILLWALKER_SCRIPTS_DIR is set to ${scriptsDir}, but it has no sandbox-run.sh`)
  })
})

describe('compiled binary signatures', () => {
  // A binary whose signature fails to verify is killed on launch by recent macOS releases
  it.skipIf(process.platform !== 'darwin').each([cliBinary, webBinary])('%s passes codesign verification', (binary) => {
    const result = spawnSync('codesign', ['--verify', binary], { encoding: 'utf8' })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})

describe('compiled skillwalker-web binary', () => {
  let server: ChildProcess | undefined

  afterEach(() => {
    server?.kill()
  })

  it('serves test runs queried through the bundled DuckDB addon', async () => {
    spawnSync(cliBinary, ['update-analytics-data', '--output-dir', outputDir, '--data-dir', dataDir])
    server = spawn(webBinary, ['--port', String(WEB_PORT), '--data-dir', dataDir])

    const res = await waitForServer(`http://localhost:${WEB_PORT}/api/test-runs`, server)

    expect(res.status).toBe(200)
    expect((await res.json()).runs).toHaveLength(1)
  })
})
