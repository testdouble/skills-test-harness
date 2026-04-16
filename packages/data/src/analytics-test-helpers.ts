/**
 * Test helpers for building analytics integration test fixtures.
 * Creates the same on-disk structure that run-test.ts produces.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type {
  AcilIterationRecord,
  AcilSummaryRecord,
  AcilTrainResult,
  ScilIterationRecord,
  ScilSummaryRecord,
  ScilTrainResult,
  TestConfigRecord,
  TestResultRecord,
} from './types.js'

// ─── directory helpers ────────────────────────────────────────────────────────

/** Create a unique temp directory for one test. */
export async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'harness-test-'))
}

/** Write an array of objects as newline-delimited JSON. */
export async function writeJsonl(filePath: string, records: unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const content = `${records.map((r) => JSON.stringify(r)).join('\n')}\n`
  await writeFile(filePath, content, 'utf8')
}

// ─── fixture factories ────────────────────────────────────────────────────────

/** Build a test_case ID the same way run-test.ts does via buildTestCaseId. */
export function testCaseId(suite: string, testName: string): string {
  const normalized = testName.replace(/ /g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  return `${suite}-${normalized}`
}

/** Minimal TestConfigRecord for a test case. */
export function makeConfigRecord(opts: {
  testRunId: string
  suite: string
  testName: string
  plugins?: string[]
  model?: string
}): TestConfigRecord {
  return {
    test_run_id: opts.testRunId,
    suite: opts.suite,
    plugins: opts.plugins ?? [],
    test: {
      name: opts.testName,
      promptFile: 'prompt.md',
      model: opts.model ?? 'sonnet',
      expect: [],
    },
  }
}

/** A result event enriched with test_run_id and test_case, as written by appendTestRun. */
export function makeRunResultRecord(opts: {
  testRunId: string
  suite: string
  testName: string
  totalCostUsd?: number
  numTurns?: number
  inputTokens?: number
  outputTokens?: number
  isError?: boolean
}): Record<string, unknown> {
  return {
    type: 'result',
    test_run_id: opts.testRunId,
    test_case: testCaseId(opts.suite, opts.testName),
    result: 'ok',
    total_cost_usd: opts.totalCostUsd ?? 0.01,
    num_turns: opts.numTurns ?? 3,
    is_error: opts.isError ?? false,
    usage: {
      input_tokens: opts.inputTokens ?? 100,
      output_tokens: opts.outputTokens ?? 50,
    },
  }
}

/** A TestResultRecord as written by appendTestResults. */
export function makeResultRecord(opts: {
  testRunId: string
  suite: string
  testName: string
  expectType?: string
  expectValue?: string
  passed?: boolean
  status?: 'evaluated' | 'infrastructure-error'
  errorMessage?: string
  judgeModel?: string
  judgeThreshold?: number
  judgeScore?: number
  rubricFile?: string
}): TestResultRecord {
  const record: TestResultRecord = {
    test_run_id: opts.testRunId,
    suite: opts.suite,
    test_name: opts.testName,
    expect_type: opts.expectType ?? 'result-contains',
    expect_value: opts.expectValue ?? 'expected value',
    passed: opts.passed ?? true,
  }
  if (opts.status) record.status = opts.status
  if (opts.errorMessage) record.error_message = opts.errorMessage
  if (opts.judgeModel) record.judge_model = opts.judgeModel
  if (opts.judgeThreshold !== undefined) record.judge_threshold = opts.judgeThreshold
  if (opts.judgeScore !== undefined) record.judge_score = opts.judgeScore
  if (opts.rubricFile) record.rubric_file = opts.rubricFile
  return record
}

// ─── scenario builder ─────────────────────────────────────────────────────────

/**
 * Write the three JSONL files for one test run under outputDir/{runId}/.
 * Mirrors exactly what run-test.ts produces per test iteration.
 */
export async function writeRunFixture(opts: {
  outputDir: string
  testRunId: string
  suite: string
  testName: string
  passed?: boolean
  totalCostUsd?: number
  numTurns?: number
  inputTokens?: number
  outputTokens?: number
  isError?: boolean
}): Promise<void> {
  const runDir = path.join(opts.outputDir, opts.testRunId)

  await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
    makeConfigRecord({ testRunId: opts.testRunId, suite: opts.suite, testName: opts.testName }),
  ])

  await writeJsonl(path.join(runDir, 'test-run.jsonl'), [
    makeRunResultRecord({
      testRunId: opts.testRunId,
      suite: opts.suite,
      testName: opts.testName,
      totalCostUsd: opts.totalCostUsd,
      numTurns: opts.numTurns,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      isError: opts.isError,
    }),
  ])

  await writeJsonl(path.join(runDir, 'test-results.jsonl'), [
    makeResultRecord({
      testRunId: opts.testRunId,
      suite: opts.suite,
      testName: opts.testName,
      passed: opts.passed ?? true,
    }),
  ])
}

