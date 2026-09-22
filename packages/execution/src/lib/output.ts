import type { StreamJsonEvent, TestCase } from '@testdouble/skillwalker-data'
import { appendTestConfig, appendTestRun, buildTestCaseId, ensureOutputDir } from '@testdouble/skillwalker-data'

export async function writeTestOutput(
  runDir: string,
  testRunId: string,
  evalName: string,
  plugins: string[],
  test: TestCase,
  events: StreamJsonEvent[],
): Promise<void> {
  await ensureOutputDir(runDir)
  await appendTestConfig(runDir, { test_run_id: testRunId, eval: evalName, plugins, test })
  await appendTestRun(runDir, events, testRunId, buildTestCaseId(evalName, test.name))
}
