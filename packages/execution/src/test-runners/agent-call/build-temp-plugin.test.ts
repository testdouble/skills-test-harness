import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTempAgentPlugin, buildTempAgentPluginWithDescription } from './build-temp-plugin.js'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  readdir: vi.fn(),
}))

import { readdir, readFile, writeFile } from 'node:fs/promises'

const AGENT_NOOP = 'Respond with: "agent triggered" — nothing else.'
const SKILL_NOOP = 'Respond with: "skill triggered" — nothing else.'

function makeMd(fields: Record<string, string>, body: string): string {
  const frontmatter = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `---\n${frontmatter}\n---\n\n${body}`
}

const agentMd = (fields: Record<string, string>, body = 'Full agent body here.') => makeMd(fields, body)
const skillMd = (fields: Record<string, string>, body = 'Full skill body here.') => makeMd(fields, body)

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(readdir).mockImplementation(async (dir: any) => {
    if (dir.toString().endsWith('/agents')) return ['alpha.md', 'beta.md'] as any
    if (dir.toString().endsWith('/skills')) return ['code-review', 'investigate'] as any
    return [] as any
  })

  vi.mocked(readFile).mockImplementation(async (filePath: any) => {
    const p = filePath.toString()
    if (p.endsWith('alpha.md')) {
      return agentMd({
        name: 'alpha',
        description: '"Alpha agent description"',
        tools: 'Read, Glob, Grep',
        model: 'opus',
      })
    }
    if (p.endsWith('beta.md')) {
      return agentMd({
        name: 'beta',
        description: '"Beta agent description"',
        tools: 'Read, Write',
        model: 'sonnet',
      })
    }
    if (p.includes('code-review/SKILL.md')) {
      return skillMd({
        name: 'code-review',
        description: '"Code review skill"',
        'allowed-tools': 'Bash(git *), Read, Grep',
        'argument-hint': '[optional context]',
      })
    }
    if (p.includes('investigate/SKILL.md')) {
      return skillMd({
        name: 'investigate',
        description: '"Investigation skill"',
        'allowed-tools': 'Read, Grep, Glob',
      })
    }
    throw new Error(`Unexpected readFile: ${p}`)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function writtenFile(pathSubstring: string): string | undefined {
  const calls = vi.mocked(writeFile).mock.calls
  const match = calls.find(([p]) => p.toString().includes(pathSubstring))
  return match ? match[1]?.toString() : undefined
}

describe('buildTempAgentPlugin', () => {
  it('returns tempDir under temp-agents/', async () => {
    const { tempDir } = await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    expect(tempDir).toBe('/run/temp-agents/myplugin-alpha')
  })

  it('writes plugin.json with both agents and skills paths', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const content = writtenFile('plugin.json')
    expect(content).toBeDefined()
    const parsed = JSON.parse(content!)
    expect(parsed.agents).toBeUndefined()
    expect(parsed.skills).toBe('./skills')
    expect(parsed.name).toBe('myplugin')
    expect(parsed.version).toBe('0.0.0')
  })

  it('includes all agents from the source plugin', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const alpha = writtenFile('agents/alpha.md')
    const beta = writtenFile('agents/beta.md')
    expect(alpha).toBeDefined()
    expect(beta).toBeDefined()
  })

  it('strips tools from agent frontmatter, keeps name/description/model', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    expect(alpha).toContain('name: alpha')
    expect(alpha).toContain('description: "Alpha agent description"')
    expect(alpha).toContain('model: opus')
    expect(alpha).not.toContain('tools:')
  })

  it('replaces agent bodies with no-op response', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    expect(alpha).toContain(AGENT_NOOP)
    expect(alpha).not.toContain('Full agent body here.')
  })

  it('includes all skills from the source plugin', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const review = writtenFile('code-review/SKILL.md')
    const investigate = writtenFile('investigate/SKILL.md')
    expect(review).toBeDefined()
    expect(investigate).toBeDefined()
  })

  it('strips allowed-tools and argument-hint from skill frontmatter', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const review = writtenFile('code-review/SKILL.md')!
    expect(review).toContain('name: code-review')
    expect(review).toContain('description: "Code review skill"')
    expect(review).not.toContain('allowed-tools:')
    expect(review).not.toContain('argument-hint:')
  })

  it('replaces skill bodies with no-op response', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const review = writtenFile('code-review/SKILL.md')!
    expect(review).toContain(SKILL_NOOP)
    expect(review).not.toContain('Full skill body here.')
  })

  it('preserves original descriptions for all agents', async () => {
    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    const beta = writtenFile('agents/beta.md')!
    expect(alpha).toContain('"Alpha agent description"')
    expect(beta).toContain('"Beta agent description"')
  })

  it('strips multi-line YAML fields from agent frontmatter', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['hooked.md'] as any
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('hooked.md')) {
        return [
          '---',
          'name: hooked',
          'description: "An agent with hooks"',
          'model: sonnet',
          'tools: Read, Write',
          'hooks:',
          '  pre-commit:',
          '    command: "echo hi"',
          '  post-commit:',
          '    command: "echo bye"',
          'memory: true',
          '---',
          '',
          'Agent body.',
        ].join('\n')
      }
      throw new Error(`Unexpected readFile: ${filePath}`)
    })

    await buildTempAgentPlugin('myplugin:hooked', '/run', '/repo')
    const content = writtenFile('agents/hooked.md')!
    expect(content).toContain('name: hooked')
    expect(content).toContain('description: "An agent with hooks"')
    expect(content).toContain('model: sonnet')
    expect(content).not.toContain('tools:')
    expect(content).not.toContain('hooks:')
    expect(content).not.toContain('pre-commit:')
    expect(content).not.toContain('command:')
    expect(content).not.toContain('memory:')
  })

  it('handles missing agents directory gracefully', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) throw new Error('ENOENT')
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })

    const { tempDir } = await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    expect(tempDir).toBe('/run/temp-agents/myplugin-alpha')
    const agentWrites = vi
      .mocked(writeFile)
      .mock.calls.filter(([p]) => p.toString().includes('/agents/') && p.toString().endsWith('.md'))
    expect(agentWrites).toHaveLength(0)
  })

  it('handles missing skills directory gracefully', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['alpha.md'] as any
      if (dir.toString().endsWith('/skills')) throw new Error('ENOENT')
      return [] as any
    })

    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const skillWrites = vi.mocked(writeFile).mock.calls.filter(([p]) => p.toString().includes('skills/'))
    expect(skillWrites).toHaveLength(0)
  })

  // TP-001 (T2/EC13): Agent file with no frontmatter writes empty string
  it('writes empty string for agent file with no frontmatter', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['bare.md'] as any
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('bare.md')) return 'Just a body with no frontmatter.'
      throw new Error(`Unexpected readFile: ${filePath}`)
    })

    await buildTempAgentPlugin('myplugin:bare', '/run', '/repo')
    const content = writtenFile('agents/bare.md')
    expect(content).toBe('')
  })

  // TP-002 (EC9): Agent readFile error handled gracefully
  it('skips unreadable agent files without throwing', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['good.md', 'bad.md'] as any
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      const p = filePath.toString()
      if (p.endsWith('good.md')) return agentMd({ name: 'good', description: '"Good agent"' })
      if (p.endsWith('bad.md')) throw new Error('EACCES: permission denied')
      throw new Error(`Unexpected readFile: ${p}`)
    })

    await buildTempAgentPlugin('myplugin:good', '/run', '/repo')
    const good = writtenFile('agents/good.md')
    const bad = writtenFile('agents/bad.md')
    expect(good).toBeDefined()
    expect(good).toContain('name: good')
    expect(bad).toBeUndefined()
  })

  // TP-003 (EC8): Multi-line allowed-tools stripped from skill frontmatter
  it('strips multi-line allowed-tools from skill frontmatter', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return [] as any
      if (dir.toString().endsWith('/skills')) return ['multi-tool'] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      if (filePath.toString().includes('multi-tool/SKILL.md')) {
        return [
          '---',
          'name: multi-tool',
          'description: "A skill with multi-line allowed-tools"',
          'allowed-tools: Bash(git *), Read,',
          '  Grep, Glob,',
          '  Write',
          '---',
          '',
          'Skill body.',
        ].join('\n')
      }
      throw new Error(`Unexpected readFile: ${filePath}`)
    })

    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const content = writtenFile('multi-tool/SKILL.md')!
    expect(content).toContain('name: multi-tool')
    expect(content).toContain('description:')
    expect(content).not.toContain('allowed-tools:')
    expect(content).not.toContain('Grep, Glob')
    expect(content).not.toContain('Write')
  })

  // TP-004 (T3): Skill file with no frontmatter writes empty string
  it('writes empty string for skill file with no frontmatter', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return [] as any
      if (dir.toString().endsWith('/skills')) return ['bare-skill'] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      if (filePath.toString().includes('bare-skill/SKILL.md')) return 'Just a body, no frontmatter.'
      throw new Error(`Unexpected readFile: ${filePath}`)
    })

    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const content = writtenFile('bare-skill/SKILL.md')
    expect(content).toBe('')
  })

  // TP-005 (T4): Skill subdirectory exists but no SKILL.md inside
  it('skips skill directories without SKILL.md', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return [] as any
      if (dir.toString().endsWith('/skills')) return ['has-skill', 'no-skill'] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      const p = filePath.toString()
      if (p.includes('has-skill/SKILL.md')) return skillMd({ name: 'has-skill', description: '"A skill"' })
      if (p.includes('no-skill/SKILL.md')) throw new Error('ENOENT')
      throw new Error(`Unexpected readFile: ${p}`)
    })

    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const hasSkill = writtenFile('has-skill/SKILL.md')
    expect(hasSkill).toBeDefined()
    const noSkillWrites = vi.mocked(writeFile).mock.calls.filter(([p]) => p.toString().includes('no-skill'))
    expect(noSkillWrites).toHaveLength(0)
  })

  // TP-006 (T1/EC16): Non-.md files in agents directory are skipped
  it('skips non-.md files in agents directory', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['.DS_Store', 'alpha.md', 'README.txt'] as any
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })

    await buildTempAgentPlugin('myplugin:alpha', '/run', '/repo')
    const agentWrites = vi
      .mocked(writeFile)
      .mock.calls.filter(([p]) => p.toString().includes('/agents/') && p.toString().endsWith('.md'))
    expect(agentWrites).toHaveLength(1)
    expect(agentWrites[0][0].toString()).toContain('alpha.md')
  })

  // TP-008 (T10/EC6): Stripping does not affect fields with matching prefixes
  it('does not strip fields that share a prefix with stripped fields', async () => {
    vi.mocked(readdir).mockImplementation(async (dir: any) => {
      if (dir.toString().endsWith('/agents')) return ['prefixed.md'] as any
      if (dir.toString().endsWith('/skills')) return [] as any
      return [] as any
    })
    vi.mocked(readFile).mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('prefixed.md')) {
        return agentMd({
          name: 'prefixed',
          description: '"An agent"',
          toolsmith: '"custom field"',
          tools: 'Read, Write',
        })
      }
      throw new Error(`Unexpected readFile: ${filePath}`)
    })

    await buildTempAgentPlugin('myplugin:prefixed', '/run', '/repo')
    const content = writtenFile('agents/prefixed.md')!
    expect(content).toContain('toolsmith: "custom field"')
    expect(content).not.toContain('tools: Read')
  })
})

