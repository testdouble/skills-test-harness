import { SANDBOX_NAME, ensureSandboxExists } from './sandbox.js'
import { DockerError } from './errors.js'

async function sandboxExists(): Promise<boolean> {
  const proc = Bun.spawn(['docker', 'sandbox', 'ls'], { stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(proc.stdout as ReadableStream).text()
  await proc.exited
  return output.includes(SANDBOX_NAME)
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }
  return result
}

export async function removeSandbox(): Promise<void> {
  const proc = Bun.spawn(['docker', 'sandbox', 'rm', SANDBOX_NAME], { stdout: 'pipe', stderr: 'pipe' })

  const [stdoutCapture, stderrCapture] = await Promise.all([
    drainStream(proc.stdout as ReadableStream<Uint8Array>),
    drainStream(proc.stderr as ReadableStream<Uint8Array>)
  ])
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new DockerError(
      `Docker sandbox rm failed (exit code ${proc.exitCode ?? 1}): ${stdoutCapture}${stderrCapture}`,
      proc.exitCode
    )
  }
}

export async function createSandbox(repoRoot: string): Promise<void> {
  if (await sandboxExists()) {
    process.stderr.write(`Sandbox "${SANDBOX_NAME}" already exists. To recreate, run:\n`)
    process.stderr.write(`  docker sandbox rm ${SANDBOX_NAME}\n`)
    process.stderr.write(`  ./harness sandbox-setup\n`)
    return
  }

  process.stderr.write(`Creating sandbox "${SANDBOX_NAME}" with workspace ${repoRoot}...\n`)
  process.stderr.write(`Complete the OAuth login when Claude launches, then exit Claude.\n\n`)

  const runProc = Bun.spawn(
    ['docker', 'sandbox', 'run', '--name', SANDBOX_NAME, 'claude', repoRoot],
    { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }
  )
  await runProc.exited

  process.stderr.write(`\nSandbox "${SANDBOX_NAME}" is ready. You can now run tests.\n`)
}

export async function openShell(): Promise<void> {
  await ensureSandboxExists()

  const args = [
    'docker', 'sandbox', 'exec', '-it', SANDBOX_NAME, '--', 'bash'
  ]
  await Bun.spawn(args, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }).exited
}
