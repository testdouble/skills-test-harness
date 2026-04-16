import type { Phase } from './phase.js'

export const TEST_CONFIG_FILENAME = 'tests.json'

export interface RunTotals {
  totalDurationMs:   number
  totalInputTokens:  number
  totalOutputTokens: number
  failures:          number
}

export class InvalidRunIdError extends Error {
  constructor(runId: string) {
    super(`Invalid run ID: ${runId}`)
    this.name = 'InvalidRunIdError'
  }
}

// Expectation discriminated union — mirrors the expect script types
export type TestExpectation =
  | { type: 'result-contains';         value: string }
  | { type: 'result-does-not-contain'; value: string }
  | { type: 'skill-call';              value: boolean; skillFile: string }
  | { type: 'agent-call';              value: boolean; agentFile: string }
  | { type: 'llm-judge';              rubricFile: string; model?: string; threshold?: number }

// A single test case from tests.json
export interface TestCase {
  name:       string
  type?:      string
  promptFile: string
  skillFile?: string
  agentFile?: string
  model?:     string      // defaults to "sonnet" when absent
  scaffold?:  string      // name of scaffolds/{name}/ directory in test suite
  expect:     TestExpectation[]
}

// Top-level tests.json structure
export interface TestSuiteConfig {
  plugins: string[]
  tests:   TestCase[]
}

// Stream-JSON event union — covers shapes seen in test-run.jsonl
export type StreamJsonEvent =
  | SystemInitEvent
  | AssistantEvent
  | UserEvent
  | ResultEvent

export interface SystemInitEvent {
  type:       'system'
  subtype:    'init'
  session_id: string
  // + other init fields
}

export interface AssistantEvent {
  type:    'assistant'
  message: { usage?: UsageStats; [key: string]: unknown }
  // + other fields
}

export interface UserEvent {
  type:             'user'
  tool_use_result?: ToolUseResult
  // + other fields
}

export interface ResultEvent {
  type:            'result'
  result?:         string
  is_error?:       boolean
  duration_ms?:    number
  num_turns?:      number
  total_cost_usd?: number
  usage?:          UsageStats
  // + other fields
}

export interface ToolUseResult {
  commandName?: string
  success?:     boolean
  agentType?:   string
  agentId?:     string
  status?:      string
  // + other fields
}

export interface UsageStats {
  input_tokens:                 number
  output_tokens:                number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?:     number
}

export interface ParsedRunMetrics {
  durationMs:   number
  inputTokens:  number
  outputTokens: number
  isError:      boolean
  result:       string | null
}

export interface ExpectationResult {
  expect_type:  string
  expect_value: string
  passed:       boolean
}

// JSONL record shapes written to output/{runId}/*.jsonl
export interface TestConfigRecord {
  test_run_id: string
  suite:       string
  plugins:     string[]
  test:        TestCase
}

export type TestRunRecord = StreamJsonEvent & {
  test_run_id: string
  test_case?:  string   // added only on type === "result" events
}

export interface TestResultRecord {
  test_run_id:      string
  suite:            string
  test_name:        string
  expect_type:      string
  expect_value:     string
  passed:           boolean
  status?:          'evaluated' | 'infrastructure-error'
  error_message?:   string
  confidence?:      "partial" | "full"
  reasoning?:       string
  judge_model?:     string
  judge_threshold?: number
  judge_score?:     number
  rubric_file?:     string
}

// JSONL record shapes for SCIL output files
export interface ScilTrainResult {
  testName:  string
  skillFile: string
  expected:  boolean
  actual:    boolean
  passed:    boolean
  runIndex:  number
}

