import path from 'node:path'
import { existsSync } from 'node:fs'
import { readTestSuiteConfig, TEST_CONFIG_FILENAME } from '@testdouble/harness-data'
import type { TestCase } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'

export interface ResolvedSkillAndTests {
  skillFile:   string
  skillMdPath: string
  tests:       TestCase[]
}

export async function resolveAndLoad(
  suite: string,
  skill: string | undefined,
  testsDir: string,
  repoRoot: string
): Promise<ResolvedSkillAndTests> {
  const testSuiteDir = path.join(testsDir, 'test-suites', suite)
  const configPath = path.join(testSuiteDir, TEST_CONFIG_FILENAME)
  const config = await readTestSuiteConfig(configPath)

  // Filter to skill-call tests only
  const skillCallTests = config.tests.filter(t => t.type === 'skill-call')

  if (skill) {
    // Validate SKILL.md exists
    const [pluginName, skillName] = skill.split(':')
    const skillMdPath = path.join(repoRoot, pluginName, 'skills', skillName, 'SKILL.md')
    if (!existsSync(skillMdPath)) {
      throw new HarnessError(`SKILL.md not found: ${skillMdPath}`)
    }

    // Filter tests to those targeting this skill
    const filtered = skillCallTests.filter(t => {
      // Check test-level skillFile
      if (t.skillFile === skill) return true
      // Check expectations for skill-call type with matching skillFile
      return t.expect.some(e => e.type === 'skill-call' && 'skillFile' in e && e.skillFile === skill)
    })

    if (filtered.length === 0) {
      throw new HarnessError(`No skill-call tests found for skill "${skill}" in suite "${suite}"`)
    }

    return { skillFile: skill, skillMdPath, tests: filtered }
  }

  // Infer skill from unique skillFile values across tests and expectations
  const skillFiles = new Set<string>()
  for (const test of skillCallTests) {
    for (const e of test.expect) {
      if (e.type === 'skill-call' && 'skillFile' in e) {
        skillFiles.add((e as { skillFile: string }).skillFile)
      }
    }
  }

  if (skillFiles.size === 0) {
    throw new HarnessError(`No skill-call tests found in suite "${suite}"`)
  }

  if (skillFiles.size > 1) {
    const options = Array.from(skillFiles).join(', ')
    throw new HarnessError(
      `Multiple skills found in suite "${suite}": ${options}. Use --skill to specify one.`
    )
  }

  const inferredSkill = Array.from(skillFiles)[0]
  const [pluginName, skillName] = inferredSkill.split(':')
  const skillMdPath = path.join(repoRoot, pluginName, 'skills', skillName, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    throw new HarnessError(`SKILL.md not found: ${skillMdPath}`)
  }

  return { skillFile: inferredSkill, skillMdPath, tests: skillCallTests }
}
