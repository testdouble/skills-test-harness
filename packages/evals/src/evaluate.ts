import path from 'node:path'
import type { StreamJsonEvent, TestConfigRecord, TestExpectation } from '@testdouble/harness-data'
import { buildTestCaseId, readJsonlFile } from '@testdouble/harness-data'
import { evaluateAllExpectations } from './boolean-evals.js'
import { evaluateLlmJudge } from './llm-judge-eval.js'
import type { BooleanEvalResult, EvalResult, OnProgress } from './types.js'

type StoredEvent = StreamJsonEvent & { test_run_id: string; test_case: string }

async function readRunData(runDir: string): Promise<{
  testConfigs: TestConfigRecord[]
  eventsByTestCase: Map<string, StreamJsonEvent[]>
}> {
  const testConfigs = await readJsonlFile<TestConfigRecord>(path.join(runDir, 'test-config.jsonl'))
  const storedEvents = await readJsonlFile<StoredEvent>(path.join(runDir, 'test-run.jsonl'))

  const nonResultEvents = storedEvents.filter((e: StoredEvent) => e.type !== 'result')
  const incompatible = nonResultEvents.some((e: StoredEvent) => e.test_case == null)
  if (incompatible) {
    throw new Error('This run was created before test-eval support. Re-run with test-run to generate compatible data.')
  }

  const eventsByTestCase = new Map<string, StreamJsonEvent[]>()
  for (const record of testConfigs) {
    const testCaseId = buildTestCaseId(record.suite, record.test.name)
    eventsByTestCase.set(testCaseId, [])
  }
  for (const event of storedEvents) {
    const existing = eventsByTestCase.get(event.test_case) ?? []
    existing.push(event)
    eventsByTestCase.set(event.test_case, existing)
  }

  return { testConfigs, eventsByTestCase }
}

export async function evaluateTestRun(options: {
  runDir: string
  suiteDir: string
  testRunId: string
  onProgress?: OnProgress
}): Promise<EvalResult[]> {
  const { runDir, suiteDir, testRunId, onProgress } = options
  const { testConfigs, eventsByTestCase } = await readRunData(runDir)

  const results: EvalResult[] = []

  for (const record of testConfigs) {
    const { suite, test } = record
    const testCaseId = buildTestCaseId(suite, test.name)
    const events = eventsByTestCase.get(testCaseId) ?? []

    // Boolean expectations
    const booleanExpectations = test.expect.filter((e: TestExpectation) => e.type !== 'llm-judge')

    for (const expectation of booleanExpectations) {
      onProgress?.({ type: 'eval-start', testName: test.name, expectType: expectation.type })
    }

    const expectationResults = evaluateAllExpectations(test.expect, events)

    for (const er of expectationResults) {
      const booleanResult: BooleanEvalResult = {
        kind: 'boolean',
        test_run_id: testRunId,
        suite,
        test_name: test.name,
        expect_type: er.expect_type as BooleanEvalResult['expect_type'],
        expect_value: er.expect_value,
        passed: er.passed,
        status: 'evaluated',
      }
      results.push(booleanResult)
      onProgress?.({ type: 'eval-complete', testName: test.name, result: booleanResult })
    }

    // LLM judge expectations
    const judgeResults = await evaluateLlmJudge(record, events, testRunId, suiteDir, runDir, onProgress)
    results.push(...judgeResults)
  }

  return results
}
