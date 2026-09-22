import type { Argv } from 'yargs'
import * as clean from './sandbox/clean.js'
import * as create from './sandbox/create.js'
import * as shell from './sandbox/shell.js'
import * as update from './sandbox/update.js'

export const command = 'sandbox'
export const describe = 'Manage the Test Sandbox'

export function builder(yargs: Argv): Argv {
  return yargs.command(create).command(update).command(clean).command(shell).demandCommand(1)
}

// Unreachable: demandCommand(1) above rejects a bare `sandbox` invocation before
// dispatch. The export exists because Yargs declares handler non-optional.
export async function handler(): Promise<void> {}