export interface ScilIterationRecord {
  test_run_id:   string
  iteration:     number
  phase:         Phase | null
  description:   string
  trainResults:  ScilTrainResult[]
  testResults:   ScilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface ScilSummaryRecord {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

// SCIL domain types (used by scil-split, scil-prompt, and CLI step files)
export interface ScilTestCase extends TestCase {
  set: 'train' | 'test'
}

export interface QueryResult {
  testName:      string
  skillFile:     string
  promptContent: string
  expected:      boolean
  actual:        boolean
  passed:        boolean
  runIndex:      number
  events:        StreamJsonEvent[]
}

export interface IterationResult {
  iteration:     number
  phase:         Phase
  description:   string
  trainResults:  QueryResult[]
  testResults:   QueryResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

// ACIL domain types (used by acil pipeline step files)
export interface AcilTrainResult {
  testName:  string
  agentFile: string
  expected:  boolean
  actual:    boolean
  passed:    boolean
  runIndex:  number
}

export interface AcilQueryResult {
  testName:      string
  agentFile:     string
  promptContent: string
  expected:      boolean
  actual:        boolean
  passed:        boolean
  runIndex:      number
  events:        StreamJsonEvent[]
}

export interface AcilIterationResult {
  iteration:     number
  phase:         Phase
  description:   string
  trainResults:  AcilQueryResult[]
  testResults:   AcilQueryResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface AcilTestCase extends TestCase {
  set: 'train' | 'test'
}

// Analytics query result shapes — SCIL
export interface ScilHistoryRow {
  test_run_id:         string
  skill_file:          string
  iteration_count:     number
  best_train_accuracy: number
}

export interface ScilSummaryRow {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

export interface ScilIterationRow {
  test_run_id:   string
  iteration:     number
  phase:         Phase | null
  skill_file:    string
  description:   string
  trainResults:  ScilTrainResult[]
  testResults:   ScilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface ScilRunDetails {
  summary:    ScilSummaryRow
  iterations: ScilIterationRow[]
}

// Analytics query result shapes — ACIL
export interface AcilHistoryRow {
  test_run_id:         string
  agent_file:          string
  iteration_count:     number
  best_train_accuracy: number
}

export interface AcilSummaryRow {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

export interface AcilIterationRow {
  test_run_id:   string
  iteration:     number
  phase:         Phase | null
  agent_file:    string
  description:   string
  trainResults:  AcilTrainResult[]
  testResults:   AcilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface AcilRunDetails {
  summary:    AcilSummaryRow
  iterations: AcilIterationRow[]
}

// ACIL JSONL record shapes for output files
export interface AcilIterationRecord {
  test_run_id:   string
  iteration:     number
  phase:         Phase | null
  description:   string
  trainResults:  AcilTrainResult[]
  testResults:   AcilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface AcilSummaryRecord {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

// Test run summary — aggregated view of a test run
export interface TestRunSummary {
  test_run_id: string
  suite:       string
  date:        string
  total_tests: number
  passed:      number
  failed:      number
}

// Analytics query result shapes
export interface PerTestRow {
  test_run_id:             string
  test_name:               string
  suite:                   string
  all_expectations_passed: boolean
  total_cost_usd:          number
  num_turns:               number
  input_tokens:            number
  output_tokens:           number
}

export interface TestRunDetailRow extends PerTestRow {
  is_error: boolean
}

export interface TestRunExpectationRow {
  test_run_id:  string
  suite:        string
  test_name:    string
  expect_type:  string
  expect_value: string
  passed:       boolean
}

export interface LlmJudgeCriterion {
  criterion:   string
  passed:      boolean
  confidence?: "partial" | "full"
  reasoning?:  string
}

export interface LlmJudgeGroup {
  testName:    string
  rubricFile:  string
  model:       string
  threshold:   number
  score:       number
  passed:      boolean
  resultText?: string
  criteria:    LlmJudgeCriterion[]
}

export interface OutputFileRow {
  testName:    string
  filePath:    string
  fileContent: string
}

export interface TestRunDetails {
  summary:         TestRunDetailRow[]
  expectations:    TestRunExpectationRow[]
  llmJudgeGroups:  LlmJudgeGroup[]
  outputFiles:     OutputFileRow[]
}
