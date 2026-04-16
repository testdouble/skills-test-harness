import { DuckDBInstance } from '@duckdb/node-api'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { readdir } from 'node:fs/promises'
import type { PerTestRow, TestRunSummary, TestRunDetails, TestRunDetailRow, TestRunExpectationRow, LlmJudgeGroup, LlmJudgeCriterion, OutputFileRow, ScilSummaryRecord, AcilSummaryRecord } from './types.js'
import { InvalidRunIdError } from './types.js'
import { withConnection } from './connection.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function infraErrorCondition(conn: any, dataDir: string): Promise<string> {
  try {
    const cols = (await conn.runAndReadAll(
      `SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet('${dataDir}/test-results.parquet'))
       WHERE column_name = 'status'`
    )).getRowObjects()
    if (cols.length > 0) {
      return `(status IS NULL OR status != 'infrastructure-error')`
    }
  } catch {
    // column check failed — parquet may not exist yet
  }
  return ''
}

function validateRunId(runId: string): void {
  if (!/^\d{8}T\d{6}$/.test(runId)) {
    throw new InvalidRunIdError(runId)
  }
}

export async function importJsonlToParquet({
  jsonlGlob,
  parquetPath,
  filter,
  selectExpression,
  replaceRunIds,
}: {
  jsonlGlob: string
  parquetPath: string
  filter?: (obj: unknown) => boolean
  selectExpression?: string
  replaceRunIds?: string[]
}): Promise<boolean> {
  const instance = await DuckDBInstance.create(':memory:')
  const conn = await instance.connect()

  let jsonlSource: string
  let tmpJsonl: string | undefined

  try {
    if (filter) {
      // List matching files via DuckDB GLOB
      const fileRows = (await conn.runAndReadAll(`SELECT file FROM GLOB('${jsonlGlob}')`)).getRowObjects()

      const filteredLines: string[] = []
      for (const row of fileRows as { file: string }[]) {
        const content = await readFile(row.file, 'utf8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const obj = JSON.parse(trimmed) as unknown
            if (filter(obj)) filteredLines.push(trimmed)
          } catch {
            // skip malformed lines
          }
        }
      }

      if (filteredLines.length === 0) {
        console.log(`  no matching rows found for: ${jsonlGlob}`)
        return false
      }

      tmpJsonl = path.join(os.tmpdir(), `analytics-${Date.now()}-${crypto.randomUUID()}.jsonl`)
      await writeFile(tmpJsonl, filteredLines.join('\n') + '\n', 'utf8')
      jsonlSource = tmpJsonl
    } else {
      const countRows = (await conn.runAndReadAll(`SELECT COUNT(*) AS count FROM GLOB('${jsonlGlob}')`)).getRowObjects()
      const lineCount = (countRows[0] as { count: number }).count

      if (!lineCount) {
        console.log(`  no files found for: ${jsonlGlob}`)
        return false
      }

      jsonlSource = jsonlGlob
    }

    const sel = selectExpression ?? '*'

    if (!existsSync(parquetPath)) {
      await conn.run(`
        COPY (SELECT ${sel} FROM read_json('${jsonlSource}', format='newline_delimited'))
        TO '${parquetPath}' (FORMAT PARQUET)
      `)
    } else if (replaceRunIds && replaceRunIds.length > 0) {
      const inList = replaceRunIds.map(id => `'${id}'`).join(', ')
      const tmpPath = `${parquetPath}.tmp`
      await conn.run(`
        COPY (
          SELECT * FROM read_parquet('${parquetPath}')
          WHERE test_run_id NOT IN (${inList})
          UNION ALL BY NAME
          (SELECT ${sel} FROM read_json('${jsonlSource}', format='newline_delimited')
           WHERE test_run_id NOT IN (
             SELECT DISTINCT test_run_id FROM read_parquet('${parquetPath}')
             WHERE test_run_id NOT IN (${inList})
           ))
        ) TO '${tmpPath}' (FORMAT PARQUET)
      `)
      await rename(tmpPath, parquetPath)
    } else {
      const tmpPath = `${parquetPath}.tmp`
      await conn.run(`
        COPY (
          SELECT * FROM read_parquet('${parquetPath}')
          UNION ALL BY NAME
          (SELECT ${sel} FROM read_json('${jsonlSource}', format='newline_delimited')
           WHERE test_run_id NOT IN (SELECT DISTINCT test_run_id FROM read_parquet('${parquetPath}')))
        ) TO '${tmpPath}' (FORMAT PARQUET)
      `)
      await rename(tmpPath, parquetPath)
    }

    return true
  } finally {
    conn.closeSync()
    if (tmpJsonl) await unlink(tmpJsonl)
  }
}

