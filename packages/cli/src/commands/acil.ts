import type { AcilConfig } from '@testdouble/harness-execution'
import { HarnessError, runAcilLoop } from '@testdouble/harness-execution'
import type { Argv } from 'yargs'
import { outputDir, repoRoot, testsDir } from '../paths.js'

export const command = 'acil'
export const describe = 'Agent Call Improvement Loop — iteratively improve an agent description for call accuracy'

export function builder(yargs: Argv): Argv {
  return yargs
    .option('suite', { type: 'string', demandOption: true, describe: 'Test suite name' })
    .option('agent', { type: 'string', describe: 'Target agent in plugin:agent format (inferred if omitted)' })
    .option('max-iterations', { type: 'number', default: 5, describe: 'Maximum improvement iterations' })
    .option('holdout', { type: 'number', default: 0, describe: 'Fraction of tests held out for validation (e.g. 0.4)' })
    .option('concurrency', { type: 'number', default: 1, describe: 'Parallel sandbox exec calls during eval' })
    .option('runs-per-query', { type: 'number', default: 1, describe: 'Runs per test case (majority vote)' })
    .option('model', { type: 'string', default: 'opus', describe: 'Model for improvement prompt' })
    .option('debug', { type: 'boolean', default: false, describe: 'Show sandbox output in real time' })
    .option('apply', {
      type: 'boolean',
      default: false,
      describe: 'Auto-apply best description to agent .md without prompting',
    })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const maxIterations = argv['max-iterations'] as number
  const holdout = argv.holdout as number
  const runsPerQuery = argv['runs-per-query'] as number
  const concurrency = argv.concurrency as number
  const agent = argv.agent as string | undefined
  const apply = argv.apply as boolean

  if (isNaN(maxIterations) || !isFinite(maxIterations) || maxIterations < 1) {
    throw new HarnessError('--max-iterations must be a finite number >= 1')
  }

  if (isNaN(runsPerQuery) || !isFinite(runsPerQuery) || runsPerQuery < 1) {
    throw new HarnessError('--runs-per-query must be a finite number >= 1')
  }

  if (isNaN(concurrency) || !isFinite(concurrency) || concurrency < 1) {
    throw new HarnessError('--concurrency must be a finite number >= 1')
  }

  if (isNaN(holdout) || holdout < 0 || holdout >= 1.0) {
    throw new HarnessError('--holdout must be >= 0 and < 1.0')
  }

  if (agent !== undefined && !/^[a-z0-9-]+:[a-z0-9-]+$/.test(agent)) {
    throw new HarnessError('--agent must be in plugin:agent format (e.g. my-plugin:my-agent)')
  }

  if (!apply && !process.stdin.isTTY) {
    throw new HarnessError('Non-interactive environment detected. Use --apply to auto-apply without prompting.')
  }

  const config: AcilConfig = {
    suite: argv.suite as string,
    agent,
    maxIterations,
    holdout,
    concurrency,
    runsPerQuery,
    model: argv.model as string,
    debug: argv.debug as boolean,
    apply,
    outputDir,
    testsDir,
    repoRoot,
  }

  await runAcilLoop(config)
}
