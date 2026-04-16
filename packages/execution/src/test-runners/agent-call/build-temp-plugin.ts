import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { replaceDescription, sanitizeForYaml } from '@testdouble/harness-data'

const AGENT_NOOP_BODY = '\nRespond with: "agent triggered" — nothing else.\n'
const SKILL_NOOP_BODY = '\nRespond with: "skill triggered" — nothing else.\n'

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/

const AGENT_FIELDS_TO_STRIP = [
  'tools',
  'disallowedTools',
  'permissionMode',
  'maxTurns',
  'skills',
  'mcpServers',
  'hooks',
  'memory',
  'background',
  'effort',
  'isolation',
  'initialPrompt',
]

const AGENT_STRIP_PATTERNS = AGENT_FIELDS_TO_STRIP.map((field) => new RegExp(`^${field}:.*(?:\\n[ \\t]+.*)*`, 'm'))

export async function buildTempAgentPlugin(
  agentFile: string,
  runDir: string,
  repoRoot: string,
  overrideDescription?: string,
  iteration?: number,
): Promise<{ tempDir: string }> {
  const [pluginName, agentName] = agentFile.split(':')
  const pluginDir = path.join(repoRoot, pluginName)
  const iterSuffix = iteration != null ? `/iter-${iteration}` : ''
  const tempDir = path.join(runDir, 'temp-agents', `${pluginName}-${agentName}${iterSuffix}`)

  await mkdir(path.join(tempDir, '.claude-plugin'), { recursive: true })
  await mkdir(path.join(tempDir, 'agents'), { recursive: true })

  const pluginJson = JSON.stringify(
    { name: pluginName, description: '', version: '0.0.0', skills: './skills' },
    null,
    2,
  )
  await writeFile(path.join(tempDir, '.claude-plugin', 'plugin.json'), pluginJson)

  const override =
    overrideDescription != null ? { targetAgent: agentName, description: overrideDescription } : undefined

  await Promise.all([processAgents(pluginDir, tempDir, override), processSkills(pluginDir, tempDir)])

  return { tempDir }
}

export async function buildTempAgentPluginWithDescription(
  agentFile: string,
  runDir: string,
  overrideDescription: string,
  repoRoot: string,
  iteration?: number,
): Promise<{ tempDir: string }> {
  return buildTempAgentPlugin(agentFile, runDir, repoRoot, overrideDescription, iteration)
}

async function processAgents(
  pluginDir: string,
  tempDir: string,
  override?: { targetAgent: string; description: string },
): Promise<void> {
  const agentsDir = path.join(pluginDir, 'agents')
  const entries = await readdir(agentsDir).catch(() => [])

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.endsWith('.md')) return

      const agentName = entry.replace(/\.md$/, '')
      const content = await readFile(path.join(agentsDir, entry), 'utf-8').catch(() => null)
      if (!content) return
      const match = content.match(FRONTMATTER_REGEX)

      let frontmatter = match ? match[1] : ''

      if (override && agentName === override.targetAgent) {
        frontmatter = replaceDescription(frontmatter, sanitizeForYaml(override.description))
      }

      const stripped = stripAgentNonTriggeringFields(frontmatter)
      const agentMd = stripped ? `---\n${stripped}\n---\n${AGENT_NOOP_BODY}` : ''

      await writeFile(path.join(tempDir, 'agents', entry), agentMd)
    }),
  )
}

async function processSkills(pluginDir: string, tempDir: string): Promise<void> {
  const skillsDir = path.join(pluginDir, 'skills')
  const entries = await readdir(skillsDir).catch(() => [])

  await Promise.all(
    entries.map(async (entry) => {
      const skillMdPath = path.join(skillsDir, entry, 'SKILL.md')
      const content = await readFile(skillMdPath, 'utf-8').catch(() => null)
      if (!content) return

      const match = content.match(FRONTMATTER_REGEX)
      const stripped = match ? stripSkillNonTriggeringFields(match[1]) : ''
      const skillMd = stripped ? `---\n${stripped}\n---\n${SKILL_NOOP_BODY}` : ''

      await mkdir(path.join(tempDir, 'skills', entry), { recursive: true })
      await writeFile(path.join(tempDir, 'skills', entry, 'SKILL.md'), skillMd)
    }),
  )
}

function stripAgentNonTriggeringFields(frontmatter: string): string {
  let result = frontmatter
  for (const pattern of AGENT_STRIP_PATTERNS) {
    result = result.replace(pattern, '')
  }
  return result.replace(/\n{2,}/g, '\n').trim()
}

function stripSkillNonTriggeringFields(frontmatter: string): string {
  return frontmatter
    .replace(/^allowed-tools:.*(?:\n[ \t]+.*)*/m, '')
    .replace(/^argument-hint:.*(?:\n[ \t]+.*)*/m, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
