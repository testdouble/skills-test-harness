import path from 'node:path'
import { extractOutputFiles, runClaude } from '@testdouble/claude-integration'
import type { ParsedRunMetrics, RunTotals, TestCase, TestSuiteConfig } from '@testdouble/harness-data'
import {
  appendOutputFiles,
  buildTestCaseId,
  extractMetrics,
  parseStreamJsonLines,
  readPromptFile,
  resolvePromptPath,
} from '@testdouble/harness-data'
import { HarnessError } from '../../lib/errors.js'
import { accumulateTotals } from '../../lib/metrics.js'
import { writeTestOutput } from '../../lib/output.js'

function printRunningTest(testName: string): void {
  process.stderr.write(`\nRunning test: "${testName}"\n`)
}

function printTestConfig(test: TestCase, plugins: string[]): void {
  process.stderr.write(`  - type: ${test.type ?? 'skill-prompt'}\n`)
  process.stderr.write(`  - model: ${test.model ?? 'sonnet'}\n`)
  process.stderr.write(`  - promptFile: ${test.promptFile}\n`)
  process.stderr.write(`  - plugins: ${plugins.join(', ')}\n`)
}

async function resolveAndReadPrompt(testSuiteDir: string, test: TestCase): Promise<string> {
  const promptPath = resolvePromptPath(testSuiteDir, test.promptFile)
  const promptContent = await readPromptFile(promptPath).catch(() => {
    throw new HarnessError(`Prompt file not found: ${promptPath}`)
  })
  return promptContent
}

function checkRunFailures(exitCode: number, metrics: ParsedRunMetrics, failures: number): number {
  if (exitCode !== 0) {
    failures++
    process.stderr.write(`  [FAIL] Sandbox exited with code ${exitCode}\n`)
  }
  if (metrics.isError) {
    failures++
    process.stderr.write(`  [FAIL] Claude reported is_error=true\n`)
  }
  return failures
}

function printTestDone(testName: string): void {
  process.stderr.write(`[DONE] "${testName}"\n`)
}

function printTestStats(metrics: ParsedRunMetrics): void {
  process.stderr.write(`  - Duration (ms): ${metrics.durationMs}\n`)
  process.stderr.write(`  - Input Tokens:  ${metrics.inputTokens}\n`)
  process.stderr.write(`  - Output Tokens: ${metrics.outputTokens}\n`)
}

export async function runPromptTests(
  tests: TestCase[],
  config: TestSuiteConfig,
  suite: string,
  testSuiteDir: string,
  pluginDirs: string[],
  debug: boolean,
  testRunId: string,
  totals: RunTotals,
  outputDir: string,
): Promise<RunTotals> {
  let { failures } = totals
  let current = totals

  for (const test of tests) {
    printRunningTest(test.name)
    printTestConfig(test, config.plugins)

    const promptContent = await resolveAndReadPrompt(testSuiteDir, test)

    const scaffoldPath = test.scaffold ? path.join(testSuiteDir, 'scaffolds', test.scaffold) : null

    const { exitCode, stdout } = await runClaude({
      model: test.model ?? 'sonnet',
      prompt: promptContent,
      pluginDirs,
      scaffold: scaffoldPath,
      debug,
    })

    const outputFiles = await extractOutputFiles(debug)

    const events = parseStreamJsonLines(stdout)
    const metrics = extractMetrics(events)
    failures = checkRunFailures(exitCode, metrics, failures)

    printTestDone(test.name)
    printTestStats(metrics)
    current = accumulateTotals(current, metrics)

    const runDir = path.join(outputDir, testRunId)
    await writeTestOutput(runDir, testRunId, suite, config.plugins, test, events)
    await appendOutputFiles(runDir, testRunId, buildTestCaseId(suite, test.name), outputFiles)
  }

  return { ...current, failures }
}