describe('buildTempAgentPluginWithDescription', () => {
  it('overrides only the target agent description', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'New alpha description', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    const beta = writtenFile('agents/beta.md')!
    expect(alpha).toContain('"New alpha description"')
    expect(alpha).not.toContain('Alpha agent description')
    expect(beta).toContain('"Beta agent description"')
  })

  it('strips non-triggering fields from overridden agent', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'Override', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    expect(alpha).toContain('name: alpha')
    expect(alpha).toContain('model: opus')
    expect(alpha).not.toContain('tools:')
  })

  it('replaces body with no-op on overridden agent', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'Override', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    expect(alpha).toContain(AGENT_NOOP)
    expect(alpha).not.toContain('Full agent body here.')
  })

  it('still includes all skills with original descriptions', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'Override', '/repo')
    const review = writtenFile('code-review/SKILL.md')!
    expect(review).toContain('"Code review skill"')
    expect(review).not.toContain('allowed-tools:')
  })

  it('writes plugin.json with both agents and skills paths', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'Override', '/repo')
    const content = writtenFile('plugin.json')
    const parsed = JSON.parse(content!)
    expect(parsed.agents).toBeUndefined()
    expect(parsed.skills).toBe('./skills')
  })

  // TP-007 (T7/EC11): Override description with YAML-special characters
  it('handles override description with quotes and colons', async () => {
    await buildTempAgentPluginWithDescription('myplugin:alpha', '/run', 'Use for "gap: analysis" tasks', '/repo')
    const alpha = writtenFile('agents/alpha.md')!
    expect(alpha).toContain('description:')
    expect(alpha).not.toContain('Alpha agent description')
    expect(alpha).toContain('gap')
    expect(alpha).toContain('analysis')
  })
})
