import { rm } from 'node:fs/promises'
import path from 'node:path'
import { updateAllParquet } from '@testdouble/skillwalker-data'
import {
  makeAcilIterationRecord,
  makeConfigRecord,
  makeResultRecord,
  makeRunResultRecord,
  makeScilIterationRecord,
  makeTmpDir,
  writeAcilRunFixture,
  writeJsonl,
  writeScilRunFixture,
} from '@testdouble/skillwalker-data/src/analytics-test-helpers.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'

// ─── fixtures ─────────────────────────────────────────────────────────────────

const TEST_RUN_ID = '20260101T100001'
const SCIL_RUN_ID = '20260101T200001'
const ACIL_RUN_ID = '20260101T300001'

// Whole-number values are written to JSONL without a decimal point, so DuckDB infers
// BIGINT columns. These are the shapes that crashed the dashboard with BigInt values.
async function writeWholeNumberRunData(outputDir: string): Promise<void> {
  const runDir = path.join(outputDir, TEST_RUN_ID)
  const evalName = 'my-eval'
  const testName = 'judged test'

  await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
    makeConfigRecord({ testRunId: TEST_RUN_ID, eval: evalName, testName }),
  ])
  await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
    makeRunResultRecord({ testRunId: TEST_RUN_ID, eval: evalName, testName, totalCostUsd: 0 }),
  ])
  await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
    makeResultRecord({
      testRunId: TEST_RUN_ID,
      eval: evalName,
      testName,
      expectType: 'llm-judge',
      judgeModel: 'opus',
      judgeThreshold: 1,
      judgeScore: 1,
      rubricFile: 'rubric.md',
    }),
  ])

  await writeScilRunFixture({
    outputDir,
    runId: SCIL_RUN_ID,
    iterations: [makeScilIterationRecord({ test_run_id: SCIL_RUN_ID, trainAccuracy: 1 })],
  })
  await writeAcilRunFixture({
    outputDir,
    runId: ACIL_RUN_ID,
    iterations: [makeAcilIterationRecord({ test_run_id: ACIL_RUN_ID, trainAccuracy: 1 })],
  })
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

let tmpDir: string
let outputDir: string
let dataDir: string

beforeEach(async () => {
  tmpDir = await makeTmpDir()
  outputDir = path.join(tmpDir, 'output')
  dataDir = path.join(tmpDir, 'analytics')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── API against real stored data ─────────────────────────────────────────────

describe('API routes with real analytics data', () => {
  beforeEach(async () => {
    await writeWholeNumberRunData(outputDir)
    await updateAllParquet({ outputDir, dataDir })
  })

  it.each([
    ['/api/test-runs', (body: Record<string, unknown[]>) => expect(body.runs).toHaveLength(1)],
    [`/api/test-runs/${TEST_RUN_ID}`, (body: Record<string, unknown>) => expect(body.summary).toBeDefined()],
    ['/api/analytics/per-test', (body: Record<string, unknown[]>) => expect(body.rows).toHaveLength(1)],
    ['/api/scil', (body: Record<string, unknown[]>) => expect(body.runs).toHaveLength(1)],
    [`/api/scil/${SCIL_RUN_ID}`, (body: Record<string, unknown[]>) => expect(body.iterations).toHaveLength(1)],
    ['/api/acil', (body: Record<string, unknown[]>) => expect(body.runs).toHaveLength(1)],
    [`/api/acil/${ACIL_RUN_ID}`, (body: Record<string, unknown[]>) => expect(body.iterations).toHaveLength(1)],
  ])('GET %s returns 200 with a JSON body', async (url, assertBody) => {
    const res = await createApp(dataDir).request(url)

    expect(res.status).toBe(200)
    assertBody(await res.json())
  })
})

// ─── API with no data ─────────────────────────────────────────────────────────

describe('API routes with no analytics data', () => {
  it.each([
    ['/api/test-runs', 'runs'],
    ['/api/analytics/per-test', 'rows'],
    ['/api/scil', 'runs'],
    ['/api/acil', 'runs'],
  ])('GET %s returns 200 with an empty list', async (url, key) => {
    const res = await createApp(dataDir).request(url)

    expect(res.status).toBe(200)
    expect((await res.json())[key]).toEqual([])
  })
})
