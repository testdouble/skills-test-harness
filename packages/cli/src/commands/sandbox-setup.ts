import { createSandbox } from '@testdouble/docker-integration'
import type { Argv } from 'yargs'

export const command = 'sandbox-setup'
export const describe = 'Create a Docker sandbox and authenticate via OAuth for test runs'

export function builder(yargs: Argv): Argv {
  return yargs.option('repo-root', {
    type: 'string',
    default: process.cwd(),
    describe: 'Target repo root to mount in the sandbox (defaults to current working directory)',
  })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  await createSandbox(argv['repo-root'] as string)
}
