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

function makeAgentCallTest(name: string, agentFile: string, value: boolean) {
  return {
    name,
    type: 'agent-call',
    promptFile: `${name}.md`,
    expect: [{ type: 'agent-call' as const, value, agentFile }],
  }
}

function mockConfig(tests: unknown[]) {
  vi.mocked(readTestSuiteConfig).mockResolvedValue({ tests, plugins: ['r-and-d'] } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveAndLoad (ACIL)', () => {
  describe('with explicit --agent', () => {
    it('returns matching agent-call tests for the specified agent', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      mockConfig([
        makeAgentCallTest('test-1', 'r-and-d:gap-analyzer', true),
        makeAgentCallTest('test-2', 'r-and-d:other-agent', true),
      ])

      const result = await resolveAndLoad('my-suite', 'r-and-d:gap-analyzer', '/tests', '/repo')

      expect(result.agentFile).toBe('r-and-d:gap-analyzer')
      expect(result.agentMdPath).toBe('/repo/r-and-d/agents/gap-analyzer.md')
      expect(result.tests).toHaveLength(1)
      expect(result.tests[0].name).toBe('test-1')
    })

    it('matches tests with test-level agentFile', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      mockConfig([
        {
          name: 'test-1',
          type: 'agent-call',
          promptFile: 'test-1.md',
          agentFile: 'r-and-d:gap-analyzer',
          expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }],
        },
      ])

      const result = await resolveAndLoad('my-suite', 'r-and-d:gap-analyzer', '/tests', '/repo')

      expect(result.tests).toHaveLength(1)
    })

    it('throws HarnessError when agent identifier has no colon', async () => {
      await expect(resolveAndLoad('my-suite', 'gap-analyzer', '/tests', '/repo')).rejects.toThrow(
        /Invalid agent identifier/,
      )
    })

    it('throws HarnessError when agent identifier contains path traversal', async () => {
      await expect(resolveAndLoad('my-suite', '../../etc:passwd', '/tests', '/repo')).rejects.toThrow(
        /Invalid agent identifier/,
      )
    })

    it('throws HarnessError when agent .md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      mockConfig([])

      await expect(resolveAndLoad('my-suite', 'r-and-d:gap-analyzer', '/tests', '/repo')).rejects.toThrow(HarnessError)
    })

    it('throws HarnessError when no matching tests found', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      mockConfig([makeAgentCallTest('test-1', 'r-and-d:other-agent', true)])

      await expect(resolveAndLoad('my-suite', 'r-and-d:gap-analyzer', '/tests', '/repo')).rejects.toThrow(
        /No agent-call tests found for agent/,
      )
    })

    it('filters out non-agent-call tests', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      mockConfig([
        {
          name: 'skill-test',
          type: 'skill-call',
          promptFile: 'skill.md',
          expect: [{ type: 'skill-call', value: true, skillFile: 'r-and-d:gap-analyzer' }],
        },
        makeAgentCallTest('agent-test', 'r-and-d:gap-analyzer', true),
      ])

      const result = await resolveAndLoad('my-suite', 'r-and-d:gap-analyzer', '/tests', '/repo')

      expect(result.tests).toHaveLength(1)
      expect(result.tests[0].name).toBe('agent-test')
    })
  })

  describe('without explicit --agent (inference)', () => {
    it('infers agent from expectations when only one agentFile is present', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      mockConfig([
        makeAgentCallTest('test-1', 'r-and-d:gap-analyzer', true),
        makeAgentCallTest('test-2', 'r-and-d:gap-analyzer', false),
      ])

      const result = await resolveAndLoad('my-suite', undefined, '/tests', '/repo')

      expect(result.agentFile).toBe('r-and-d:gap-analyzer')
      expect(result.tests).toHaveLength(2)
    })

    it('throws when multiple agents found in expectations', async () => {
      mockConfig([
        makeAgentCallTest('test-1', 'r-and-d:gap-analyzer', true),
        makeAgentCallTest('test-2', 'r-and-d:other-agent', true),
      ])

      await expect(resolveAndLoad('my-suite', undefined, '/tests', '/repo')).rejects.toThrow(/Multiple agents found/)
    })

    it('throws when no agent-call tests found', async () => {
      mockConfig([
        {
          name: 'skill-test',
          type: 'skill-call',
          promptFile: 's.md',
          expect: [{ type: 'skill-call', value: true, skillFile: 'x:y' }],
        },
      ])

      await expect(resolveAndLoad('my-suite', undefined, '/tests', '/repo')).rejects.toThrow(
        /No agent-call tests found/,
      )
    })

    it('throws when inferred agent has invalid format', async () => {
      mockConfig([
        {
          name: 'test-1',
          type: 'agent-call',
          promptFile: 'test-1.md',
          expect: [{ type: 'agent-call', value: true, agentFile: 'no-colon' }],
        },
      ])

      await expect(resolveAndLoad('my-suite', undefined, '/tests', '/repo')).rejects.toThrow(/Invalid agent identifier/)
    })

    it('throws when inferred agent .md does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      mockConfig([makeAgentCallTest('test-1', 'r-and-d:gap-analyzer', true)])

      await expect(resolveAndLoad('my-suite', undefined, '/tests', '/repo')).rejects.toThrow(HarnessError)
    })
  })
})
