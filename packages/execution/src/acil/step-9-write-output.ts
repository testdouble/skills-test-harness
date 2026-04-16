import type { WritableIteration } from '../common/write-output.js'
import {
  writeIterationOutput as commonWriteIterationOutput,
  writeSummaryOutput as commonWriteSummaryOutput,
} from '../common/write-output.js'
import type { AcilIterationResult } from './types.js'

export async function writeIterationOutput(
  runDir: string,
  runId: string,
  iteration: AcilIterationResult,
): Promise<void> {
  await commonWriteIterationOutput(runDir, runId, iteration as unknown as WritableIteration, 'acil')
}

export async function writeSummaryOutput(
  runDir: string,
  runId: string,
  originalDescription: string,
  iterations: AcilIterationResult[],
  best: AcilIterationResult,
): Promise<void> {
  await commonWriteSummaryOutput(
    runDir,
    runId,
    originalDescription,
    iterations as unknown as WritableIteration[],
    best as unknown as WritableIteration,
    'acil',
  )
}
