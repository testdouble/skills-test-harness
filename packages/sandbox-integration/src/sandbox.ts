import { SandboxError } from './errors.js'
import type { SandboxResult } from './types.js'

export const SANDBOX_NAME = 'claude-skills-harness'

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

export async function listSandboxNames(): Promise<string[]> {
  const proc = spawnSbx(['ls', '--quiet'], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
  ])
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new SandboxError(
      `Unable to list sandboxes with sbx (exit code ${proc.exitCode ?? 1}): ${stdout}${stderr}\nRun \`sbx login\`, then retry \`./harness sandbox-setup\`.`,
      proc.exitCode,
    )
  }

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export async function ensureSandboxExists(): Promise<void> {
  const sandboxes = await listSandboxNames()

  if (!sandboxes.includes(SANDBOX_NAME)) {
    throw new SandboxError(`Sandbox "${SANDBOX_NAME}" not found. Run './harness sandbox-setup' first.`, null)
  }
}

function isMissingExecutableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (error as Error & { code?: string }).code === 'ENOENT'
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
  return { exitCode: proc.exitCode ?? 1, stdout, stderr }
}
