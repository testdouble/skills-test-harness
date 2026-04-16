import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { loadFixtures } from '@testdouble/test-fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  importJsonlToParquet,
  queryPerTest,
  queryTestRunDetails,
  queryTestRunSummaries,
  updateAllParquet,
} from './analytics.js'
import {
  makeAcilIterationRecord,
  makeConfigRecord,
  makeResultRecord,
  makeRunResultRecord,
  makeScilIterationRecord,
  makeTmpDir,
  writeAcilRunFixture,
  writeJsonl,
  writeRunFixture,
  writeScilRunFixture,
} from './analytics-test-helpers.js'
import { queryAcilHistory, queryAcilRunDetails, queryScilHistory, queryScilRunDetails } from './run-status.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function readParquet<T>(parquetPath: string): Promise<T[]> {
  const instance = await DuckDBInstance.create(':memory:')
  const conn = await instance.connect()
  const rows = (await conn.runAndReadAll(`SELECT * FROM read_parquet('${parquetPath}')`)).getRowObjects()
  conn.closeSync()
  return rows as unknown as T[]
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(async () => {
  tmpDir = await makeTmpDir()
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── importJsonlToParquet ─────────────────────────────────────────────────────

describe('importJsonlToParquet', () => {
  it('creates a new parquet file from JSONL when parquet does not exist', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 'test one' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    const result = await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-config.jsonl`,
      parquetPath,
    })

    expect(result).toBe(true)
    expect(existsSync(parquetPath)).toBe(true)
    const rows = await readParquet<{ test_run_id: string }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].test_run_id).toBe('20260101T100001')
  })

  it('returns false when no files match the glob', async () => {
    const result = await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/nonexistent.jsonl`,
      parquetPath: path.join(tmpDir, 'out.parquet'),
    })
    expect(result).toBe(false)
    expect(existsSync(path.join(tmpDir, 'out.parquet'))).toBe(false)
  })

  it('appends new records and deduplicates by test_run_id when parquet already exists', async () => {
    // Write two run dirs
    const run1Dir = path.join(tmpDir, '20260101T100001')
    const run2Dir = path.join(tmpDir, '20260101T100002')
    await writeJsonl(path.join(run1Dir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 'test one' }),
    ])
    await writeJsonl(path.join(run2Dir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100002', suite: 's', testName: 'test two' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')

    // First import: creates parquet with first run
    await importJsonlToParquet({ jsonlGlob: `${tmpDir}/20260101T100001/test-config.jsonl`, parquetPath })

    // Second import: appends second run
    await importJsonlToParquet({ jsonlGlob: `${tmpDir}/20260101T100002/test-config.jsonl`, parquetPath })

    const rows = await readParquet<{ test_run_id: string }>(parquetPath)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.test_run_id).sort()).toEqual(['20260101T100001', '20260101T100002'])
  })

  it('does not duplicate records when the same test_run_id is imported twice', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 'test one' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    const glob = `${tmpDir}/*/test-config.jsonl`

    await importJsonlToParquet({ jsonlGlob: glob, parquetPath })
    await importJsonlToParquet({ jsonlGlob: glob, parquetPath })

    const rows = await readParquet<{ test_run_id: string }>(parquetPath)
    expect(rows).toHaveLength(1)
  })

  it('applies filter function and only imports matching rows', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      { type: 'assistant', test_run_id: '20260101T100001', message: {} },
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 'test one' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-run.jsonl`,
      parquetPath,
      filter: (obj) => (obj as Record<string, unknown>).type === 'result',
    })

    const rows = await readParquet<{ type: string }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('result')
  })

  it('returns false when filter removes all rows', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      { type: 'assistant', test_run_id: '20260101T100001', message: {} },
    ])

    const result = await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-run.jsonl`,
      parquetPath: path.join(tmpDir, 'out.parquet'),
      filter: (obj) => (obj as Record<string, unknown>).type === 'result',
    })

    expect(result).toBe(false)
  })
})

// ─── updateAllParquet ─────────────────────────────────────────────────────────

