import { ensureSandboxExists } from '@testdouble/sandbox-integration'
import { resolvePaths } from '../test-runners/steps/step-1-resolve-paths.js'
import { validateConfig } from '../test-runners/steps/step-2-validate-config.js'
import { readConfig } from '../test-runners/steps/step-3-read-config.js'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
import { buildFlags } from '../test-runners/steps/step-6-build-flags.js'
import { initTotals } from '../test-runners/steps/step-7-init-totals.js'
import { runTestCases } from '../test-runners/steps/step-8-run-test-cases.js'
import { printTotals } from '../test-runners/steps/step-9-print-totals.js'

export interface RunEvalsOptions {
  evals: string[]
  testFilter?: string
  debug: boolean
  outputDir: string
  testsDir: string
  repoRoot: string
}

export interface RunEvalsResult {
  testRunId: string
  totalDurationMs: number
  totalInputTokens: number
  totalOutputTokens: number
  failures: number
}

export async function runEvals(opts: RunEvalsOptions): Promise<RunEvalsResult> {
  const testRunId = generateRunId()
  process.stderr.write(`Run ID: ${testRunId}\n`)
  process.stderr.write('Checking sandbox...\n')
  await ensureSandboxExists()
  let totals = initTotals()

  for (const evalName of opts.evals) {
    process.stderr.write(`\nRunning eval: ${evalName}\n`)
    process.stderr.write('  Resolving paths...\n')
    const { evalDir } = resolvePaths(evalName, opts.testsDir)
    process.stderr.write('  Reading config...\n')
    const { configFilePath } = await validateConfig(evalDir)
    const config = await readConfig(configFilePath, evalDir, opts.testFilter)
    process.stderr.write('  Building flags...\n')
    const { pluginDirs } = buildFlags(config, opts.repoRoot)
    totals = await runTestCases(
      config,
      evalName,
      evalDir,
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
