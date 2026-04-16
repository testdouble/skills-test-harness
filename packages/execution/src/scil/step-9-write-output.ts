import type { IterationResult } from './types.js'
import type { WritableIteration } from '../common/write-output.js'
import {
  writeIterationOutput as commonWriteIterationOutput,
  writeSummaryOutput as commonWriteSummaryOutput,
} from '../common/write-output.js'

export async function writeIterationOutput(runDir: string, runId: string, iteration: IterationResult): Promise<void> {
  await commonWriteIterationOutput(runDir, runId, iteration as unknown as WritableIteration, 'scil')
}

export async function writeSummaryOutput(
  runDir:              string,
  runId:               string,
  originalDescription: string,
  iterations:          IterationResult[],
  best:                IterationResult
): Promise<void> {
  await commonWriteSummaryOutput(runDir, runId, originalDescription, iterations as unknown as WritableIteration[], best as unknown as WritableIteration, 'scil')
}
