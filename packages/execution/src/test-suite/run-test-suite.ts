import { ensureSandboxExists } from '@testdouble/docker-integration'
import { resolvePaths } from '../test-runners/steps/step-1-resolve-paths.js'
import { validateConfig } from '../test-runners/steps/step-2-validate-config.js'
import { readConfig } from '../test-runners/steps/step-3-read-config.js'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
import { buildFlags } from '../test-runners/steps/step-6-build-flags.js'
import { initTotals } from '../test-runners/steps/step-7-init-totals.js'
import { runTestCases } from '../test-runners/steps/step-8-run-test-cases.js'
import { printTotals } from '../test-runners/steps/step-9-print-totals.js'

export interface RunTestSuiteOptions {
  suites: string[]
  testFilter?: string
  debug: boolean
  outputDir: string
  testsDir: string
  repoRoot: string
}

export interface RunTestSuiteResult {
  testRunId: string
  totalDurationMs: number
  totalInputTokens: number
  totalOutputTokens: number
  failures: number
}

export async function runTestSuite(opts: RunTestSuiteOptions): Promise<RunTestSuiteResult> {
  const testRunId = generateRunId()
  process.stderr.write(`Run ID: ${testRunId}\n`)
  process.stderr.write('Checking sandbox...\n')
  await ensureSandboxExists()
  let totals = initTotals()

  for (const suite of opts.suites) {
    process.stderr.write(`\nRunning suite: ${suite}\n`)
    process.stderr.write('  Resolving paths...\n')
    const { testSuiteDir } = resolvePaths(suite, opts.testsDir)
    process.stderr.write('  Reading config...\n')
    const { configFilePath } = await validateConfig(testSuiteDir)
    const config = await readConfig(configFilePath, testSuiteDir, opts.testFilter)
    process.stderr.write('  Building flags...\n')
    const { pluginDirs } = buildFlags(config, opts.repoRoot)
    totals = await runTestCases(
      config,
      suite,
      testSuiteDir,
      pluginDirs,
      opts.debug,
      testRunId,
      totals,
      opts.outputDir,
      opts.repoRoot,
    )
  }

  printTotals(totals.totalDurationMs, totals.totalInputTokens, totals.totalOutputTokens, testRunId)

  return {
    testRunId,
    totalDurationMs: totals.totalDurationMs,
    totalInputTokens: totals.totalInputTokens,
    totalOutputTokens: totals.totalOutputTokens,
    failures: totals.failures,
  }
}
