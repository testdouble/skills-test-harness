export type EvalResult = BooleanEvalResult | LlmJudgeEvalResult

export interface BooleanEvalResult {
  kind: 'boolean'
  test_run_id: string
  suite: string
  test_name: string
  expect_type: 'result-contains' | 'result-does-not-contain' | 'skill-call'
  expect_value: string
  passed: boolean
  status: 'evaluated' | 'infrastructure-error'
  error_message?: string
}

export interface LlmJudgeEvalResult {
  kind: 'llm-judge'
  test_run_id: string
  suite: string
  test_name: string
  expect_type: 'llm-judge'
  expect_value: string
  passed: boolean
  status: 'evaluated' | 'infrastructure-error'
  error_message?: string
  judge_model: string
  judge_score: number
  judge_threshold: number
  rubric_file: string
  criteria: LlmJudgeCriterionResult[]
}

export interface LlmJudgeCriterionResult {
  criterion: string
  passed: boolean
  confidence?: 'partial' | 'full'
  reasoning?: string
}

export type EvalProgressEvent =
  | { type: 'eval-start'; testName: string; expectType: string }
  | { type: 'eval-complete'; testName: string; result: EvalResult }
  | { type: 'eval-error'; testName: string; error: string }

export type OnProgress = (event: EvalProgressEvent) => void
