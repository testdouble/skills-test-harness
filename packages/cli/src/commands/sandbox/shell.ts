import { openShell } from '@testdouble/sandbox-integration'
import type { Argv } from 'yargs'

export const command = 'shell'
export const describe = 'Start an interactive shell in the sandbox'

export function builder(yargs: Argv): Argv {
  return yargs
}

export async function handler(): Promise<void> {
  await openShell()
}
