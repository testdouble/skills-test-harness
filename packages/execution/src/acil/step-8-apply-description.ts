import { readFile, writeFile } from 'node:fs/promises'
import { replaceDescription } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'

export async function applyDescription(agentMdPath: string, newDescription: string): Promise<void> {
  const content = await readFile(agentMdPath, 'utf-8')

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) {
    throw new HarnessError(`No frontmatter found in ${agentMdPath}`)
  }

  const rawFrontmatter = fmMatch[1]
  if (!/^description:\s*/m.test(rawFrontmatter)) {
    throw new HarnessError(`No description field found in frontmatter of ${agentMdPath}`)
  }
  const afterFrontmatter = content.slice(fmMatch[0].length)
  const updatedFrontmatter = replaceDescription(rawFrontmatter, newDescription)

  await writeFile(agentMdPath, `---\n${updatedFrontmatter}\n---${afterFrontmatter}`, 'utf-8')
}