describe('updateAllParquet', () => {
  it('creates all three parquet files from a standard output directory', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeRunFixture({
      outputDir,
      testRunId: '20260101T100001',
      suite: 'my-suite',
      testName: 'test one',
      totalCostUsd: 0.05,
      numTurns: 2,
      inputTokens: 200,
      outputTokens: 100,
      passed: true,
    })

    const { updated } = await updateAllParquet({ outputDir, dataDir })

    expect(updated.sort()).toEqual(['test-config', 'test-results', 'test-run'])
    expect(existsSync(path.join(dataDir, 'test-config.parquet'))).toBe(true)
    expect(existsSync(path.join(dataDir, 'test-run.parquet'))).toBe(true)
    expect(existsSync(path.join(dataDir, 'test-results.parquet'))).toBe(true)
  })

  it('filters test-run to result events only', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runDir = path.join(outputDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      { type: 'assistant', test_run_id: '20260101T100001', message: {} },
      { type: 'system', subtype: 'init', session_id: 'x', test_run_id: '20260101T100001' },
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<{ type: string }>(path.join(dataDir, 'test-run.parquet'))
    expect(rows.every((r) => r.type === 'result')).toBe(true)
  })

  it('returns empty updated list when no JSONL files exist', async () => {
    const outputDir = path.join(tmpDir, 'output-empty')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(outputDir, { recursive: true })
    await mkdir(dataDir, { recursive: true })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated).toEqual([])
  })

  it('migrates old test-run parquet with a message column by deleting and rebuilding', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Create an old-schema parquet that has a 'message' column
    const oldSchemaParquet = path.join(dataDir, 'test-run.parquet')
    const oldRecord = { type: 'assistant', test_run_id: '20260101T100099', message: { text: 'hi' } }
    const instance = await DuckDBInstance.create(':memory:')
    const conn = await instance.connect()
    const tmpJsonl = path.join(tmpDir, 'old.jsonl')
    await writeFile(tmpJsonl, `${JSON.stringify(oldRecord)}\n`, 'utf8')
    await conn.run(
      `COPY (SELECT * FROM read_json('${tmpJsonl}', format='newline_delimited')) TO '${oldSchemaParquet}' (FORMAT PARQUET)`,
    )
    conn.closeSync()

    // Now create fresh run data
    const runDir = path.join(outputDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])

    await updateAllParquet({ outputDir, dataDir })

    // Old-schema run should be gone; new data should be in
    const rows = await readParquet<{ test_run_id: string; type: string }>(oldSchemaParquet)
    expect(rows.every((r) => r.type === 'result')).toBe(true)
    expect(rows.map((r) => r.test_run_id)).toContain('20260101T100001')
    expect(rows.map((r) => r.test_run_id)).not.toContain('20260101T100099')
  })
})

// ─── importJsonlToParquet (additional edge cases) ────────────────────────────

