import { sandboxScriptsDir } from '@testdouble/claude-integration'
import { SandboxError, updateSandbox } from '@testdouble/sandbox-integration'
import { SkillwalkerError } from '@testdouble/skillwalker-execution'
import type { Argv } from 'yargs'

export const command = 'update'
export const describe = 'Delete the Test Sandbox and recreate it from the latest Claude Code sandbox template'

export function builder(yargs: Argv): Argv {
  return yargs.option('repo-root', {
    type: 'string',
    default: process.cwd(),
    describe: 'Target repo root to mount in the sandbox (defaults to current working directory)',
  })
}

export async function handler(argv: Record<string, unknown>): Promise<void> {
  try {
    await updateSandbox(argv['repo-root'] as string, [sandboxScriptsDir])
  } catch (error) {
    if (error instanceof SandboxError) {
      throw new SkillwalkerError(error.message)
    }
    throw error
  }
}
