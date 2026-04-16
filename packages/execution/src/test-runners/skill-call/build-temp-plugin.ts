import path from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { replaceDescription, sanitizeForYaml } from '@testdouble/harness-data'

const NOOP_BODY = '\nRespond with: "skill triggered" — nothing else.\n'

export async function buildTempPlugin(skillFile: string, runDir: string, repoRoot: string): Promise<{ tempDir: string }> {
  const [pluginName, skillName] = skillFile.split(':')

  const skillMdPath = path.join(repoRoot, pluginName, 'skills', skillName, 'SKILL.md')
  const skillMdContent = await readFile(skillMdPath, 'utf-8')

  const match = skillMdContent.match(/^---\n([\s\S]*?)\n---/)
  const stripped = match ? stripNonTriggeringFields(match[1]) : ''
  const skillMd = stripped ? `---\n${stripped}\n---\n${NOOP_BODY}` : ''

  const tempDir = path.join(runDir, 'temp-skills', `${pluginName}-${skillName}`)

  await mkdir(path.join(tempDir, '.claude-plugin'), { recursive: true })
  await mkdir(path.join(tempDir, 'skills', skillName), { recursive: true })

  const pluginJson = JSON.stringify({ name: pluginName, description: '', version: '0.0.0', skills: './skills' }, null, 2)
  await writeFile(path.join(tempDir, '.claude-plugin', 'plugin.json'), pluginJson)
  await writeFile(path.join(tempDir, 'skills', skillName, 'SKILL.md'), skillMd)

  return { tempDir }
}

export async function buildTempPluginWithDescription(
  skillFile: string,
  runDir: string,
  overrideDescription: string,
  repoRoot: string,
  iteration?: number
): Promise<{ tempDir: string }> {
  const [pluginName, skillName] = skillFile.split(':')

  const skillMdPath = path.join(repoRoot, pluginName, 'skills', skillName, 'SKILL.md')
  const skillMdContent = await readFile(skillMdPath, 'utf-8')

  const match = skillMdContent.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    throw new Error(`No frontmatter found in ${skillMdPath}`)
  }

  // Replace description field in frontmatter
  const rawFrontmatter = match[1]
  const updatedFrontmatter = replaceDescription(rawFrontmatter, sanitizeForYaml(overrideDescription))
  const stripped = stripNonTriggeringFields(updatedFrontmatter)
  const skillMd = `---\n${stripped}\n---\n${NOOP_BODY}`

  const iterSuffix = iteration != null ? `/iter-${iteration}` : ''
  const tempDir = path.join(runDir, 'temp-skills', `${pluginName}-${skillName}${iterSuffix}`)

  await mkdir(path.join(tempDir, '.claude-plugin'), { recursive: true })
  await mkdir(path.join(tempDir, 'skills', skillName), { recursive: true })

  const pluginJson = JSON.stringify({ name: pluginName, description: '', version: '0.0.0', skills: './skills' }, null, 2)
  await writeFile(path.join(tempDir, '.claude-plugin', 'plugin.json'), pluginJson)
  await writeFile(path.join(tempDir, 'skills', skillName, 'SKILL.md'), skillMd)

  return { tempDir }
}

function stripNonTriggeringFields(frontmatter: string): string {
  return frontmatter
    .replace(/^allowed-tools:.*$/m, '')
    .replace(/^argument-hint:.*$/m, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
