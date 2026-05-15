import { HarnessError } from '@testdouble/harness-execution'
import { removeSandbox, SANDBOX_NAME, SandboxError } from '@testdouble/sandbox-integration'
import type { Argv } from 'yargs'

export const command = 'clean'
export const describe = 'Remove the Test Sandbox'

export function builder(yargs: Argv): Argv {
  return yargs
}

export async function handler(): Promise<void> {
  try {
    await removeSandbox()
    console.log(`Removed sandbox: ${SANDBOX_NAME}`)
  } catch (error) {
    if (error instanceof SandboxError) {
      throw new HarnessError(error.message)
    }
    throw error
  }
}