export async function updateAllParquet({ outputDir, dataDir, reEvaluatedRunIds }: { outputDir: string; dataDir: string; reEvaluatedRunIds?: string[] }): Promise<{ updated: string[] }> {
  const tables = [
    { name: 'test-config',  glob: `${outputDir}/*/test-config.jsonl`,  parquet: `${dataDir}/test-config.parquet` },
    {
      name: 'test-run',
      glob: `${outputDir}/*/test-run.jsonl`,
      parquet: `${dataDir}/test-run.parquet`,
      filter: (obj: unknown) => (obj as Record<string, unknown>).type === 'result',
    },
    { name: 'test-results', glob: `${outputDir}/*/test-results.jsonl`,  parquet: `${dataDir}/test-results.parquet` },
    { name: 'output-files', glob: `${outputDir}/*/output-files.jsonl`,  parquet: `${dataDir}/output-files.parquet` },
  ]

  const updated: string[] = []

  for (const table of tables) {
    // Migrate old all-events schema: if parquet has a 'message' column, it's the old schema — delete and rebuild
    if (existsSync(table.parquet) && 'filter' in table) {
      const instance = await DuckDBInstance.create(':memory:')
      const conn = await instance.connect()
      try {
        const cols = (await conn.runAndReadAll(
          `SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet('${table.parquet}'))
           WHERE column_name = 'message'`
        )).getRowObjects()
        if (cols.length > 0) {
          await unlink(table.parquet)
          const tmp = `${table.parquet}.tmp`
          if (existsSync(tmp)) await unlink(tmp)
        }
      } finally {
        conn.closeSync()
      }
    }

    const wasUpdated = await importJsonlToParquet({
      jsonlGlob: table.glob,
      parquetPath: table.parquet,
      filter: 'filter' in table ? table.filter : undefined,
      replaceRunIds: table.name === 'test-results' ? reEvaluatedRunIds : undefined,
    })
    if (wasUpdated) updated.push(table.name)
  }

  // ─── SCIL tables ──────────────────────────────────────────────────────────
  // scil-iteration: import with skill_file denormalization
  const scilIterationGlob = `${outputDir}/*/scil-iteration.jsonl`
  const scilIterationParquet = `${dataDir}/scil-iteration.parquet`
  const scilIterUpdated = await importJsonlToParquet({
    jsonlGlob: scilIterationGlob,
    parquetPath: scilIterationParquet,
    selectExpression: `*, trainResults[1].skillFile AS skill_file`,
  })
  if (scilIterUpdated) updated.push('scil-iteration')

  // scil-summary: convert JSON files to temp JSONL, then import
  const tmpSummaryPath = await convertScilSummariesToTempJsonl(outputDir)
  if (tmpSummaryPath) {
    try {
      const scilSummaryParquet = `${dataDir}/scil-summary.parquet`
      const scilSumUpdated = await importJsonlToParquet({
        jsonlGlob: tmpSummaryPath,
        parquetPath: scilSummaryParquet,
      })
      if (scilSumUpdated) updated.push('scil-summary')
    } finally {
      await unlink(tmpSummaryPath)
    }
  } else {
    console.log('  no data found for: scil-summary')
  }

  // ─── ACIL tables ──────────────────────────────────────────────────────────
  // acil-iteration: import with agent_file denormalization
  const acilIterationGlob = `${outputDir}/*/acil-iteration.jsonl`
  const acilIterationParquet = `${dataDir}/acil-iteration.parquet`
  const acilIterUpdated = await importJsonlToParquet({
    jsonlGlob: acilIterationGlob,
    parquetPath: acilIterationParquet,
    selectExpression: `*, trainResults[1].agentFile AS agent_file`,
  })
  if (acilIterUpdated) updated.push('acil-iteration')

  // acil-summary: convert JSON files to temp JSONL, then import
  const tmpAcilSummaryPath = await convertAcilSummariesToTempJsonl(outputDir)
  if (tmpAcilSummaryPath) {
    try {
      const acilSummaryParquet = `${dataDir}/acil-summary.parquet`
      const acilSumUpdated = await importJsonlToParquet({
        jsonlGlob: tmpAcilSummaryPath,
        parquetPath: acilSummaryParquet,
      })
      if (acilSumUpdated) updated.push('acil-summary')
    } finally {
      await unlink(tmpAcilSummaryPath)
    }
  } else {
    console.log('  no data found for: acil-summary')
  }

  return { updated }
}