describe('importJsonlToParquet (edge cases)', () => {
  it('skips malformed JSON lines in filter path and imports valid rows', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    const jsonlPath = path.join(runDir, 'test-run.jsonl')
    await mkdir(runDir, { recursive: true })
    // Mix of valid result event, malformed line, valid non-result event
    const content = `${[
      JSON.stringify(makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' })),
      'not valid json {{{',
      JSON.stringify({ type: 'assistant', test_run_id: '20260101T100001', message: {} }),
    ].join('\n')}\n`
    await writeFile(jsonlPath, content, 'utf8')

    const parquetPath = path.join(tmpDir, 'out.parquet')
    const result = await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-run.jsonl`,
      parquetPath,
      filter: (obj) => (obj as Record<string, unknown>).type === 'result',
    })

    expect(result).toBe(true)
    const rows = await readParquet<{ type: string }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('result')
  })
})

// ─── queryPerTest ─────────────────────────────────────────────────────────────

describe('queryPerTest', () => {
  it('returns one row per test with correct field values', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-one-row', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      test_run_id: '20260101T000001',
      test_name: 'test one',
      suite: 'my-suite',
      all_expectations_passed: true,
      num_turns: 3,
      input_tokens: 200,
      output_tokens: 100,
    })
  })

  it('reflects all_expectations_passed=false when any expectation fails', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/reflects-failed-expectations', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)
    expect(rows[0].all_expectations_passed).toBe(false)
  })

  it('returns multiple runs ordered by test_run_id DESC then test_name ASC', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-multiple-runs-ordered', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)
    expect(rows).toHaveLength(2)
    expect(rows[0].test_run_id).toBe('20240102T000000')
    expect(rows[1].test_run_id).toBe('20240101T000000')
  })

  it('rounds total_cost_usd to 2 decimal places', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/rounds-total-cost', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)
    expect(rows[0].total_cost_usd).toBe(0.12)
  })
})

// ─── queryTestRunSummaries ────────────────────────────────────────────────────

describe('queryTestRunSummaries', () => {
  it('returns grouped run summaries with correct counts', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Build run with two tests manually (writeRunFixture overwrites per runId)
    const runId1 = '20240103T120000'
    const runId2 = '20240101T080000'
    const runDir1 = path.join(outputDir, runId1)

    await writeJsonl(path.join(runDir1, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-1' }),
      makeConfigRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-2' }),
    ])
    await writeJsonl(path.join(runDir1, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-1' }),
      makeRunResultRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-2' }),
    ])
    await writeJsonl(path.join(runDir1, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-1', passed: true }),
      makeResultRecord({ testRunId: runId1, suite: 'suite-a', testName: 'test-2', passed: false }),
    ])

    await writeRunFixture({ outputDir, testRunId: runId2, suite: 'suite-b', testName: 'test-3', passed: true })
    await updateAllParquet({ outputDir, dataDir })

    const runs = await queryTestRunSummaries(dataDir)

    expect(runs).toHaveLength(2)
    // Ordered by test_run_id DESC
    expect(runs[0].test_run_id).toBe('20240103T120000')
    expect(runs[0].suite).toBe('suite-a')
    expect(runs[0].total_tests).toBe(2)
    expect(runs[0].passed).toBe(1)
    expect(runs[0].failed).toBe(1)
    expect(runs[0].date).toBe(new Date('2024-01-03T12:00:00').toISOString())

    expect(runs[1].test_run_id).toBe('20240101T080000')
    expect(runs[1].suite).toBe('suite-b')
    expect(runs[1].total_tests).toBe(1)
    expect(runs[1].passed).toBe(1)
    expect(runs[1].failed).toBe(0)
  })

  it('returns single-element array for a single test run', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeRunFixture({ outputDir, testRunId: '20240101T000000', suite: 'suite-a', testName: 'test-1' })
    await updateAllParquet({ outputDir, dataDir })

    const runs = await queryTestRunSummaries(dataDir)
    expect(runs).toHaveLength(1)
    expect(runs[0].test_run_id).toBe('20240101T000000')
    expect(runs[0].total_tests).toBe(1)
    expect(runs[0].passed).toBe(1)
    expect(runs[0].failed).toBe(0)
  })
})

// ─── queryTestRunDetails ──────────────────────────────────────────────────────

describe('queryTestRunDetails', () => {
  it('returns summary and expectations for a specific run', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-summary', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryTestRunDetails(dataDir, '20260101T000004')

    expect(details.summary).toHaveLength(1)
    expect(details.summary[0]).toMatchObject({
      test_run_id: '20260101T000004',
      test_name: 'my test',
      suite: 's',
      is_error: false,
      all_expectations_passed: false,
    })
    expect(details.expectations).toHaveLength(2)
    expect(details.expectations.map((e) => e.expect_type).sort()).toEqual(['result-contains', 'skill-call'])
  })

  it('throws when testRunId does not exist in parquet', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/throws-nonexistent', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    await expect(queryTestRunDetails(dataDir, '20260101T999999')).rejects.toThrow('Test run not found: 20260101T999999')
  })

  it('only returns data for the requested testRunId', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/only-requested-run', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryTestRunDetails(dataDir, '20260101T000006')
    expect(details.summary.every((r) => r.test_run_id === '20260101T000006')).toBe(true)
    expect(details.expectations.every((r) => r.test_run_id === '20260101T000006')).toBe(true)
  })

  it('rounds total_cost_usd to 4 decimal places in details', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/rounds-cost-4dp', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryTestRunDetails(dataDir, '20260101T000008')
    expect(details.summary[0].total_cost_usd).toBe(0.1235)
  })
})

// ─── queryPerTest — JOIN edge cases ──────────────────────────────────────────

describe('queryPerTest (JOIN edge cases)', () => {
  it('JOIN condition correctly matches test names with spaces and special characters', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/special-chars', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)
    expect(rows).toHaveLength(1)
    expect(rows[0].test_name).toBe('test: do something!')
  })

  it('INNER JOIN silently drops test-run rows with no matching test-config', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runDir = path.join(outputDir, '20260101T100001')
    // Write test-run with one ID but test-config for a different run ID
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T199999', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await updateAllParquet({ outputDir, dataDir })

    // run has no matching test-config — should be excluded from JOIN results
    const rows = await queryPerTest(dataDir)
    expect(rows.map((r) => r.test_run_id)).not.toContain('20260101T100001')
  })

  it('LEFT JOIN returns null all_expectations_passed when no test-results rows exist for run', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runDir = path.join(outputDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    // Write test-results for a DIFFERENT run so test-results.parquet exists but has no match
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T199999', suite: 's', testName: 't' }),
    ])
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryPerTest(dataDir)
    expect(rows).toHaveLength(1)
    expect(rows[0].all_expectations_passed).toBeNull()
  })

  it('throws DuckDB IO error when any parquet file is missing', async () => {
    // dataDir exists but contains no parquet files
    const dataDir = path.join(tmpDir, 'empty-analytics')
    await mkdir(dataDir, { recursive: true })

    await expect(queryPerTest(dataDir)).rejects.toThrow()
  })
})

// ─── queryTestRunDetails — missing parquet ────────────────────────────────────

describe('queryTestRunDetails (missing parquet)', () => {
  it('throws DuckDB IO error when test-results.parquet is missing but test-run.parquet exists', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Import only test-run and test-config — skip test-results
    const runDir = path.join(outputDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't' }),
    ])
    // Manually import only test-run and test-config
    await importJsonlToParquet({
      jsonlGlob: `${outputDir}/*/test-config.jsonl`,
      parquetPath: path.join(dataDir, 'test-config.parquet'),
    })
    await importJsonlToParquet({
      jsonlGlob: `${outputDir}/*/test-run.jsonl`,
      parquetPath: path.join(dataDir, 'test-run.parquet'),
      filter: (obj) => (obj as Record<string, unknown>).type === 'result',
    })
    // test-results.parquet intentionally NOT created

    // Existence check passes (run is in test-run), but summary query fails on missing test-results
    await expect(queryTestRunDetails(dataDir, '20260101T100001')).rejects.toThrow()
  })
})

// ─── SCIL: updateAllParquet ──────────────────────────────────────────────────

describe('SCIL updateAllParquet', () => {
  it('imports scil-iteration.jsonl with skill_file denormalization', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200001',
      iterations: [
        makeScilIterationRecord({ test_run_id: '20260101T200001', iteration: 1 }),
        makeScilIterationRecord({ test_run_id: '20260101T200001', iteration: 2 }),
      ],
    })

    // Also write standard test files so updateAllParquet doesn't fail on missing globs
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<{ test_run_id: string; iteration: number; skill_file: string }>(
      path.join(dataDir, 'scil-iteration.parquet'),
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].skill_file).toBe('plugin:skill')
    expect(rows[0].test_run_id).toBe('20260101T200001')
  })

  it('imports scil-summary.json without the iterations array', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200001',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T200001' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<Record<string, unknown>>(path.join(dataDir, 'scil-summary.parquet'))
    expect(rows).toHaveLength(1)
    expect(rows[0].test_run_id).toBe('20260101T200001')
    expect(rows[0].originalDescription).toBeDefined()
    expect(rows[0].bestIteration).toBeDefined()
    expect(rows[0].bestDescription).toBeDefined()
    // iterations array should NOT be a column
    expect(rows[0]).not.toHaveProperty('iterations')
  })

  it('deduplicates SCIL runs by test_run_id on second import', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200001',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T200001' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })
    await updateAllParquet({ outputDir, dataDir })

    const iterRows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'scil-iteration.parquet'))
    expect(iterRows).toHaveLength(1)

    const sumRows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'scil-summary.parquet'))
    expect(sumRows).toHaveLength(1)
  })
})

// ─── SCIL: queryScilHistory ──────────────────────────────────────────────────

describe('queryScilHistory', () => {
  it('returns rows with iteration_count and best_train_accuracy', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-rows-with-accuracy', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryScilHistory(dataDir)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      test_run_id: '20260101T000010',
      skill_file: 'plugin:skill',
      iteration_count: 3,
      best_train_accuracy: 1.0,
    })
  })
})

// ─── SCIL: queryScilRunDetails ───────────────────────────────────────────────

describe('queryScilRunDetails', () => {
  it('returns summary and iterations for a known runId', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-scil-summary', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryScilRunDetails(dataDir, '20260101T000011')
    expect(details.summary.test_run_id).toBe('20260101T000011')
    expect(details.summary.originalDescription).toBeDefined()
    expect(details.summary.bestIteration).toBeDefined()
    expect(details.iterations).toHaveLength(2)
    expect(details.iterations[0].iteration).toBe(1)
    expect(details.iterations[1].iteration).toBe(2)
  })

  it('throws for unknown runId', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/throws-unknown-scil', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    await expect(queryScilRunDetails(dataDir, '20260101T999999')).rejects.toThrow('SCIL run not found: 20260101T999999')
  })

  it('returns iterations in ascending order regardless of insertion order', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/ascending-order', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryScilRunDetails(dataDir, '20260101T000013')
    expect(details.iterations.map((i) => i.iteration)).toEqual([1, 2, 3])
  })

  it('casts bestIteration as a number (not BigInt)', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/casts-number', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryScilRunDetails(dataDir, '20260101T000014')
    expect(typeof details.summary.bestIteration).toBe('number')
    expect(details.summary.bestIteration).toBe(1)
  })

  it('returns iteration trainResults with runIndex as a number (not BigInt)', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/runindex-number', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryScilRunDetails(dataDir, '20260101T000015')
    expect(typeof details.iterations[0].trainResults[0].runIndex).toBe('number')
    expect(details.iterations[0].trainResults[0].runIndex).toBe(0)
  })
})

// ─── importJsonlToParquet: selectExpression ─────────────────────────────────

describe('importJsonlToParquet (selectExpression)', () => {
  it('applies selectExpression when creating a new parquet', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'scil-iteration.jsonl'), [
      makeScilIterationRecord({ test_run_id: '20260101T100001' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    const result = await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/scil-iteration.jsonl`,
      parquetPath,
      selectExpression: `*, trainResults[1].skillFile AS skill_file`,
    })

    expect(result).toBe(true)
    const rows = await readParquet<{ test_run_id: string; skill_file: string }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].skill_file).toBe('plugin:skill')
  })

  it('applies selectExpression when appending to existing parquet', async () => {
    const run1Dir = path.join(tmpDir, '20260101T100001')
    const run2Dir = path.join(tmpDir, '20260101T100002')
    await writeJsonl(path.join(run1Dir, 'scil-iteration.jsonl'), [
      makeScilIterationRecord({ test_run_id: '20260101T100001' }),
    ])
    await writeJsonl(path.join(run2Dir, 'scil-iteration.jsonl'), [
      makeScilIterationRecord({ test_run_id: '20260101T100002' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    const selectExpr = `*, trainResults[1].skillFile AS skill_file`

    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/20260101T100001/scil-iteration.jsonl`,
      parquetPath,
      selectExpression: selectExpr,
    })
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/20260101T100002/scil-iteration.jsonl`,
      parquetPath,
      selectExpression: selectExpr,
    })

    const rows = await readParquet<{ test_run_id: string; skill_file: string }>(parquetPath)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.skill_file === 'plugin:skill')).toBe(true)
  })

  it('produces null skill_file when trainResults is empty', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'scil-iteration.jsonl'), [
      makeScilIterationRecord({ test_run_id: '20260101T100001', trainResults: [] }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/scil-iteration.jsonl`,
      parquetPath,
      selectExpression: `*, trainResults[1].skillFile AS skill_file`,
    })

    const rows = await readParquet<{ skill_file: string | null }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].skill_file).toBeNull()
  })
})

// ─── SCIL updateAllParquet: partial data ────────────────────────────────────

describe('SCIL updateAllParquet (partial data)', () => {
  it('handles missing SCIL summary files gracefully', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Write only scil-iteration.jsonl (no scil-summary.json)
    const runDir = path.join(outputDir, '20260101T200001')
    await writeJsonl(path.join(runDir, 'scil-iteration.jsonl'), [
      makeScilIterationRecord({ test_run_id: '20260101T200001' }),
    ])
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated).toContain('scil-iteration')
    expect(updated).not.toContain('scil-summary')
  })

  it('handles missing SCIL iteration files gracefully', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Write only scil-summary.json (no scil-iteration.jsonl)
    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200001',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T200001' })],
    })
    // Remove the iteration file that writeScilRunFixture created
    const { unlink: unlinkFs } = await import('node:fs/promises')
    await unlinkFs(path.join(outputDir, '20260101T200001', 'scil-iteration.jsonl'))
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated).not.toContain('scil-iteration')
    expect(updated).toContain('scil-summary')
  })

  it('returns all 7 tables when all data is present (SCIL + ACIL)', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeRunFixture({ outputDir, testRunId: '20260101T100001', suite: 's', testName: 't' })
    await writeScilRunFixture({
      outputDir,
      runId: '20260101T100001',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T100001' })],
    })
    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T100001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T100001' })],
    })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated.sort()).toEqual([
      'acil-iteration',
      'acil-summary',
      'scil-iteration',
      'scil-summary',
      'test-config',
      'test-results',
      'test-run',
    ])
  })

  it('aggregates multiple scil-summary.json files', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200001',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T200001' })],
    })
    await writeScilRunFixture({
      outputDir,
      runId: '20260101T200002',
      iterations: [makeScilIterationRecord({ test_run_id: '20260101T200002' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T200001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'scil-summary.parquet'))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.test_run_id).sort()).toEqual(['20260101T200001', '20260101T200002'])
  })
})

// ─── queryScilHistory: additional cases ─────────────────────────────────────

describe('queryScilHistory (additional cases)', () => {
  it('returns multiple runs ordered by test_run_id DESC', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/multiple-runs-ordered', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryScilHistory(dataDir)
    expect(rows).toHaveLength(2)
    expect(rows[0].test_run_id).toBe('20240102T000000')
    expect(rows[1].test_run_id).toBe('20240101T000000')
  })

  it('groups by skill_file when different skills exist', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/groups-by-skill', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryScilHistory(dataDir)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const skillFiles = rows.map((r) => r.skill_file).sort()
    expect(skillFiles).toContain('plugin:skill-a')
    expect(skillFiles).toContain('plugin:skill-b')
  })
})

// ─── infrastructure-error filtering ──────────────────────────────────────────

describe('infrastructure-error filtering', () => {
  it('queryPerTest excludes infrastructure-error records from pass-rate calculation', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runId = '20260101T100001'
    const runDir = path.join(outputDir, runId)

    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    // One passing expectation + one infrastructure-error record
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: runId, suite: 's', testName: 'my test', passed: true }),
      makeResultRecord({
        testRunId: runId,
        suite: 's',
        testName: 'my test',
        expectType: 'llm-judge-aggregate',
        expectValue: 'rubric.md',
        passed: false,
        status: 'infrastructure-error',
        errorMessage: 'sandbox timeout',
        judgeModel: 'opus',
        judgeThreshold: 1.0,
        judgeScore: 0,
        rubricFile: 'rubric.md',
      }),
    ])

    await updateAllParquet({ outputDir, dataDir })
    const rows = await queryPerTest(dataDir)

    expect(rows).toHaveLength(1)
    // The infrastructure-error record should be excluded, leaving only the passing one
    expect(rows[0].all_expectations_passed).toBe(true)
  })

  it('queryTestRunDetails excludes infrastructure-error records from pass-rate calculation', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runId = '20260101T100002'
    const runDir = path.join(outputDir, runId)

    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: runId, suite: 's', testName: 'my test', passed: true }),
      makeResultRecord({
        testRunId: runId,
        suite: 's',
        testName: 'my test',
        expectType: 'llm-judge-aggregate',
        expectValue: 'rubric.md',
        passed: false,
        status: 'infrastructure-error',
        errorMessage: 'judge returned no result',
        judgeModel: 'opus',
        judgeThreshold: 1.0,
        judgeScore: 0,
        rubricFile: 'rubric.md',
      }),
    ])

    await updateAllParquet({ outputDir, dataDir })
    const details = await queryTestRunDetails(dataDir, runId)

    expect(details.summary).toHaveLength(1)
    // Pass rate should reflect only the non-error expectation
    expect(details.summary[0].all_expectations_passed).toBe(true)
  })

  it('infrastructure-error records are still visible in raw expectations', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    const runId = '20260101T100003'
    const runDir = path.join(outputDir, runId)

    await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
      makeConfigRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
      makeRunResultRecord({ testRunId: runId, suite: 's', testName: 'my test' }),
    ])
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: runId, suite: 's', testName: 'my test', passed: true }),
      makeResultRecord({
        testRunId: runId,
        suite: 's',
        testName: 'my test',
        expectType: 'llm-judge-aggregate',
        expectValue: 'rubric.md',
        passed: false,
        status: 'infrastructure-error',
        errorMessage: 'sandbox timeout',
        judgeModel: 'opus',
        judgeThreshold: 1.0,
        judgeScore: 0,
        rubricFile: 'rubric.md',
      }),
    ])

    await updateAllParquet({ outputDir, dataDir })
    const details = await queryTestRunDetails(dataDir, runId)

    // The infrastructure-error record should still appear in llmJudgeGroups
    expect(details.llmJudgeGroups).toHaveLength(1)
    expect(details.llmJudgeGroups[0].passed).toBe(false)
    expect(Number(details.llmJudgeGroups[0].score)).toBe(0)
  })
})

// ─── ACIL: updateAllParquet ingestion ───────────────────────────────────────

describe('updateAllParquet (ACIL tables)', () => {
  it('creates acil-iteration.parquet with agent_file denormalization', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300001' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    const { updated } = await updateAllParquet({ outputDir, dataDir })

    expect(updated).toContain('acil-iteration')
    const rows = await readParquet<{ test_run_id: string; agent_file: string }>(
      path.join(dataDir, 'acil-iteration.parquet'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].agent_file).toBe('plugin:agent')
    expect(rows[0].test_run_id).toBe('20260101T300001')
  })

  it('imports acil-summary.json without the iterations array', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300001' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<Record<string, unknown>>(path.join(dataDir, 'acil-summary.parquet'))
    expect(rows).toHaveLength(1)
    expect(rows[0].test_run_id).toBe('20260101T300001')
    expect(rows[0].originalDescription).toBeDefined()
    expect(rows[0].bestIteration).toBeDefined()
    expect(rows[0].bestDescription).toBeDefined()
    expect(rows[0]).not.toHaveProperty('iterations')
  })

  it('deduplicates ACIL runs by test_run_id on second import', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300001' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })
    await updateAllParquet({ outputDir, dataDir })

    const iterRows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'acil-iteration.parquet'))
    expect(iterRows).toHaveLength(1)

    const sumRows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'acil-summary.parquet'))
    expect(sumRows).toHaveLength(1)
  })
})

// ─── ACIL updateAllParquet: partial data ───────────────────────────────────

describe('ACIL updateAllParquet (partial data)', () => {
  it('handles missing ACIL summary files gracefully', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Write only acil-iteration.jsonl (no acil-summary.json)
    const runDir = path.join(outputDir, '20260101T300001')
    await writeJsonl(path.join(runDir, 'acil-iteration.jsonl'), [
      makeAcilIterationRecord({ test_run_id: '20260101T300001' }),
    ])
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated).toContain('acil-iteration')
    expect(updated).not.toContain('acil-summary')
  })

  it('handles missing ACIL iteration files gracefully', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    // Write only acil-summary.json (no acil-iteration.jsonl)
    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300001' })],
    })
    // Remove the iteration file that writeAcilRunFixture created
    const { unlink: unlinkFs } = await import('node:fs/promises')
    await unlinkFs(path.join(outputDir, '20260101T300001', 'acil-iteration.jsonl'))
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    const { updated } = await updateAllParquet({ outputDir, dataDir })
    expect(updated).not.toContain('acil-iteration')
    expect(updated).toContain('acil-summary')
  })

  it('aggregates multiple acil-summary.json files', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300001',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300001' })],
    })
    await writeAcilRunFixture({
      outputDir,
      runId: '20260101T300002',
      iterations: [makeAcilIterationRecord({ test_run_id: '20260101T300002' })],
    })
    await writeRunFixture({ outputDir, testRunId: '20260101T300001', suite: 's', testName: 't' })

    await updateAllParquet({ outputDir, dataDir })

    const rows = await readParquet<{ test_run_id: string }>(path.join(dataDir, 'acil-summary.parquet'))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.test_run_id).sort()).toEqual(['20260101T300001', '20260101T300002'])
  })
})

// ─── ACIL: selectExpression edge cases ─────────────────────────────────────

describe('ACIL selectExpression', () => {
  it('produces null agent_file when trainResults is empty', async () => {
    const runDir = path.join(tmpDir, '20260101T300001')
    await writeJsonl(path.join(runDir, 'acil-iteration.jsonl'), [
      makeAcilIterationRecord({ test_run_id: '20260101T300001', trainResults: [] }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/acil-iteration.jsonl`,
      parquetPath,
      selectExpression: `*, trainResults[1].agentFile AS agent_file`,
    })

    const rows = await readParquet<{ agent_file: string | null }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].agent_file).toBeNull()
  })
})

