import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTmpDir, writeRunFixture } from '@testdouble/skillwalker-data/src/analytics-test-helpers.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Runs the binaries `make build` produces. Unit tests stub the Bun runtime, so only
// a compiled binary can show the DuckDB native addon actually loads.
const buildDir = fileURLToPath(new URL('../../../build/', import.meta.url))
const cliBinary = path.join(buildDir, 'skillwalker')
const webBinary = path.join(buildDir, 'skillwalker-web')

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
