import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { TestConfigRecord, StreamJsonEvent, TestResultRecord } from './types.js'

export async function ensureOutputDir(runDir: string): Promise<void> {
  await mkdir(runDir, { recursive: true })
}

export async function appendTestConfig(runDir: string, record: TestConfigRecord): Promise<void> {
  await appendFile(path.join(runDir, 'test-config.jsonl'), JSON.stringify(record) + '\n')
}

export async function appendTestRun(runDir: string, events: StreamJsonEvent[], testRunId: string, testCaseId: string): Promise<void> {
  const lines = events.map(event => {
    const enriched = { ...event, test_run_id: testRunId, test_case: testCaseId }
    return JSON.stringify(enriched)
  }).join('\n') + '\n'
  await appendFile(path.join(runDir, 'test-run.jsonl'), lines)
}

export async function appendTestResults(runDir: string, records: TestResultRecord[]): Promise<void> {
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n'
  await appendFile(path.join(runDir, 'test-results.jsonl'), lines)
}

export async function appendOutputFiles(
  runDir: string,
  testRunId: string,
  testName: string,
  files: { path: string; content: string }[]
): Promise<void> {
  if (files.length === 0) return
  const lines = files.map(f => JSON.stringify({
    test_run_id: testRunId,
    test_name: testName,
    file_path: f.path,
    file_content: f.content,
  })).join('\n') + '\n'
  await appendFile(path.join(runDir, 'output-files.jsonl'), lines)
}
