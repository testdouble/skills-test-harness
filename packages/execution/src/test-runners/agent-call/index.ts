import path from 'node:path'
import { resolvePromptPath, readPromptFile, parseStreamJsonLines, extractMetrics, appendOutputFiles, buildTestCaseId } from '@testdouble/harness-data'
import type { TestSuiteConfig, TestCase, ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'
import { runClaude, extractOutputFiles } from '@testdouble/claude-integration'
import { accumulateTotals } from '../../lib/metrics.js'
import { writeTestOutput } from '../../lib/output.js'
import { buildTempAgentPlugin } from './build-temp-plugin.js'
import { HarnessError } from '../../lib/errors.js'

function printRunningTest(testName: string): void {
  process.stderr.write(`\nRunning test: "${testName}"\n`)
}

function printTestConfig(test: TestCase, plugins: string[]): void {
  process.stderr.write(`  - type: ${test.type ?? 'agent-call'}\n`)
  process.stderr.write(`  - model: ${test.model ?? 'sonnet'}\n`)
  process.stderr.write(`  - promptFile: ${test.promptFile}\n`)
  if (test.agentFile) process.stderr.write(`  - agentFile: ${test.agentFile}\n`)
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
    process.stderr.write(`  [FAIL] Docker exited with code ${exitCode}\n`)
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

export async function runAgentCallTests(
  tests: TestCase[],
  config: TestSuiteConfig,
  suite: string,
  testSuiteDir: string,
  debug: boolean,
  testRunId: string,
  totals: RunTotals,
  outputDir: string,
  repoRoot: string
): Promise<RunTotals> {
  let { failures } = totals
  let current = totals

  for (const test of tests) {
    printRunningTest(test.name)
    printTestConfig(test, config.plugins)

    const promptContent = await resolveAndReadPrompt(testSuiteDir, test)

    const runDir = path.join(outputDir, testRunId)
    const { tempDir } = await buildTempAgentPlugin(test.agentFile!, runDir, repoRoot)

    const scaffoldPath = test.scaffold
      ? path.join(testSuiteDir, 'scaffolds', test.scaffold)
      : null

    const { exitCode, stdout } = await runClaude({
      model: test.model ?? 'sonnet',
      prompt: promptContent,
      pluginDirs: [tempDir],
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

    await writeTestOutput(runDir, testRunId, suite, config.plugins, test, events)
    await appendOutputFiles(runDir, testRunId, buildTestCaseId(suite, test.name), outputFiles)
  }

  return { ...current, failures }
}
