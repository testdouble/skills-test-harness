import type { Argv } from 'yargs'
import { openShell } from '@testdouble/docker-integration'

export const command = 'shell'
export const describe = 'Start an interactive shell in the sandbox'

export function builder(yargs: Argv): Argv {
  return yargs
}

export async function handler(): Promise<void> {
  await openShell()
}
