import { readFile, writeFile } from 'node:fs/promises'
import { replaceDescription } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'

export async function applyDescription(skillMdPath: string, newDescription: string): Promise<void> {
  const content = await readFile(skillMdPath, 'utf-8')

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    throw new HarnessError(`No frontmatter found in ${skillMdPath}`)
  }

  const rawFrontmatter = fmMatch[1]
  if (!/^description:\s*/m.test(rawFrontmatter)) {
    throw new HarnessError(`No description field found in frontmatter of ${skillMdPath}`)
  }
  const afterFrontmatter = content.slice(fmMatch[0].length)
  const updatedFrontmatter = replaceDescription(rawFrontmatter, newDescription)

  await writeFile(skillMdPath, `---\n${updatedFrontmatter}\n---${afterFrontmatter}`, 'utf-8')
}
