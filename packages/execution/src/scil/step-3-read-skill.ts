import { readFile } from 'node:fs/promises'
import { parseDescription } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'

export interface SkillFileContent {
  name:           string
  description:    string
  frontmatterRaw: string
  body:           string
  fullContent:    string
}

export async function readSkill(skillMdPath: string): Promise<SkillFileContent> {
  const fullContent = await readFile(skillMdPath, 'utf-8')

  const fmMatch = fullContent.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    throw new HarnessError(`No frontmatter found in ${skillMdPath}`)
  }

  const frontmatterRaw = fmMatch[1]
  const body = fullContent.slice(fmMatch[0].length).trimStart()

  // Parse name from frontmatter
  const nameMatch = frontmatterRaw.match(/^name:\s*"?([^"\n]+)"?/m)
  const name = nameMatch ? nameMatch[1].trim() : ''

  // Parse description from frontmatter (handles single-line and multi-line YAML)
  const description = parseDescription(frontmatterRaw)

  return { name, description, frontmatterRaw, body, fullContent }
}
