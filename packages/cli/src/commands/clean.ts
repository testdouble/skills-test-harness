import { DockerError, removeSandbox, SANDBOX_NAME } from '@testdouble/docker-integration'
import { HarnessError } from '@testdouble/harness-execution'
import type { Argv } from 'yargs'

export const command = 'clean'
export const describe = 'Remove the Docker sandbox'

export function builder(yargs: Argv): Argv {
  return yargs
}

export async function handler(): Promise<void> {
  try {
    await removeSandbox()
    console.log(`Removed sandbox: ${SANDBOX_NAME}`)
  } catch (error) {
    if (error instanceof DockerError) {
      throw new HarnessError(error.message)
    }
    throw error
  }
}
