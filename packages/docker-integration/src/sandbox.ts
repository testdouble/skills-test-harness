import { DockerError } from './errors.js'
import type { SandboxResult } from './types.js'

export const SANDBOX_NAME = 'claude-skills-harness'

export async function ensureSandboxExists(): Promise<void> {
  const proc = Bun.spawn(['docker', 'sandbox', 'ls'], { stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(proc.stdout as ReadableStream).text()
  await proc.exited

  if (!output.includes(SANDBOX_NAME)) {
    throw new DockerError(`Sandbox "${SANDBOX_NAME}" not found. Run './harness sandbox-setup' first.`, null)
  }
}

export async function execInSandbox(
  command: string,
  args: string[],
  scaffoldPath: string | null,
  debug: boolean,
): Promise<SandboxResult> {
  const execArgs = ['docker', 'sandbox', 'exec', SANDBOX_NAME, command, scaffoldPath ?? '', ...args]

  const proc = Bun.spawn(execArgs, { stdout: 'pipe', stderr: 'pipe' })
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
