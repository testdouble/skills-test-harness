#!/usr/bin/env bun
import { SandboxError } from '@testdouble/sandbox-integration'
import { SkillwalkerError } from '@testdouble/skillwalker-execution'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { skillwalkerVersion } from './src/version.js'

try {
  await yargs(hideBin(process.argv))
    .scriptName('skillwalker')
    .version(skillwalkerVersion)
    .command(await import('./src/commands/test-run.js'))
    .command(await import('./src/commands/test-eval.js'))
    .command(await import('./src/commands/sandbox.js'))
    .command(await import('./src/commands/update-analytics.js'))
    .command(await import('./src/commands/scil.js'))
    .command(await import('./src/commands/acil.js'))
    .demandCommand(1)
    .strict()
    // Rethrow handler errors to the catch below. Without this, yargs prints
    // help and the raw error for them and exits before the catch runs.
    .fail((message, error, cli) => {
      if (error) throw error
      cli.showHelp()
      process.stderr.write(`\n${message}\n`)
      process.exit(1)
    })
    .parseAsync()
} catch (err) {
  if (err instanceof SkillwalkerError || err instanceof SandboxError) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
