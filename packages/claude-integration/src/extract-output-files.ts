import { execInSandbox } from '@testdouble/sandbox-integration'
import { sandboxExtractScript } from './sandbox-scripts.js'

export interface OutputFile {
  path: string
  content: string
}

export async function extractOutputFiles(debug: boolean): Promise<OutputFile[]> {
  const { stdout } = await execInSandbox(sandboxExtractScript, [], null, debug)

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
