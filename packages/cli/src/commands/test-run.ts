import { exitWithResult, runEvals } from '@testdouble/skillwalker-execution'
import type { Argv } from 'yargs'
import { getAllEvals, outputDir, testsDir } from '../paths.js'

export const command = 'test-run'
export const describe = 'Run test cases and store results'

export function builder(yargs: Argv): Argv {
  return yargs
    .option('eval', { type: 'string', describe: 'Eval name (omit to run all evals)' })
    .option('test', { type: 'string', describe: 'Filter to single test by exact name' })
    .option('debug', { type: 'boolean', default: false, describe: 'Show sandbox output in real time' })
    .option('repo-root', {
      type: 'string',
      default: process.cwd(),
      describe: 'Target repo root containing plugins/skills (defaults to current working directory)',
    })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const evalArg = argv.eval as string | undefined
  const evals = evalArg ? [evalArg] : getAllEvals()

  const result = await runEvals({
    evals,
    testFilter: argv.test as string | undefined,
    debug: argv.debug as boolean,
    outputDir,
    testsDir,
    repoRoot: argv['repo-root'] as string,
  })

  exitWithResult(result.failures)
}