async function convertScilSummariesToTempJsonl(outputDir: string): Promise<string | null> {
  const records: string[] = []

  let entries: string[]
  try {
    entries = await readdir(outputDir)
  } catch {
    return null
  }

  for (const entry of entries) {
    const summaryPath = path.join(outputDir, entry, 'scil-summary.json')
    if (!existsSync(summaryPath)) continue
    const content = await readFile(summaryPath, 'utf8')
    const parsed = JSON.parse(content) as ScilSummaryRecord & { iterations?: unknown }
    const { iterations: _, ...rest } = parsed
    records.push(JSON.stringify(rest))
  }

  if (records.length === 0) return null

  const tmpPath = path.join(os.tmpdir(), `scil-summary-${Date.now()}.jsonl`)
  await writeFile(tmpPath, records.join('\n') + '\n', 'utf8')
  return tmpPath
}

async function convertAcilSummariesToTempJsonl(outputDir: string): Promise<string | null> {
  const records: string[] = []

  let entries: string[]
  try {
    entries = await readdir(outputDir)
  } catch {
    return null
  }

  for (const entry of entries) {
    const summaryPath = path.join(outputDir, entry, 'acil-summary.json')
    if (!existsSync(summaryPath)) continue
    const content = await readFile(summaryPath, 'utf8')
    const parsed = JSON.parse(content) as AcilSummaryRecord & { iterations?: unknown }
    const { iterations: _, ...rest } = parsed
    records.push(JSON.stringify(rest))
  }

  if (records.length === 0) return null

  const tmpPath = path.join(os.tmpdir(), `acil-summary-${Date.now()}.jsonl`)
  await writeFile(tmpPath, records.join('\n') + '\n', 'utf8')
  return tmpPath
}

export async function queryPerTest(dataDir: string): Promise<PerTestRow[]> {
  return withConnection(dataDir, async (conn) => {
    const statusFilter = await infraErrorCondition(conn, dataDir)
    const sql = `
      WITH expect_summary AS (
        SELECT test_run_id, suite, test_name, bool_and(passed) AS all_expectations_passed
        FROM read_parquet('${dataDir}/test-results.parquet')
        ${statusFilter ? `WHERE ${statusFilter}` : ''}
        GROUP BY test_run_id, suite, test_name
      )
      SELECT
        r.test_run_id,
        c.test.name AS test_name,
        c.suite,
        e.all_expectations_passed,
        ROUND(r.total_cost_usd, 2) AS total_cost_usd,
        CAST(r.num_turns AS INTEGER) AS num_turns,
        CAST(r.usage.input_tokens AS INTEGER) AS input_tokens,
        CAST(r.usage.output_tokens AS INTEGER) AS output_tokens
      FROM read_parquet('${dataDir}/test-run.parquet') r
      JOIN read_parquet('${dataDir}/test-config.parquet') c
        ON r.test_run_id = c.test_run_id
        AND r.test_case = c.suite || '-' ||
            regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
      LEFT JOIN expect_summary e
        ON r.test_run_id = e.test_run_id
        AND c.suite = e.suite
        AND c.test.name = e.test_name
      WHERE r.type = 'result'
      ORDER BY r.test_run_id DESC, c.test.name
    `
    const rows = (await conn.runAndReadAll(sql)).getRowObjects()
    return rows as unknown as PerTestRow[]
  })
}

