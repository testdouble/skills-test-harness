import type { Argv } from 'yargs'
import { createSandbox } from '@testdouble/docker-integration'
import { repoRoot } from '../paths.js'

export const command = 'sandbox-setup'
export const describe = 'Create a Docker sandbox and authenticate via OAuth for test runs'

export function builder(yargs: Argv): Argv {
  return yargs
}

export async function handler(): Promise<void> {
  await createSandbox(repoRoot)
}
