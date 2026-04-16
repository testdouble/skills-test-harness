import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runTestCases } from './step-8-run-test-cases.js'
import { mockTestSuiteConfig, mockParsedMetrics } from './fixtures.js'

vi.mock('../prompt/index.js', () => ({
  runPromptTests: vi.fn(),
}))
vi.mock('../skill-call/index.js', () => ({
  runSkillCallTests: vi.fn(),
}))
vi.mock('../agent-call/index.js', () => ({
  runAgentCallTests: vi.fn(),
}))
vi.mock('../agent-prompt/index.js', () => ({
  runAgentPromptTests: vi.fn(),
}))

import { runPromptTests } from '../prompt/index.js'
import { runSkillCallTests } from '../skill-call/index.js'
import { runAgentCallTests } from '../agent-call/index.js'
import { runAgentPromptTests } from '../agent-prompt/index.js'

const defaultTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
const promptResult = { totalDurationMs: mockParsedMetrics.durationMs, totalInputTokens: mockParsedMetrics.inputTokens, totalOutputTokens: mockParsedMetrics.outputTokens, failures: 0 }
const skillCallResult = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
const agentCallResult = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
const agentPromptResult = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }

beforeEach(() => {
  vi.mocked(runPromptTests).mockResolvedValue(promptResult)
  vi.mocked(runSkillCallTests).mockResolvedValue(skillCallResult)
  vi.mocked(runAgentCallTests).mockResolvedValue(agentCallResult)
  vi.mocked(runAgentPromptTests).mockResolvedValue(agentPromptResult)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function callRunTestCases(config = mockTestSuiteConfig, totals = { ...defaultTotals }) {
  return runTestCases(config, 'code-review', '/mock/test-suites/code-review', [], false, '20260320T094845', totals, '/mock/output', '/mock/repo')
}

describe('runTestCases dispatcher — routing', () => {
  it('routes skill-prompt tests to runPromptTests', async () => {
    await callRunTestCases()
    const [promptTests] = vi.mocked(runPromptTests).mock.calls[0]
    expect(promptTests.every(t => t.type === 'skill-prompt')).toBe(true)
    expect(promptTests).toHaveLength(2)
  })

  it('routes skill-call tests to runSkillCallTests', async () => {
    const configWithSkillCall = {
      ...mockTestSuiteConfig,
      tests: [
        ...mockTestSuiteConfig.tests,
        { name: 'Skill: code-review trigger', type: 'skill-call', promptFile: 'trigger.md', skillFile: 'r-and-d:code-review', expect: [] },
      ],
    }
    await callRunTestCases(configWithSkillCall)
    const [skillCallTests] = vi.mocked(runSkillCallTests).mock.calls[0]
    expect(skillCallTests).toHaveLength(1)
    expect(skillCallTests[0].type).toBe('skill-call')
  })

  it('routes agent-call tests to runAgentCallTests', async () => {
    const configWithAgentCall = {
      ...mockTestSuiteConfig,
      tests: [
        ...mockTestSuiteConfig.tests,
        { name: 'Agent: gap-analyzer trigger', type: 'agent-call', promptFile: 'trigger.md', agentFile: 'r-and-d:gap-analyzer', expect: [] },
      ],
    }
    await callRunTestCases(configWithAgentCall)
    const [agentCallTests] = vi.mocked(runAgentCallTests).mock.calls[0]
    expect(agentCallTests).toHaveLength(1)
    expect(agentCallTests[0].type).toBe('agent-call')
  })

  it('routes agent-prompt tests to runAgentPromptTests', async () => {
    const configWithAgentPrompt = {
      ...mockTestSuiteConfig,
      tests: [
        ...mockTestSuiteConfig.tests,
        { name: 'Agent Prompt: gap analysis', type: 'agent-prompt', promptFile: 'gap-analysis.md', agentFile: 'r-and-d:gap-analyzer', expect: [] },
      ],
    }
    await callRunTestCases(configWithAgentPrompt)
    const [agentPromptTests] = vi.mocked(runAgentPromptTests).mock.calls[0]
    expect(agentPromptTests).toHaveLength(1)
    expect(agentPromptTests[0].type).toBe('agent-prompt')
  })

  it('passes empty arrays when no tests of a given type exist', async () => {
    const promptOnlyConfig = { ...mockTestSuiteConfig }
    await callRunTestCases(promptOnlyConfig)
    const [skillCallTests] = vi.mocked(runSkillCallTests).mock.calls[0]
    const [agentCallTests] = vi.mocked(runAgentCallTests).mock.calls[0]
    const [agentPromptTests] = vi.mocked(runAgentPromptTests).mock.calls[0]
    expect(skillCallTests).toHaveLength(0)
    expect(agentCallTests).toHaveLength(0)
    expect(agentPromptTests).toHaveLength(0)
  })

  it('dispatches mixed suite with all four types correctly', async () => {
    const mixedConfig = {
      ...mockTestSuiteConfig,
      tests: [
        { name: 'Skill prompt test', type: 'skill-prompt', promptFile: 'p.md', model: 'sonnet' as const, expect: [] },
        { name: 'Skill test', type: 'skill-call', promptFile: 's.md', skillFile: 'r-and-d:code-review', expect: [] },
        { name: 'Agent test', type: 'agent-call', promptFile: 'a.md', agentFile: 'r-and-d:gap-analyzer', expect: [] },
        { name: 'Agent prompt test', type: 'agent-prompt', promptFile: 'ap.md', agentFile: 'r-and-d:gap-analyzer', expect: [] },
      ],
    }
    await callRunTestCases(mixedConfig)
    expect(vi.mocked(runPromptTests).mock.calls[0][0]).toHaveLength(1)
    expect(vi.mocked(runSkillCallTests).mock.calls[0][0]).toHaveLength(1)
    expect(vi.mocked(runAgentCallTests).mock.calls[0][0]).toHaveLength(1)
    expect(vi.mocked(runAgentPromptTests).mock.calls[0][0]).toHaveLength(1)
  })
})

describe('runTestCases dispatcher — totals threading', () => {
  it('passes initial totals to runPromptTests', async () => {
    const totals = { ...defaultTotals }
    await callRunTestCases(mockTestSuiteConfig, totals)
    const passedTotals = vi.mocked(runPromptTests).mock.calls[0][7]
    expect(passedTotals).toBe(totals)
  })

  it('passes runPromptTests result to runSkillCallTests', async () => {
    const intermediateResult = { totalDurationMs: 500, totalInputTokens: 100, totalOutputTokens: 50, failures: 1 }
    vi.mocked(runPromptTests).mockResolvedValue(intermediateResult)
    await callRunTestCases()
    const passedTotals = vi.mocked(runSkillCallTests).mock.calls[0][6]
    expect(passedTotals).toBe(intermediateResult)
  })

  it('passes runSkillCallTests result to runAgentCallTests', async () => {
    const skillResult = { totalDurationMs: 700, totalInputTokens: 150, totalOutputTokens: 75, failures: 1 }
    vi.mocked(runSkillCallTests).mockResolvedValue(skillResult)
    await callRunTestCases()
    const passedTotals = vi.mocked(runAgentCallTests).mock.calls[0][6]
    expect(passedTotals).toBe(skillResult)
  })

  it('passes runAgentCallTests result to runAgentPromptTests', async () => {
    const agentResult = { totalDurationMs: 800, totalInputTokens: 175, totalOutputTokens: 85, failures: 1 }
    vi.mocked(runAgentCallTests).mockResolvedValue(agentResult)
    await callRunTestCases()
    const passedTotals = vi.mocked(runAgentPromptTests).mock.calls[0][7]
    expect(passedTotals).toBe(agentResult)
  })

  it('returns the final result from runAgentPromptTests', async () => {
    const finalResult = { totalDurationMs: 1000, totalInputTokens: 200, totalOutputTokens: 100, failures: 2 }
    vi.mocked(runAgentPromptTests).mockResolvedValue(finalResult)
    const result = await callRunTestCases()
    expect(result).toBe(finalResult)
  })
})

describe('runTestCases dispatcher — args forwarding', () => {
  it('forwards suite, testSuiteDir, pluginDirs, debug, testRunId to runPromptTests', async () => {
    await callRunTestCases()
    const args = vi.mocked(runPromptTests).mock.calls[0]
    expect(args[2]).toBe('code-review')       // suite
    expect(args[3]).toBe('/mock/test-suites/code-review') // testSuiteDir
    // args[4] = pluginDirs
    expect(args[5]).toBe(false)               // debug
    expect(args[6]).toBe('20260320T094845')   // testRunId
  })

  it('forwards suite, testSuiteDir, debug, testRunId to runSkillCallTests', async () => {
    await callRunTestCases()
    const args = vi.mocked(runSkillCallTests).mock.calls[0]
    expect(args[2]).toBe('code-review')       // suite
    expect(args[3]).toBe('/mock/test-suites/code-review') // testSuiteDir
    expect(args[4]).toBe(false)               // debug
    expect(args[5]).toBe('20260320T094845')   // testRunId
  })

  it('forwards suite, testSuiteDir, debug, testRunId, outputDir, repoRoot to runAgentCallTests', async () => {
    await callRunTestCases()
    const args = vi.mocked(runAgentCallTests).mock.calls[0]
    expect(args[2]).toBe('code-review')       // suite
    expect(args[3]).toBe('/mock/test-suites/code-review') // testSuiteDir
    expect(args[4]).toBe(false)               // debug
    expect(args[5]).toBe('20260320T094845')   // testRunId
    expect(args[7]).toBe('/mock/output')      // outputDir
    expect(args[8]).toBe('/mock/repo')        // repoRoot
  })

  it('forwards suite, testSuiteDir, pluginDirs, debug, testRunId to runAgentPromptTests', async () => {
    await callRunTestCases()
    const args = vi.mocked(runAgentPromptTests).mock.calls[0]
    expect(args[2]).toBe('code-review')       // suite
    expect(args[3]).toBe('/mock/test-suites/code-review') // testSuiteDir
    // args[4] = pluginDirs
    expect(args[5]).toBe(false)               // debug
    expect(args[6]).toBe('20260320T094845')   // testRunId
  })
})