function parseRunIdDate(runId: string): string {
  const y = runId.slice(0, 4), mo = runId.slice(4, 6), d = runId.slice(6, 8)
  const h = runId.slice(9, 11), mi = runId.slice(11, 13), s = runId.slice(13, 15)
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString()
}

export async function queryTestRunSummaries(dataDir: string): Promise<TestRunSummary[]> {
  return withConnection(dataDir, async (conn) => {
    const statusFilter = await infraErrorCondition(conn, dataDir)
    const sql = `
      WITH expect_summary AS (
        SELECT test_run_id, suite, test_name, bool_and(passed) AS all_expectations_passed
        FROM read_parquet('${dataDir}/test-results.parquet')
        ${statusFilter ? `WHERE ${statusFilter}` : ''}
        GROUP BY test_run_id, suite, test_name
      ),
      per_test AS (
        SELECT
          r.test_run_id,
          c.suite,
          e.all_expectations_passed
        FROM read_parquet('${dataDir}/test-run.parquet') r
        JOIN read_parquet('${dataDir}/test-config.parquet') c
          ON r.test_run_id = c.test_run_id
          AND r.test_case = c.suite || '-' ||
              regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
        LEFT JOIN expect_summary e
          ON r.test_run_id = e.test_run_id
          AND c.suite = e.suite
          AND c.test.name = e.test_name
        WHERE r.type = 'result'
      )
      SELECT
        test_run_id,
        suite,
        CAST(COUNT(*) AS INTEGER) AS total_tests,
        CAST(COUNT(*) FILTER (WHERE all_expectations_passed) AS INTEGER) AS passed,
        CAST(COUNT(*) - COUNT(*) FILTER (WHERE all_expectations_passed) AS INTEGER) AS failed
      FROM per_test
      GROUP BY test_run_id, suite
      ORDER BY test_run_id DESC
    `
    const rows = (await conn.runAndReadAll(sql)).getRowObjects() as unknown as Omit<TestRunSummary, 'date'>[]
    return rows.map(row => ({
      ...row,
      date: parseRunIdDate(row.test_run_id),
    }))
  })
}

