import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  getResultText, parseStreamJsonLines, readJsonlFile, buildTestCaseId
} from '@testdouble/harness-data'
import type { TestConfigRecord, StreamJsonEvent, TestExpectation } from '@testdouble/harness-data'
import { runClaude } from '@testdouble/claude-integration'
import { parseRubricSections } from './rubric-parser.js'
import { buildJudgePrompt } from './llm-judge-prompt.js'
import type { LlmJudgeEvalResult, LlmJudgeCriterionResult, OnProgress } from './types.js'

interface JudgeCriterionResponse {
  criterion:   string
  passed:      boolean
  confidence?: "partial" | "full"
  reasoning:   string
}

interface OutputFileRecord {
  test_run_id: string
  test_name: string
  file_path: string
  file_content: string
}

async function loadOutputFiles(runDir: string, testName: string): Promise<Map<string, string>> {
  const outputFilesPath = path.join(runDir, 'output-files.jsonl')
  const map = new Map<string, string>()
  try {
    const records = await readJsonlFile<OutputFileRecord>(outputFilesPath)
    for (const record of records) {
      if (record.test_name === testName) {
        map.set(record.file_path, record.file_content)
      }
    }
  } catch {
    // No output-files.jsonl — return empty map
  }
  return map
}

export async function evaluateLlmJudge(
  record: TestConfigRecord,
  events: StreamJsonEvent[],
  testRunId: string,
  suiteDir: string,
  runDir: string,
  onProgress?: OnProgress
): Promise<LlmJudgeEvalResult[]> {
  const { suite, test } = record
  const judgeExpectations = test.expect.filter(
    (e: TestExpectation): e is Extract<TestExpectation, { type: 'llm-judge' }> => e.type === 'llm-judge'
  )
  if (judgeExpectations.length === 0) return []

  const results: LlmJudgeEvalResult[] = []

  for (const expectation of judgeExpectations) {
    const model = expectation.model ?? 'opus'
    const threshold = expectation.threshold ?? 1.0

    onProgress?.({ type: 'eval-start', testName: test.name, expectType: 'llm-judge' })

    try {
      const rubricPath = path.join(suiteDir, 'rubrics', expectation.rubricFile)
      const rubricMarkdown = await readFile(rubricPath, 'utf8')
      const sections = parseRubricSections(rubricMarkdown)

      const allCriteria = sections.flatMap(s => s.criteria)
      if (allCriteria.length === 0) {
        results.push({
          kind: 'llm-judge',
          test_run_id: testRunId,
          suite,
          test_name: test.name,
          expect_type: 'llm-judge',
          expect_value: expectation.rubricFile,
          passed: false,
          status: 'infrastructure-error',
          error_message: `No criteria found in rubric: ${expectation.rubricFile}`,
          judge_model: model,
          judge_score: 0,
          judge_threshold: threshold,
          rubric_file: expectation.rubricFile,
          criteria: [],
        })
        continue
      }

      const resultText = getResultText(events) ?? ''
      const scaffoldDir = test.scaffold ? path.join(suiteDir, 'scaffolds', test.scaffold) : null

      // Load output files for file-scoped rubric sections
      const hasFileSections = sections.some(s => s.type === 'file')
      const outputFiles = hasFileSections ? await loadOutputFiles(runDir, buildTestCaseId(suite, test.name)) : new Map<string, string>()

      const { prompt: judgePrompt, autoFailCriteria } = await buildJudgePrompt(
        sections, resultText, scaffoldDir, events, outputFiles, { testType: test.type }
      )

      // Build auto-fail results for missing file criteria
      const autoFailResults: LlmJudgeCriterionResult[] = autoFailCriteria.map(criterion => ({
        criterion,
        passed: false,
        reasoning: 'Output file was not produced by the agent',
      }))

      // Only call judge if there are criteria to evaluate (non-auto-fail)
      let judgeCriteriaResults: LlmJudgeCriterionResult[] = []
      const judgeCriteriaCount = allCriteria.length - autoFailCriteria.length

      if (judgeCriteriaCount > 0) {
        const { stdout } = await runClaude({ model, prompt: judgePrompt })

        const judgeEvents = parseStreamJsonLines(stdout)
        const judgeResultText = getResultText(judgeEvents)

        if (!judgeResultText) {
          throw new Error('Judge returned no result text')
        }

        const jsonText = judgeResultText.replace(/^[\s\S]*?```(?:json)?\s*\n?/, '').replace(/\n?```[\s\S]*$/, '').trim()
        const parsed = JSON.parse(jsonText || judgeResultText) as { criteria: JudgeCriterionResponse[] }

        for (const cr of parsed.criteria) {
          const passed = cr.passed === true
          const criterionResult: LlmJudgeCriterionResult = {
            criterion: cr.criterion,
            passed,
            reasoning: cr.reasoning,
          }
          if (passed && cr.confidence === 'partial') criterionResult.confidence = 'partial'
          judgeCriteriaResults.push(criterionResult)
        }
      }

      // Merge all criteria results
      const evalCriteria = [...judgeCriteriaResults, ...autoFailResults]

      // Compute score
      let passedCount = 0
      for (const cr of evalCriteria) {
        const isPartial = cr.passed && cr.confidence === 'partial'
        if (isPartial) {
          passedCount += 0.5
        } else if (cr.passed) {
          passedCount += 1
        }
      }

      const score = passedCount / allCriteria.length
      const aggregatePassed = score >= threshold

      const result: LlmJudgeEvalResult = {
        kind: 'llm-judge',
        test_run_id: testRunId,
        suite,
        test_name: test.name,
        expect_type: 'llm-judge',
        expect_value: expectation.rubricFile,
        passed: aggregatePassed,
        status: 'evaluated',
        judge_model: model,
        judge_score: score,
        judge_threshold: threshold,
        rubric_file: expectation.rubricFile,
        criteria: evalCriteria,
      }

      results.push(result)
      onProgress?.({ type: 'eval-complete', testName: test.name, result })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      const result: LlmJudgeEvalResult = {
        kind: 'llm-judge',
        test_run_id: testRunId,
        suite,
        test_name: test.name,
        expect_type: 'llm-judge',
        expect_value: expectation.rubricFile,
        passed: false,
        status: 'infrastructure-error',
        error_message: errorMessage,
        judge_model: model,
        judge_score: 0,
        judge_threshold: threshold,
        rubric_file: expectation.rubricFile,
        criteria: [],
      }

      results.push(result)
      onProgress?.({ type: 'eval-error', testName: test.name, error: errorMessage })
    }
  }

  return results
}
