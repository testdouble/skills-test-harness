import { withConnection } from './connection.js'
import type {
  AcilHistoryRow,
  AcilIterationRow,
  AcilRunDetails,
  AcilSummaryRow,
  ScilHistoryRow,
  ScilIterationRow,
  ScilRunDetails,
  ScilSummaryRow,
} from './types.js'
import { InvalidRunIdError } from './types.js'

function validateRunId(runId: string): void {
  if (!/^\d{8}T\d{6}$/.test(runId)) {
    throw new InvalidRunIdError(runId)
  }
}

function convertBigInts(val: unknown): unknown {
  if (typeof val === 'bigint') return Number(val)
  if (val !== null && typeof val === 'object') {
    const name = (val as { constructor?: { name?: string } }).constructor?.name
    if (name === 'DuckDBListValue') {
      return (val as { items: unknown[] }).items.map(convertBigInts)
    }
    if (name === 'DuckDBStructValue') {
      return Object.fromEntries(
        Object.entries((val as { entries: Record<string, unknown> }).entries).map(([k, v]) => [k, convertBigInts(v)]),
      )
    }
    if (Array.isArray(val)) return val.map(convertBigInts)
    return Object.fromEntries(Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, convertBigInts(v)]))
  }
  return val
}

export async function queryScilHistory(dataDir: string): Promise<ScilHistoryRow[]> {
  return withConnection(dataDir, async (conn) => {
    const sql = `
      SELECT
        i.test_run_id,
        i.skill_file,
        CAST(MAX(i.iteration) AS INTEGER) AS iteration_count,
        MAX(i.trainAccuracy) AS best_train_accuracy
      FROM read_parquet('${dataDir}/scil-iteration.parquet') i
      GROUP BY i.test_run_id, i.skill_file
      ORDER BY i.test_run_id DESC
    `
    const rows = (await conn.runAndReadAll(sql)).getRowObjects()
    return rows as unknown as ScilHistoryRow[]
  })
}

export async function queryScilRunDetails(dataDir: string, runId: string): Promise<ScilRunDetails> {
  validateRunId(runId)
  return withConnection(dataDir, async (conn) => {
    const existsRows = (
      await conn.runAndReadAll(
        `SELECT 1 FROM read_parquet('${dataDir}/scil-summary.parquet')
      WHERE test_run_id = $1
      LIMIT 1`,
        [runId],
      )
    ).getRowObjects()
    if (existsRows.length === 0) {
      throw new Error(`SCIL run not found: ${runId}`)
    }

    const summarySql = `
      SELECT test_run_id, originalDescription, CAST(bestIteration AS INTEGER) AS bestIteration, bestDescription
      FROM read_parquet('${dataDir}/scil-summary.parquet')
      WHERE test_run_id = $1
    `
    const summaryRows = (await conn.runAndReadAll(summarySql, [runId])).getRowObjects()

    const iterationsSql = `
      SELECT * REPLACE (CAST(iteration AS INTEGER) AS iteration)
      FROM read_parquet('${dataDir}/scil-iteration.parquet')
      WHERE test_run_id = $1
      ORDER BY iteration ASC
    `
    const iterationRows = (await conn.runAndReadAll(iterationsSql, [runId])).getRowObjects()

    return {
      summary: summaryRows[0] as unknown as ScilSummaryRow,
      iterations: convertBigInts(iterationRows) as unknown as ScilIterationRow[],
    }
  })
}

export async function queryAcilHistory(dataDir: string): Promise<AcilHistoryRow[]> {
  return withConnection(dataDir, async (conn) => {
    const sql = `
      SELECT
        i.test_run_id,
        i.agent_file,
        CAST(MAX(i.iteration) AS INTEGER) AS iteration_count,
        MAX(i.trainAccuracy) AS best_train_accuracy
      FROM read_parquet('${dataDir}/acil-iteration.parquet') i
      GROUP BY i.test_run_id, i.agent_file
      ORDER BY i.test_run_id DESC
    `
    const rows = (await conn.runAndReadAll(sql)).getRowObjects()
    return rows as unknown as AcilHistoryRow[]
  })
}

export async function queryAcilRunDetails(dataDir: string, runId: string): Promise<AcilRunDetails> {
  validateRunId(runId)
  return withConnection(dataDir, async (conn) => {
    const existsRows = (
      await conn.runAndReadAll(
        `SELECT 1 FROM read_parquet('${dataDir}/acil-summary.parquet')
      WHERE test_run_id = $1
      LIMIT 1`,
        [runId],
      )
    ).getRowObjects()
    if (existsRows.length === 0) {
      throw new Error(`ACIL run not found: ${runId}`)
    }

    const summarySql = `
      SELECT test_run_id, originalDescription, CAST(bestIteration AS INTEGER) AS bestIteration, bestDescription
      FROM read_parquet('${dataDir}/acil-summary.parquet')
      WHERE test_run_id = $1
    `
    const summaryRows = (await conn.runAndReadAll(summarySql, [runId])).getRowObjects()

    const iterationsSql = `
      SELECT * REPLACE (CAST(iteration AS INTEGER) AS iteration)
      FROM read_parquet('${dataDir}/acil-iteration.parquet')
      WHERE test_run_id = $1
      ORDER BY iteration ASC
    `
    const iterationRows = (await conn.runAndReadAll(iterationsSql, [runId])).getRowObjects()

    return {
      summary: summaryRows[0] as unknown as AcilSummaryRow,
      iterations: convertBigInts(iterationRows) as unknown as AcilIterationRow[],
    }
  })
}
