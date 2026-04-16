import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { StreamJsonEvent, TestConfigRecord, TestResultRecord } from '@testdouble/harness-data'
import { buildTestCaseId, extractMetrics, readJsonlFile } from '@testdouble/harness-data'
import type { EvalProgressEvent, EvalResult, LlmJudgeEvalResult } from '@testdouble/harness-evals'
import { evaluateTestRun } from '@testdouble/harness-evals'
import { markAsReEvaluated } from '../re-eval-marker.js'
import { resolveRunDir } from '../test-eval-steps/step-1-resolve-run-dir.js'
import { writeResults } from '../test-eval-steps/step-4-write-results.js'
import { printTotals } from '../test-runners/steps/step-9-print-totals.js'

export interface RunTestEvalOptions {
  testRunId?: string
  debug: boolean
  outputDir: string
  testsDir: string
}

export function evalResultToTestResultRecord(result: EvalResult): TestResultRecord[] {
  if (result.kind === 'boolean') {
    return [
      {
        test_run_id: result.test_run_id,
        suite: result.suite,
        test_name: result.test_name,
        expect_type: result.expect_type,
        expect_value: result.expect_value,
        passed: result.passed,
        ...(result.status === 'infrastructure-error'
          ? { status: result.status, error_message: result.error_message }
          : {}),
      },
    ]
  }

  // LLM judge: produce per-criterion records + aggregate record (matching original format)
  const judge = result as LlmJudgeEvalResult
  const records: TestResultRecord[] = []

  for (const cr of judge.criteria) {
    const record: TestResultRecord = {
      test_run_id: judge.test_run_id,
      suite: judge.suite,
      test_name: judge.test_name,
      expect_type: 'llm-judge',
      expect_value: cr.criterion,
      passed: cr.passed,
      reasoning: cr.reasoning,
      judge_model: judge.judge_model,
      rubric_file: judge.rubric_file,
    }
    if (cr.confidence === 'partial') record.confidence = 'partial'
    records.push(record)
  }

  records.push({
    test_run_id: judge.test_run_id,
    suite: judge.suite,
    test_name: judge.test_name,
    expect_type: 'llm-judge-aggregate',
    expect_value: judge.rubric_file,
    passed: judge.passed,
    judge_model: judge.judge_model,
    judge_threshold: judge.judge_threshold,
    judge_score: judge.judge_score,
    rubric_file: judge.rubric_file,
    ...(judge.status === 'infrastructure-error' ? { status: judge.status, error_message: judge.error_message } : {}),
  })

  return records
}

export function logProgress(event: EvalProgressEvent): void {
  switch (event.type) {
    case 'eval-start':
      if (event.expectType === 'llm-judge') {
        console.log(`  Running LLM judge for "${event.testName}"...`)
      }
      break
    case 'eval-complete': {
      const r = event.result
      if (r.kind === 'boolean') {
        const status = r.passed ? 'PASS' : 'FAIL'
        console.log(`  - ${r.expect_type} "${r.expect_value}": ${status}`)
      } else {
        for (const cr of r.criteria) {
          const isPartial = cr.passed && cr.confidence === 'partial'
          const label = isPartial ? 'PARTIAL' : cr.passed ? 'PASS' : 'FAIL'
          console.log(`  - [${label}] llm-judge "${cr.criterion}"`)
        }
        const label = r.passed ? 'PASS' : 'FAIL'
        console.log(
          `  - [${label}] llm-judge-aggregate score=${r.judge_score.toFixed(2)} threshold=${r.judge_threshold}`,
        )
      }
      break
    }
    case 'eval-error':
      console.log(`  ⚠ Evaluation failed: ${event.error}`)
      break
  }
}

async function isTestRunDir(runDir: string): Promise<boolean> {
  try {
    await stat(path.join(runDir, 'test-config.jsonl'))
    return true
  } catch {
    return false
  }
}

async function hasBeenEvaluated(runDir: string): Promise<boolean> {
  try {
    const s = await stat(path.join(runDir, 'test-results.jsonl'))
    return s.size > 0
  } catch {
    return false
  }
}

async function filterUnevaluated(ids: string[], outputDir: string): Promise<string[]> {
  const out: string[] = []
  for (const id of ids) {
    const runDir = path.join(outputDir, id)
    if ((await isTestRunDir(runDir)) && !(await hasBeenEvaluated(runDir))) out.push(id)
  }
  return out
}

function getTestSuiteDir(suite: string, testsDir: string): string {
  return path.join(testsDir, 'test-suites', suite)
}

async function computeMetrics(
  runDir: string,
): Promise<{ totalDurationMs: number; totalInputTokens: number; totalOutputTokens: number }> {
  type StoredEvent = StreamJsonEvent & { test_run_id: string; test_case: string }
  const storedEvents = await readJsonlFile<StoredEvent>(path.join(runDir, 'test-run.jsonl'))
  const testConfigs = await readJsonlFile<TestConfigRecord>(path.join(runDir, 'test-config.jsonl'))

  let totalDurationMs = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const record of testConfigs) {
    const testCaseId = buildTestCaseId(record.suite, record.test.name)
    const events = storedEvents.filter((e: StoredEvent) => e.test_case === testCaseId)
    const metrics = extractMetrics(events)
    totalDurationMs += metrics.durationMs
    totalInputTokens += metrics.inputTokens
    totalOutputTokens += metrics.outputTokens
  }

  return { totalDurationMs, totalInputTokens, totalOutputTokens }
}

export async function runTestEval(opts: RunTestEvalOptions): Promise<void> {
  const { testRunId, outputDir, testsDir } = opts

  let testRunIds: string[]
  if (testRunId) {
    testRunIds = [testRunId]
  } else {
    const allIds = (await readdir(outputDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
    testRunIds = await filterUnevaluated(allIds, outputDir)
    if (testRunIds.length === 0) {
      console.log('All runs already evaluated. Use test-eval <run_id> to force re-evaluation.')
      return
    }
  }

  for (const id of testRunIds) {
    const { runDir } = await resolveRunDir(id, outputDir)
    const wasEvaluated = testRunId != null ? await hasBeenEvaluated(runDir) : false

    // Determine suite from test configs
    const testConfigs = await readJsonlFile<TestConfigRecord>(path.join(runDir, 'test-config.jsonl'))
    const suite = testConfigs[0]?.suite ?? ''
    const suiteDir = getTestSuiteDir(suite, testsDir)

    console.log()
    for (const record of testConfigs) {
      console.log(record.test.name)
      console.log(`  - run id: ${id}`)
      console.log(`  - suite: ${record.suite}`)
      console.log(`  - prompt: ${record.test.promptFile}`)
      console.log(`  - plugins: ${record.plugins.join(', ')}`)
      if (record.test.type) console.log(`  - type: ${record.test.type}`)
      if (record.test.model) console.log(`  - model: ${record.test.model}`)
      if (record.test.skillFile) console.log(`  - skill: ${record.test.skillFile}`)
      if (record.test.agentFile) console.log(`  - agent: ${record.test.agentFile}`)
    }

    const evalResults = await evaluateTestRun({
      runDir,
      suiteDir,
      testRunId: id,
      onProgress: logProgress,
    })

    const testResultRecords = evalResults.flatMap(evalResultToTestResultRecord)
    await writeResults(runDir, testResultRecords)

    if (wasEvaluated) await markAsReEvaluated(outputDir, id)

    const metrics = await computeMetrics(runDir)
    printTotals(metrics.totalDurationMs, metrics.totalInputTokens, metrics.totalOutputTokens, id)
  }
}
