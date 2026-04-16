import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runAgentPromptTests, wrapWithDelegation } from './index.js'
import type { TestCase, TestSuiteConfig, RunTotals } from '@testdouble/harness-data'

vi.mock('@testdouble/harness-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testdouble/harness-data')>()
  return {
    ...actual,
    resolvePromptPath: vi.fn((_dir: string, file: string) => `/mock/suite/${file}`),
    readPromptFile: vi.fn().mockResolvedValue('analyze the project'),
    parseStreamJsonLines: vi.fn().mockReturnValue([]),
    extractMetrics: vi.fn().mockReturnValue({
      durationMs: 100,
      inputTokens: 50,
      outputTokens: 25,
      isError: false,
      result: '',
    }),
  }
})

vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  extractOutputFiles: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../lib/metrics.js', () => ({
  accumulateTotals: vi.fn((_totals, _metrics) => ({
    totalDurationMs: 100,
    totalInputTokens: 50,
    totalOutputTokens: 25,
    failures: 0,
  })),
}))

vi.mock('../../lib/output.js', () => ({
  writeTestOutput: vi.fn().mockResolvedValue(undefined),
}))

import { readPromptFile } from '@testdouble/harness-data'
import { runClaude } from '@testdouble/claude-integration'
import { writeTestOutput } from '../../lib/output.js'

const defaultTotals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }

const mockConfig: TestSuiteConfig = {
  plugins: ['r-and-d'],
  tests: [],
}

function makeAgentPromptTest(overrides: Partial<TestCase> = {}): TestCase {
  return {
    name: 'Agent Prompt: gap analysis',
    type: 'agent-prompt',
    promptFile: 'agent-prompt-gap-analysis.md',
    agentFile: 'r-and-d:gap-analyzer',
    expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }],
    ...overrides,
  }
}

let stderrSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('wrapWithDelegation', () => {
  it('wraps prompt content with agent delegation instruction', () => {
    const result = wrapWithDelegation('gap-analyzer', 'analyze the project for gaps')
    expect(result).toBe('Use the gap-analyzer agent to accomplish the following task:\n\nanalyze the project for gaps')
  })
})

describe('runAgentPromptTests', () => {
  it('wraps prompt with delegation using agent name from agentFile', async () => {
    const test = makeAgentPromptTest()
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.prompt).toBe('Use the gap-analyzer agent to accomplish the following task:\n\nanalyze the project')
  })

  it('passes all pluginDirs to runClaude (no temp plugin)', async () => {
    const test = makeAgentPromptTest()
    const pluginDirs = ['/mock/plugins/r-and-d', '/mock/plugins/writing-style']
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', pluginDirs, false, 'run-001', { ...defaultTotals }, '/mock/output')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.pluginDirs).toEqual(['/mock/plugins/r-and-d', '/mock/plugins/writing-style'])
  })

  it('uses custom model when specified on the test', async () => {
    const test = makeAgentPromptTest({ model: 'opus' })
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.model).toBe('opus')
  })

  it('resolves scaffold path when test has a scaffold', async () => {
    const test = makeAgentPromptTest({ scaffold: 'go-project' })
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.scaffold).toBe('/mock/suite/scaffolds/go-project')
  })

  it('prints agentFile in test config output', async () => {
    const test = makeAgentPromptTest()
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    const stderrOutput = stderrSpy.mock.calls.map((c: [string]) => c[0]).join('')
    expect(stderrOutput).toContain('agentFile: r-and-d:gap-analyzer')
  })

  it('writes test output for each test', async () => {
    const test = makeAgentPromptTest()
    await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    expect(writeTestOutput).toHaveBeenCalledWith(
      '/mock/output/run-001', 'run-001', 'gap-analyzer', ['r-and-d'], test, []
    )
  })

  it('increments failures when exit code is non-zero', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
    const test = makeAgentPromptTest()
    const result = await runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    expect(result.failures).toBe(1)
  })

  it('returns empty totals for no tests', async () => {
    const result = await runAgentPromptTests([], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')

    expect(result).toEqual(defaultTotals)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('throws HarnessError when prompt file is not found', async () => {
    vi.mocked(readPromptFile).mockRejectedValueOnce(new Error('ENOENT'))
    const test = makeAgentPromptTest()

    await expect(
      runAgentPromptTests([test], mockConfig, 'gap-analyzer', '/mock/suite', ['/mock/plugins/r-and-d'], false, 'run-001', { ...defaultTotals }, '/mock/output')
    ).rejects.toThrow('Prompt file not found')
  })
})
