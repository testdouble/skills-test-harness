import { execInSandbox } from '@testdouble/docker-integration'
import { resolveRelativePath } from '@testdouble/bun-helpers'

export interface OutputFile {
  path: string
  content: string
}

const extractScript = resolveRelativePath(
  import.meta,
  '../sandbox-extract.sh',
  'packages/claude-integration/sandbox-extract.sh'
)

export async function extractOutputFiles(debug: boolean): Promise<OutputFile[]> {
  const { stdout } = await execInSandbox(extractScript, [], null, debug)

  if (!stdout.trim()) return []

  const files: OutputFile[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as { path: string; content: string }
      files.push({ path: parsed.path, content: parsed.content })
    } catch {
      // skip malformed lines
    }
  }

  return files
}
