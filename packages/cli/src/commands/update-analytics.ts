import type { Argv } from 'yargs'
import { outputDir, dataDir } from '../paths.js'
import { updateAllParquet } from '@testdouble/harness-data'
import { getReEvaluatedRuns, clearReEvaluatedRuns } from '@testdouble/harness-execution'

export const command = 'update-analytics-data'
export const describe = 'Import JSONL output files into Parquet for analytics'

export function builder(yargs: Argv): Argv {
  return yargs
    .option('output-dir', { type: 'string', default: outputDir, describe: 'Path to test output directory' })
    .option('data-dir', { type: 'string', default: dataDir, describe: 'Path to analytics data directory' })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const resolvedOutputDir = argv['output-dir'] as string
  const resolvedDataDir = argv['data-dir'] as string

  const reEvaluatedRuns = await getReEvaluatedRuns(resolvedOutputDir)

  const ALL_TABLES = ['test-config', 'test-run', 'test-results', 'scil-iteration', 'scil-summary']
  const { updated } = await updateAllParquet({
    outputDir: resolvedOutputDir,
    dataDir: resolvedDataDir,
    reEvaluatedRunIds: reEvaluatedRuns,
  })

  if (reEvaluatedRuns.length > 0) {
    await clearReEvaluatedRuns(resolvedOutputDir, reEvaluatedRuns)
  }

  for (const table of ALL_TABLES) {
    if (table === 'test-results' && reEvaluatedRuns.length > 0 && updated.includes(table)) {
      console.log(`  replaced: test-results.parquet (${reEvaluatedRuns.length} re-evaluated run(s))`)
    } else if (updated.includes(table)) {
      console.log(`  updated: ${table}.parquet`)
    } else {
      console.log(`  no data found for: ${table}`)
    }
  }
}