// ─── SCIL fixture factories ─────────────────────────────────────────────────

/** Build a default ScilTrainResult. */
function makeScilTrainResult(overrides?: Partial<ScilTrainResult>): ScilTrainResult {
  return {
    testName: 'Skill Call: test',
    skillFile: 'plugin:skill',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    ...overrides,
  }
}

/** Build a default ScilIterationRecord. */
export function makeScilIterationRecord(overrides?: Partial<ScilIterationRecord>): ScilIterationRecord {
  return {
    test_run_id: '20260101T200001',
    iteration: 1,
    phase: null,
    description: 'test description',
    trainResults: [makeScilTrainResult()],
    testResults: [],
    trainAccuracy: 1.0,
    testAccuracy: null,
    ...overrides,
  }
}

/** Build a default ScilSummaryRecord. */
export function makeScilSummaryRecord(overrides?: Partial<ScilSummaryRecord>): ScilSummaryRecord {
  return {
    test_run_id: '20260101T200001',
    originalDescription: 'original description',
    bestIteration: 1,
    bestDescription: 'best description',
    ...overrides,
  }
}

/**
 * Write SCIL output files for one run under outputDir/{runId}/.
 * Creates scil-iteration.jsonl and scil-summary.json.
 */
export async function writeScilRunFixture(opts: {
  outputDir: string
  runId: string
  iterations: ScilIterationRecord[]
}): Promise<void> {
  const runDir = path.join(opts.outputDir, opts.runId)

  await writeJsonl(path.join(runDir, 'scil-iteration.jsonl'), opts.iterations)

  const summary: ScilSummaryRecord & { iterations: unknown[] } = {
    test_run_id: opts.runId,
    originalDescription: opts.iterations[0]?.description ?? 'original',
    bestIteration: 1,
    bestDescription: opts.iterations[0]?.description ?? 'best',
    iterations: opts.iterations.map((i) => ({
      iteration: i.iteration,
      trainAccuracy: i.trainAccuracy,
      testAccuracy: i.testAccuracy,
      description: i.description,
    })),
  }

  await mkdir(runDir, { recursive: true })
  await writeFile(path.join(runDir, 'scil-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
}

// ─── ACIL fixture factories ─────────────────────────────────────────────────

/** Build a default AcilTrainResult. */
function makeAcilTrainResult(overrides?: Partial<AcilTrainResult>): AcilTrainResult {
  return {
    testName: 'Agent Call: test',
    agentFile: 'plugin:agent',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    ...overrides,
  }
}

/** Build a default AcilIterationRecord. */
export function makeAcilIterationRecord(overrides?: Partial<AcilIterationRecord>): AcilIterationRecord {
  return {
    test_run_id: '20260101T300001',
    iteration: 1,
    phase: null,
    description: 'test agent description',
    trainResults: [makeAcilTrainResult()],
    testResults: [],
    trainAccuracy: 1.0,
    testAccuracy: null,
    ...overrides,
  }
}

/** Build a default AcilSummaryRecord. */
export function makeAcilSummaryRecord(overrides?: Partial<AcilSummaryRecord>): AcilSummaryRecord {
  return {
    test_run_id: '20260101T300001',
    originalDescription: 'original agent description',
    bestIteration: 1,
    bestDescription: 'best agent description',
    ...overrides,
  }
}

/**
 * Write ACIL output files for one run under outputDir/{runId}/.
 * Creates acil-iteration.jsonl and acil-summary.json.
 */
export async function writeAcilRunFixture(opts: {
  outputDir: string
  runId: string
  iterations: AcilIterationRecord[]
}): Promise<void> {
  const runDir = path.join(opts.outputDir, opts.runId)

  await writeJsonl(path.join(runDir, 'acil-iteration.jsonl'), opts.iterations)

  const summary: AcilSummaryRecord & { iterations: unknown[] } = {
    test_run_id: opts.runId,
    originalDescription: opts.iterations[0]?.description ?? 'original',
    bestIteration: 1,
    bestDescription: opts.iterations[0]?.description ?? 'best',
    iterations: opts.iterations.map((i) => ({
      iteration: i.iteration,
      trainAccuracy: i.trainAccuracy,
      testAccuracy: i.testAccuracy,
      description: i.description,
    })),
  }

  await mkdir(runDir, { recursive: true })
  await writeFile(path.join(runDir, 'acil-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
}
