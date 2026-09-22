#!/usr/bin/env bun
import { SkillwalkerError } from '@testdouble/skillwalker-execution'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

try {
  await yargs(hideBin(process.argv))
    .scriptName('skillwalker')
    .command(await import('./src/commands/test-run.js'))
    .command(await import('./src/commands/test-eval.js'))
    .command(await import('./src/commands/sandbox.js'))
    .command(await import('./src/commands/update-analytics.js'))
    .command(await import('./src/commands/scil.js'))
    .command(await import('./src/commands/acil.js'))
    .demandCommand(1)
    .strict()
    .showHelpOnFail(true)
    .parseAsync()
} catch (err) {
  if (err instanceof SkillwalkerError) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
