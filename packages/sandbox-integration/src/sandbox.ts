import path from 'node:path'
import { SandboxError } from './errors.js'
import type { SandboxResult } from './types.js'

export const SANDBOX_NAME = 'claude-skills-skillwalker'

// `sbx exec` prints this and still exits 0 when the command cannot be started,
// such as when its host path is not under one of the sandbox's workspaces.
const EXEC_FAILED_MESSAGE = 'OCI runtime exec failed'

// Workspaces mounted read-only may be listed with the same suffix `sbx run` takes.
const READ_ONLY_SUFFIX = /:ro$/

export function spawnSbx(args: string[], options: Parameters<typeof Bun.spawn>[1]) {
  try {
    return Bun.spawn(['sbx', ...args], options)
  } catch (error) {
    if (isMissingExecutableError(error)) {
      throw new SandboxError(
        'The sbx CLI was not found. Install Docker Sandboxes (`sbx`) and run `sbx login`, then retry.',
        null,
      )
    }
    throw error
  }
}

async function runSbxLs(args: string[]): Promise<string> {
  const proc = spawnSbx(['ls', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
  ])
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new SandboxError(
      `Unable to list sandboxes with sbx (exit code ${proc.exitCode ?? 1}): ${stdout}${stderr}\nRun \`sbx login\`, then retry \`./build/skillwalker sandbox create\`.`,
      proc.exitCode,
    )
  }

  return stdout
}

export async function listSandboxNames(): Promise<string[]> {
  return (await runSbxLs(['--quiet']))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

interface SandboxListing {
  name: string
  workspaces: string[]
}

async function listSandboxes(): Promise<SandboxListing[]> {
  const { sandboxes } = JSON.parse(await runSbxLs(['--json'])) as { sandboxes?: SandboxListing[] | null }
  return sandboxes ?? []
}

export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Throws unless the sandbox exists and mounts every path in `requiredPaths`.
 * A sandbox created before a mount was added keeps its original workspaces
 * until it is recreated.
 */
export async function ensureSandboxExists(requiredPaths: string[] = []): Promise<void> {
  const sandbox = (await listSandboxes()).find(({ name }) => name === SANDBOX_NAME)

  if (!sandbox) {
    throw new SandboxError(`Sandbox "${SANDBOX_NAME}" not found. Run './build/skillwalker sandbox create' first.`, null)
  }

  for (const requiredPath of requiredPaths) {
    if (!sandbox.workspaces.some((workspace) => isWithin(workspace.replace(READ_ONLY_SUFFIX, ''), requiredPath))) {
      throw new SandboxError(
        `Sandbox "${SANDBOX_NAME}" does not mount ${requiredPath}.\nRun \`skillwalker sandbox update\` from the target repo to recreate it.`,
        null,
      )
    }
  }
}

function isMissingExecutableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (error as Error & { code?: string }).code === 'ENOENT'
}

function reportsExecFailure(output: string): boolean {
  return output.split('\n').some((line) => line.startsWith(EXEC_FAILED_MESSAGE))
}

export async function execInSandbox(
  command: string,
  args: string[],
  scaffoldPath: string | null,
  debug: boolean,
): Promise<SandboxResult> {
  const execArgs = ['exec', SANDBOX_NAME, command, scaffoldPath ?? '', ...args]

  const proc = spawnSbx(execArgs, { stdout: 'pipe', stderr: 'pipe' })
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
  let stdout = ''

  const stderrPromise = new Response(proc.stderr as ReadableStream).text()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = new TextDecoder().decode(value)
    stdout += chunk
    if (debug) process.stdout.write(chunk)
  }

  const stderr = await stderrPromise
  if (debug && stderr) process.stderr.write(stderr)

  await proc.exited

  if (reportsExecFailure(stdout) || reportsExecFailure(stderr)) {
    throw new SandboxError(
      `Unable to run ${command} in sandbox "${SANDBOX_NAME}": ${`${stdout}${stderr}`.trim()}\nThe sandbox must mount the directory holding this file. Run \`skillwalker sandbox update\` from the target repo to recreate it with both mounts.`,
      proc.exitCode,
    )
  }

  return { exitCode: proc.exitCode ?? 1, stdout, stderr }
}
