import {
  ensureOutputDir, appendTestConfig, appendTestRun, buildTestCaseId
} from '@testdouble/harness-data'
import type { TestCase, StreamJsonEvent } from '@testdouble/harness-data'

export async function writeTestOutput(
  runDir: string,
  testRunId: string,
  suite: string,
  plugins: string[],
  test: TestCase,
  events: StreamJsonEvent[]
): Promise<void> {
  await ensureOutputDir(runDir)
  await appendTestConfig(runDir, { test_run_id: testRunId, suite, plugins, test })
  await appendTestRun(runDir, events, testRunId, buildTestCaseId(suite, test.name))
}
