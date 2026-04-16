import type { StreamJsonEvent, TestCase } from '@testdouble/harness-data'
import { appendTestConfig, appendTestRun, buildTestCaseId, ensureOutputDir } from '@testdouble/harness-data'

export async function writeTestOutput(
  runDir: string,
  testRunId: string,
  suite: string,
  plugins: string[],
  test: TestCase,
  events: StreamJsonEvent[],
): Promise<void> {
  await ensureOutputDir(runDir)
  await appendTestConfig(runDir, { test_run_id: testRunId, suite, plugins, test })
  await appendTestRun(runDir, events, testRunId, buildTestCaseId(suite, test.name))
}
