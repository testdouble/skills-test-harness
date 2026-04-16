import { readFile } from 'node:fs/promises'
import { parseDescription } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'

export interface AgentFileContent {
  name:        string
  description: string
  body:        string
}

export async function readAgent(agentMdPath: string): Promise<AgentFileContent> {
  const fullContent = await readFile(agentMdPath, 'utf-8')

  const fmMatch = fullContent.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) {
    throw new HarnessError(`No frontmatter found in ${agentMdPath}`)
  }

  const frontmatterRaw = fmMatch[1]
  const body = fullContent.slice(fmMatch[0].length).trimStart()

  // Parse name from frontmatter
  const nameMatch = frontmatterRaw.match(/^name:\s*"?([^"\n]+)"?/m)
  const name = nameMatch ? nameMatch[1].trim() : ''

  // Parse description from frontmatter (handles single-line and multi-line YAML)
  const description = parseDescription(frontmatterRaw)

  return { name, description, body }
}
