import { exitWithResult, runTestSuite } from '@testdouble/harness-execution'
import type { Argv } from 'yargs'
import { getAllTestSuites, outputDir, repoRoot, testsDir } from '../paths.js'

export const command = 'test-run'
export const describe = 'Run test cases and store results'

export function builder(yargs: Argv): Argv {
  return yargs
    .option('suite', { type: 'string', describe: 'Test suite name (omit to run all suites)' })
    .option('test', { type: 'string', describe: 'Filter to single test by exact name' })
    .option('debug', { type: 'boolean', default: false, describe: 'Show Docker output in real time' })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const suiteArg = argv.suite as string | undefined
  const suites = suiteArg ? [suiteArg] : getAllTestSuites()

  const result = await runTestSuite({
    suites,
    testFilter: argv.test as string | undefined,
    debug: argv.debug as boolean,
    outputDir,
    testsDir,
    repoRoot,
  })

  exitWithResult(result.failures)
}
