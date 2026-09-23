import { SandboxError } from './errors.js'
import { ensureSandboxExists, isWithin, listSandboxNames, SANDBOX_NAME, spawnSbx } from './sandbox.js'

const CLAUDE_TEMPLATE_REPOSITORY = 'docker/sandbox-templates'
const CLAUDE_TEMPLATE_TAG_PREFIX = 'claude-code'
const TEMPLATE_ALREADY_REMOVED_MESSAGE = 'no template image'

async function sandboxExists(): Promise<boolean> {
  return (await listSandboxNames()).includes(SANDBOX_NAME)
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

async function runSbxCaptured(args: string[]): Promise<{ exitCode: number | null; output: string }> {
  const proc = spawnSbx(args, { stdout: 'pipe', stderr: 'pipe' })

  const [stdoutCapture, stderrCapture] = await Promise.all([
    drainStream(proc.stdout as ReadableStream<Uint8Array>),
    drainStream(proc.stderr as ReadableStream<Uint8Array>),
  ])
  await proc.exited

  return { exitCode: proc.exitCode, output: `${stdoutCapture}${stderrCapture}` }
}

export async function removeSandbox(): Promise<void> {
  const { exitCode, output } = await runSbxCaptured(['rm', '--force', SANDBOX_NAME])

  if (exitCode !== 0) {
    throw new SandboxError(`sbx rm failed (exit code ${exitCode ?? 1}): ${output}`, exitCode)
  }
}

/**
 * Image IDs of the cached Claude Code sandbox templates. `sbx` has no pull
 * command, so removing these is what makes the next `sbx run` fetch the latest.
 */
async function listClaudeTemplateImageIds(): Promise<string[]> {
  const { exitCode, output } = await runSbxCaptured(['template', 'ls'])

  if (exitCode !== 0) {
    throw new SandboxError(`sbx template ls failed (exit code ${exitCode ?? 1}): ${output}`, exitCode)
  }

  const ids = output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([repository, tag]) => repository === CLAUDE_TEMPLATE_REPOSITORY && tag?.startsWith(CLAUDE_TEMPLATE_TAG_PREFIX),
    )
    .map(([, , imageId]) => imageId)
    .filter((imageId): imageId is string => imageId !== undefined)

  return [...new Set(ids)]
}

async function removeTemplateImage(imageId: string): Promise<void> {
  const { exitCode, output } = await runSbxCaptured(['template', 'rm', imageId])

  // `sbx template ls` can list one image under several IDs. Removing the first
  // removes them all, so a later ID reports that the image no longer exists.
  if (exitCode === 0 || output.includes(TEMPLATE_ALREADY_REMOVED_MESSAGE)) return

  throw new SandboxError(
    `sbx template rm ${imageId} failed (exit code ${exitCode ?? 1}): ${output}\nRetry with \`skillwalker sandbox update\`.`,
    exitCode,
  )
}

/**
 * `sbx run` arguments that mount `repoRoot` read-write and each extra workspace
 * read-only. Extra workspaces already inside `repoRoot` are visible through it.
 */
function buildRunArgs(repoRoot: string, extraWorkspaces: string[]): string[] {
  const extras = extraWorkspaces
    .filter((workspace) => !isWithin(repoRoot, workspace))
    .map((workspace) => `${workspace}:ro`)
  return ['run', '--name', SANDBOX_NAME, 'claude', repoRoot, ...extras]
}

export async function createSandbox(repoRoot: string, extraWorkspaces: string[] = []): Promise<void> {
  if (await sandboxExists()) {
    process.stderr.write(`Sandbox "${SANDBOX_NAME}" already exists. To recreate, run:\n`)
    process.stderr.write(`  sbx rm --force ${SANDBOX_NAME}\n`)
    process.stderr.write(`  skillwalker sandbox create\n`)
    return
  }

  process.stderr.write(`Creating sandbox "${SANDBOX_NAME}" with workspace ${repoRoot}...\n`)
  process.stderr.write(`Complete the OAuth login when Claude launches, then exit Claude.\n\n`)

  const runProc = spawnSbx(buildRunArgs(repoRoot, extraWorkspaces), {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await runProc.exited

  if (runProc.exitCode !== 0) {
    throw new SandboxError(
      `sbx run failed (exit code ${runProc.exitCode ?? 1}). The sandbox was not created.\nRetry with \`skillwalker sandbox create\`.`,
      runProc.exitCode,
    )
  }

  process.stderr.write(`\nSandbox "${SANDBOX_NAME}" is ready. You can now run tests.\n`)
}

export async function updateSandbox(repoRoot: string, extraWorkspaces: string[] = []): Promise<void> {
  if (await sandboxExists()) {
    process.stderr.write(`Removing sandbox "${SANDBOX_NAME}"...\n`)
    await removeSandbox()
  }

  for (const imageId of await listClaudeTemplateImageIds()) {
    process.stderr.write(`Removing cached Claude Code template image ${imageId}...\n`)
    await removeTemplateImage(imageId)
  }

  await createSandbox(repoRoot, extraWorkspaces)
}

export async function openShell(): Promise<void> {
  await ensureSandboxExists()

  const args = ['exec', '-it', SANDBOX_NAME, 'bash']
  await spawnSbx(args, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }).exited
}
