import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  readTestSuiteConfig: vi.fn(),
  TEST_CONFIG_FILENAME: 'tests.json',
}))
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'node:fs'
import { readTestSuiteConfig } from '@testdouble/harness-data'
import { HarnessError } from '../lib/errors.js'
import { resolveAndLoad } from './step-1-resolve-and-load.js'

function makeSkillCallTest(name: string, skillFile: string, value: boolean) {
  return {
    name,
    type: 'skill-call',
    promptFile: `${name}.md`,
    expect: [{ type: 'skill-call' as const, value, skillFile }],
  }
}

function makeTestWithTestLevelSkillFile(name: string, skillFile: string, value: boolean) {
  return {
    name,
    type: 'skill-call',
    promptFile: `${name}.md`,
    skillFile,
    expect: [{ type: 'skill-call' as const, value, skillFile }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveAndLoad', () => {
  // TP-008: Explicit skill — filters tests by test-level skillFile match
  it('filters tests by test-level skillFile when --skill provided', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        makeTestWithTestLevelSkillFile('t1', 'r-and-d:code-review', true),
        makeSkillCallTest('t2', 'r-and-d:investigate', true),
      ],
    })

    const result = await resolveAndLoad('my-suite', 'r-and-d:code-review', '/mock/tests', '/repo')
    expect(result.tests).toHaveLength(1)
    expect(result.tests[0].name).toBe('t1')
    expect(result.skillFile).toBe('r-and-d:code-review')
  })

  // TP-009: Explicit skill — filters by expectation-level skillFile match
  it('includes tests where expectation skillFile matches even if test-level does not', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        {
          name: 't1',
          type: 'skill-call',
          promptFile: 't1.md',
          expect: [{ type: 'skill-call' as const, value: true, skillFile: 'r-and-d:code-review' }],
        },
      ],
    })

    const result = await resolveAndLoad('my-suite', 'r-and-d:code-review', '/mock/tests', '/repo')
    expect(result.tests).toHaveLength(1)
  })

  // TP-004: Throws when SKILL.md does not exist (explicit skill)
  it('throws when SKILL.md does not exist for explicit skill', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: [],
      tests: [makeSkillCallTest('t1', 'r-and-d:code-review', true)],
    })

    await expect(resolveAndLoad('my-suite', 'r-and-d:code-review', '/mock/tests', '/repo')).rejects.toThrow(
      HarnessError,
    )
  })

  // TP-005: Throws when no matching tests found for explicit skill
  it('throws when no tests match the explicit skill', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [makeSkillCallTest('t1', 'r-and-d:investigate', true)],
    })

    await expect(resolveAndLoad('my-suite', 'r-and-d:code-review', '/mock/tests', '/repo')).rejects.toThrow(
      HarnessError,
    )
  })

  // TP-010: Inferred skill — single skill detected
  it('infers skill when only one skillFile found across expectations', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        makeSkillCallTest('t1', 'r-and-d:code-review', true),
        makeSkillCallTest('t2', 'r-and-d:code-review', false),
      ],
    })

    const result = await resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')
    expect(result.skillFile).toBe('r-and-d:code-review')
    expect(result.tests).toHaveLength(2)
  })

  // TP-006: Throws when no skill-call expectations found
  it('throws when no skill-call expectations exist in tests', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        {
          name: 't1',
          type: 'skill-call',
          promptFile: 't1.md',
          expect: [{ type: 'result-contains' as const, value: 'hello' }],
        },
      ],
    })

    await expect(resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')).rejects.toThrow(HarnessError)
  })

  // TP-007: Throws when multiple skills found during inference
  it('throws when multiple skills found during inference', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        makeSkillCallTest('t1', 'r-and-d:code-review', true),
        makeSkillCallTest('t2', 'r-and-d:investigate', true),
      ],
    })

    await expect(resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')).rejects.toThrow(HarnessError)
  })

  // TP-018: Inferred skill — throws when inferred SKILL.md does not exist
  it('throws when inferred SKILL.md does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [makeSkillCallTest('t1', 'r-and-d:code-review', true)],
    })

    await expect(resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')).rejects.toThrow(HarnessError)
  })

  // TP-019: Filters to skill-call type tests only
  it('filters out non-skill-call test types', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: ['r-and-d'],
      tests: [
        makeSkillCallTest('skill-test', 'r-and-d:code-review', true),
        {
          name: 'prompt-test',
          type: 'skill-prompt',
          promptFile: 'prompt.md',
          expect: [{ type: 'result-contains' as const, value: 'hello' }],
        },
      ],
    })

    const result = await resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')
    expect(result.tests).toHaveLength(1)
    expect(result.tests[0].name).toBe('skill-test')
  })

  // TP-001: Skill string without colon — existsSync receives path with "undefined"
  it('constructs path with undefined skillName when skill has no colon', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: [],
      tests: [],
    })

    await expect(resolveAndLoad('my-suite', 'no-colon', '/mock/tests', '/repo')).rejects.toThrow()
  })

  // TP-002: Inferred skillFile without colon from tests.json
  it('handles inferred skillFile without colon in expectations', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readTestSuiteConfig).mockResolvedValue({
      plugins: [],
      tests: [makeSkillCallTest('t1', 'malformed-no-colon', true)],
    })

    await expect(resolveAndLoad('my-suite', undefined, '/mock/tests', '/repo')).rejects.toThrow()
  })
})