export async function queryTestRunDetails(dataDir: string, testRunId: string): Promise<TestRunDetails> {
  validateRunId(testRunId)
  return withConnection(dataDir, async (conn) => {
    const existsRows = (await conn.runAndReadAll(
      `SELECT 1 FROM read_parquet('${dataDir}/test-run.parquet')
      WHERE type = 'result' AND test_run_id = $1
      LIMIT 1`,
      [testRunId]
    )).getRowObjects()
    if (existsRows.length === 0) {
      throw new Error(`Test run not found: ${testRunId}`)
    }

    const statusFilter = await infraErrorCondition(conn, dataDir)
    const summarySql = `
      WITH expect_summary AS (
        SELECT test_run_id, test_name, bool_and(passed) AS all_expectations_passed
        FROM read_parquet('${dataDir}/test-results.parquet')
        WHERE test_run_id = $1
          ${statusFilter ? `AND ${statusFilter}` : ''}
        GROUP BY test_run_id, test_name
      )
      SELECT
        r.test_run_id,
        c.test.name AS test_name,
        c.suite,
        r.is_error,
        e.all_expectations_passed,
        r.result,
        ROUND(r.total_cost_usd, 4) AS total_cost_usd,
        CAST(r.num_turns AS INTEGER) AS num_turns,
        CAST(r.usage.input_tokens AS INTEGER) AS input_tokens,
        CAST(r.usage.output_tokens AS INTEGER) AS output_tokens
      FROM read_parquet('${dataDir}/test-run.parquet') r
      JOIN read_parquet('${dataDir}/test-config.parquet') c
        ON r.test_run_id = c.test_run_id
        AND r.test_case = c.suite || '-' ||
            regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
      LEFT JOIN expect_summary e
        ON r.test_run_id = e.test_run_id
        AND c.test.name = e.test_name
      WHERE r.type = 'result'
        AND r.test_run_id = $1
      ORDER BY c.test.name
    `
    const summaryRaw = (await conn.runAndReadAll(summarySql, [testRunId])).getRowObjects() as unknown as (TestRunDetailRow & { result?: string })[]

    const expectationsSql = `
      SELECT *
      FROM read_parquet('${dataDir}/test-results.parquet')
      WHERE test_run_id = $1
      ORDER BY test_name, expect_type, expect_value
    `
    const allExpectations = (await conn.runAndReadAll(expectationsSql, [testRunId])).getRowObjects() as unknown as (TestRunExpectationRow & {
      confidence?: string
      reasoning?: string
      judge_model?: string
      judge_threshold?: number
      judge_score?: number
      rubric_file?: string
    })[]

    // Build result-text lookup from summary rows
    const resultTextByTest = new Map<string, string>()
    for (const row of summaryRaw) {
      if (row.result) resultTextByTest.set(row.test_name, row.result)
    }

    // Strip result from summary rows (not part of TestRunDetailRow)
    const summary: TestRunDetailRow[] = summaryRaw.map(({ result: _, ...rest }) => rest)

    // Split expectations: non-judge vs judge
    const expectations: TestRunExpectationRow[] = []
    const judgeRows: typeof allExpectations = []
    for (const row of allExpectations) {
      if (row.expect_type === 'llm-judge' || row.expect_type === 'llm-judge-aggregate') {
        judgeRows.push(row)
      } else {
        expectations.push({
          test_run_id: row.test_run_id,
          suite: row.suite,
          test_name: row.test_name,
          expect_type: row.expect_type,
          expect_value: row.expect_value,
          passed: row.passed,
        })
      }
    }

    // Group judge rows by (test_name, rubric_file)
    const groupKey = (testName: string, rubricFile: string) => `${testName}::${rubricFile}`
    const judgeGroupMap = new Map<string, { aggregateRow?: typeof judgeRows[0]; criteria: LlmJudgeCriterion[] }>()

    for (const row of judgeRows) {
      if (!row.rubric_file) continue // skip old data without rubric_file
      const key = groupKey(row.test_name, row.rubric_file)
      if (!judgeGroupMap.has(key)) judgeGroupMap.set(key, { criteria: [] })
      const group = judgeGroupMap.get(key)!

      if (row.expect_type === 'llm-judge-aggregate') {
        group.aggregateRow = row
      } else {
        group.criteria.push({
          criterion:   row.expect_value,
          passed:      row.passed,
          confidence:  row.confidence as "partial" | "full" | undefined,
          reasoning:   row.reasoning,
        })
      }
    }

    const llmJudgeGroups: LlmJudgeGroup[] = []
    for (const [key, group] of judgeGroupMap) {
      const agg = group.aggregateRow
      if (!agg) continue // no aggregate = incomplete data
      const testName = key.split('::')[0]
      llmJudgeGroups.push({
        testName,
        rubricFile: agg.rubric_file!,
        model: agg.judge_model ?? 'unknown',
        threshold: agg.judge_threshold ?? 1.0,
        score: agg.judge_score ?? 0,
        passed: agg.passed,
        resultText: resultTextByTest.get(testName),
        criteria: group.criteria,
      })
    }

    // Query output files
    let outputFiles: OutputFileRow[] = []
    if (existsSync(`${dataDir}/output-files.parquet`)) {
      try {
        const outputFilesSql = `
          SELECT test_name, file_path, file_content
          FROM read_parquet('${dataDir}/output-files.parquet')
          WHERE test_run_id = $1
          ORDER BY test_name, file_path
        `
        const outputFileRows = (await conn.runAndReadAll(outputFilesSql, [testRunId])).getRowObjects() as unknown as { test_name: string; file_path: string; file_content: string }[]
        outputFiles = outputFileRows.map(row => ({
          testName: row.test_name,
          filePath: row.file_path,
          fileContent: row.file_content,
        }))
      } catch {
        // output-files.parquet may not exist yet
      }
    }

    return { summary, expectations, llmJudgeGroups, outputFiles }
  })
}

