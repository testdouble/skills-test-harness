import { exitWithResult, runTestEval } from '@testdouble/harness-execution'
import type { Argv } from 'yargs'
import { outputDir, testsDir } from '../paths.js'

export const command = 'test-eval [test_run_id]'
export const describe = 'Evaluate expectations against a stored test run'

export function builder(yargs: Argv): Argv {
  return yargs
    .positional('test_run_id', { type: 'string', describe: 'Test run ID to evaluate (omit to evaluate all)' })
    .option('debug', { type: 'boolean', default: false, describe: 'Enable debug output' })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  await runTestEval({
    testRunId: argv.test_run_id as string | undefined,
    debug: argv.debug as boolean,
    outputDir,
    testsDir,
  })

  exitWithResult(0)
}
