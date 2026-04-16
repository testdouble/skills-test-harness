import { stat } from 'node:fs/promises'
import path from 'node:path'
import { RunNotFoundError } from '../lib/errors.js'

export async function resolveRunDir(testRunId: string, outputDir: string): Promise<{ runDir: string }> {
  const runDir = path.join(outputDir, testRunId)
  try {
    await stat(runDir)
  } catch {
    throw new RunNotFoundError(runDir)
  }
  return { runDir }
}
