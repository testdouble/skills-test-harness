#!/usr/bin/env bun
import { HarnessError } from '@testdouble/harness-execution'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

try {
  await yargs(hideBin(process.argv))
    .scriptName('harness')
    .command(await import('./src/commands/test-run.js'))
    .command(await import('./src/commands/test-eval.js'))
    .command(await import('./src/commands/shell.js'))
    .command(await import('./src/commands/clean.js'))
    .command(await import('./src/commands/update-analytics.js'))
    .command(await import('./src/commands/scil.js'))
    .command(await import('./src/commands/acil.js'))
    .command(await import('./src/commands/sandbox-setup.js'))
    .demandCommand(1)
    .strict()
    .showHelpOnFail(true)
    .parseAsync()
} catch (err) {
  if (err instanceof HarnessError) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
