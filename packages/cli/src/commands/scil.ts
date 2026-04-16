import type { ScilConfig } from '@testdouble/harness-execution'
import { runScilLoop } from '@testdouble/harness-execution'
import type { Argv } from 'yargs'
import { outputDir, testsDir } from '../paths.js'

export const command = 'scil'
export const describe = 'Skill Call Improvement Loop — iteratively improve a skill description for trigger accuracy'

export function builder(yargs: Argv): Argv {
  return yargs
    .option('suite', { type: 'string', demandOption: true, describe: 'Test suite name' })
    .option('skill', { type: 'string', describe: 'Target skill in plugin:skill format (inferred if omitted)' })
    .option('max-iterations', { type: 'number', default: 5, describe: 'Maximum improvement iterations' })
    .option('holdout', { type: 'number', default: 0, describe: 'Fraction of tests held out for validation (e.g. 0.4)' })
    .option('concurrency', { type: 'number', default: 1, describe: 'Parallel sandbox exec calls during eval' })
    .option('runs-per-query', { type: 'number', default: 1, describe: 'Runs per test case (majority vote)' })
    .option('model', { type: 'string', default: 'opus', describe: 'Model for improvement prompt' })
    .option('debug', { type: 'boolean', default: false, describe: 'Show sandbox output in real time' })
    .option('apply', {
      type: 'boolean',
      default: false,
      describe: 'Auto-apply best description to SKILL.md without prompting',
    })
    .option('repo-root', {
      type: 'string',
      default: process.cwd(),
      describe: 'Target repo root containing plugins/skills (defaults to current working directory)',
    })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const config: ScilConfig = {
    suite: argv.suite as string,
    skill: argv.skill as string | undefined,
    maxIterations: argv['max-iterations'] as number,
    holdout: argv.holdout as number,
    concurrency: argv.concurrency as number,
    runsPerQuery: argv['runs-per-query'] as number,
    model: argv.model as string,
    debug: argv.debug as boolean,
    apply: argv.apply as boolean,
    outputDir,
    testsDir,
    repoRoot: argv['repo-root'] as string,
  }

  await runScilLoop(config)
}
