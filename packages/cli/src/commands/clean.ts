import { removeSandbox, SANDBOX_NAME, SandboxError } from '@testdouble/sandbox-integration'
import { SkillwalkerError } from '@testdouble/skillwalker-execution'
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
      throw new SkillwalkerError(error.message)
    }
    throw error
  }
}
