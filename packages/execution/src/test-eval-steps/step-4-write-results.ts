import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { appendTestResults } from '@testdouble/harness-data'
import type { TestResultRecord } from '@testdouble/harness-data'

export async function writeResults(runDir: string, results: TestResultRecord[]): Promise<void> {
  try {
    await unlink(path.join(runDir, 'test-results.jsonl'))
  } catch {
    // file may not exist; that's fine
  }
  await appendTestResults(runDir, results)
}
