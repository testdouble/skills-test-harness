import path from 'node:path'
import { appendFile, writeFile } from 'node:fs/promises'
import { ensureOutputDir } from '@testdouble/harness-data'

export interface WritableIteration {
  iteration:     number
  phase?:        string
  description:   string
  trainResults:  Array<{ events: unknown[] }>
  testResults:   Array<{ events: unknown[] }>
  trainAccuracy: number
  testAccuracy:  number | null
}

export async function writeIterationOutput(runDir: string, runId: string, iteration: WritableIteration, prefix: string): Promise<void> {
  await ensureOutputDir(runDir)

  // Strip events from results — raw stream events are large and not needed here
  const stripped = {
    test_run_id: runId,
    ...iteration,
    trainResults: (iteration.trainResults as Array<Record<string, unknown>>).map(({ events: _events, ...r }) => r),
    testResults:  (iteration.testResults as Array<Record<string, unknown>>).map(({ events: _events, ...r }) => r),
  }

  const line = JSON.stringify(stripped) + '\n'
  await appendFile(path.join(runDir, `${prefix}-iteration.jsonl`), line, 'utf-8')
}

export async function writeSummaryOutput(
  runDir:              string,
  runId:               string,
  originalDescription: string,
  iterations:          WritableIteration[],
  best:                WritableIteration,
  prefix:              string
): Promise<void> {
  await ensureOutputDir(runDir)

  const summary = {
    test_run_id: runId,
    originalDescription,
    bestIteration:   best.iteration,
    bestDescription: best.description,
    iterations: iterations.map(i => ({
      iteration:     i.iteration,
      trainAccuracy: i.trainAccuracy,
      testAccuracy:  i.testAccuracy,
      description:   i.description,
    })),
  }

  await writeFile(path.join(runDir, `${prefix}-summary.json`), JSON.stringify(summary, null, 2), 'utf-8')
}