// ─── importJsonlToParquet: replaceRunIds ───────────────────────────────────

describe('importJsonlToParquet (replaceRunIds)', () => {
  it('replaces existing records for specified run IDs', async () => {
    const runDir = path.join(tmpDir, '20260101T100001')
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't', passed: false }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')

    // First import: creates parquet with initial data
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-results.jsonl`,
      parquetPath,
    })

    // Update the JSONL with new data
    await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't', passed: true }),
    ])

    // Re-import with replaceRunIds to replace the existing record
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-results.jsonl`,
      parquetPath,
      replaceRunIds: ['20260101T100001'],
    })

    const rows = await readParquet<{ test_run_id: string; passed: boolean }>(parquetPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].passed).toBe(true)
  })

  it('preserves records for non-replaced run IDs', async () => {
    const run1Dir = path.join(tmpDir, '20260101T100001')
    const run2Dir = path.join(tmpDir, '20260101T100002')
    await writeJsonl(path.join(run1Dir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100001', suite: 's', testName: 't1' }),
    ])
    await writeJsonl(path.join(run2Dir, 'test-results.jsonl'), [
      makeResultRecord({ testRunId: '20260101T100002', suite: 's', testName: 't2' }),
    ])

    const parquetPath = path.join(tmpDir, 'out.parquet')

    // Import both runs
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/*/test-results.jsonl`,
      parquetPath,
    })

    // Replace only the first run
    await importJsonlToParquet({
      jsonlGlob: `${tmpDir}/20260101T100001/test-results.jsonl`,
      parquetPath,
      replaceRunIds: ['20260101T100001'],
    })

    const rows = await readParquet<{ test_run_id: string }>(parquetPath)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.test_run_id).sort()).toEqual(['20260101T100001', '20260101T100002'])
  })
})

// ─── ACIL: queryAcilHistory ────────────────────────────────────────────────

describe('queryAcilHistory', () => {
  it('returns rows with iteration_count and best_train_accuracy', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-acil-rows-with-accuracy', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryAcilHistory(dataDir)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      test_run_id: '20260101T000020',
      agent_file: 'plugin:agent',
      iteration_count: 3,
      best_train_accuracy: 1.0,
    })
  })

  it('returns multiple runs ordered by test_run_id DESC', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/acil-multiple-runs-ordered', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryAcilHistory(dataDir)
    expect(rows).toHaveLength(2)
    expect(rows[0].test_run_id).toBe('20240102T000000')
    expect(rows[1].test_run_id).toBe('20240101T000000')
  })

  it('groups by agent_file when different agents exist', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/acil-groups-by-agent', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const rows = await queryAcilHistory(dataDir)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const agentFiles = rows.map((r) => r.agent_file).sort()
    expect(agentFiles).toContain('plugin:agent-a')
    expect(agentFiles).toContain('plugin:agent-b')
  })
})

// ─── ACIL: queryAcilRunDetails ──────────────────────────────────────────────

describe('queryAcilRunDetails', () => {
  it('returns summary and iterations for a known runId', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/returns-acil-summary', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryAcilRunDetails(dataDir, '20260101T000021')
    expect(details.summary.test_run_id).toBe('20260101T000021')
    expect(details.summary.originalDescription).toBeDefined()
    expect(details.summary.bestIteration).toBeDefined()
    expect(details.iterations).toHaveLength(2)
    expect(details.iterations[0].iteration).toBe(1)
    expect(details.iterations[1].iteration).toBe(2)
  })

  it('throws for unknown runId', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/throws-unknown-acil', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    await expect(queryAcilRunDetails(dataDir, '20260101T999999')).rejects.toThrow('ACIL run not found: 20260101T999999')
  })

  it('returns iterations in ascending order regardless of insertion order', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/acil-ascending-order', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryAcilRunDetails(dataDir, '20260101T000023')
    expect(details.iterations.map((i) => i.iteration)).toEqual([1, 2, 3])
  })

  it('casts bestIteration as a number (not BigInt)', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/acil-casts-number', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryAcilRunDetails(dataDir, '20260101T000024')
    expect(typeof details.summary.bestIteration).toBe('number')
    expect(details.summary.bestIteration).toBe(1)
  })

  it('returns iteration trainResults with runIndex as a number (not BigInt)', async () => {
    const outputDir = path.join(tmpDir, 'output')
    const dataDir = path.join(tmpDir, 'analytics')
    await mkdir(dataDir, { recursive: true })

    await loadFixtures('data/analytics/acil-runindex-number', outputDir)
    await updateAllParquet({ outputDir, dataDir })

    const details = await queryAcilRunDetails(dataDir, '20260101T000025')
    expect(typeof details.iterations[0].trainResults[0].runIndex).toBe('number')
    expect(details.iterations[0].trainResults[0].runIndex).toBe(0)
  })
})
