import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runAgentCallTests } from './index.js'
import type { TestCase, TestSuiteConfig, RunTotals } from '@testdouble/harness-data'

vi.mock('@testdouble/harness-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testdouble/harness-data')>()
  return {
    ...actual,
    resolvePromptPath: vi.fn((_dir: string, file: string) => `/mock/suite/${file}`),
    readPromptFile: vi.fn().mockResolvedValue('test prompt content'),
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

vi.mock('./build-temp-plugin.js', () => ({
  buildTempAgentPlugin: vi.fn().mockResolvedValue({ tempDir: '/tmp/temp-agents/r-and-d-gap-analyzer' }),
}))

import { readPromptFile } from '@testdouble/harness-data'
import { runClaude } from '@testdouble/claude-integration'
import { buildTempAgentPlugin } from './build-temp-plugin.js'
import { writeTestOutput } from '../../lib/output.js'

const defaultTotals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }

const mockConfig: TestSuiteConfig = {
  plugins: ['r-and-d'],
  tests: [],
}

function makeAgentTest(overrides: Partial<TestCase> = {}): TestCase {
  return {
    name: 'Agent: gap-analyzer trigger',
    type: 'agent-call',
    promptFile: 'trigger-gap-analyzer.md',
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

describe('runAgentCallTests', () => {
  it('calls buildTempAgentPlugin with the test agentFile', async () => {
    const test = makeAgentTest()
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(buildTempAgentPlugin).toHaveBeenCalledWith('r-and-d:gap-analyzer', '/mock/output/run-001', '/mock/repo')
  })

  it('executes Claude with the temp plugin dir', async () => {
    const test = makeAgentTest()
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(runClaude).toHaveBeenCalledWith({
      model: 'sonnet',
      prompt: 'test prompt content',
      pluginDirs: ['/tmp/temp-agents/r-and-d-gap-analyzer'],
      scaffold: null,
      debug: false,
    })
  })

  it('uses custom model when specified on the test', async () => {
    const test = makeAgentTest({ model: 'opus' })
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.model).toBe('opus')
  })

  it('resolves scaffold path when test has a scaffold', async () => {
    const test = makeAgentTest({ scaffold: 'my-scaffold' })
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.scaffold).toBe('/mock/suite/scaffolds/my-scaffold')
  })

  it('prints agentFile in test config output', async () => {
    const test = makeAgentTest()
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    const stderrOutput = stderrSpy.mock.calls.map((c: [string]) => c[0]).join('')
    expect(stderrOutput).toContain('agentFile: r-and-d:gap-analyzer')
  })

  it('writes test output for each test', async () => {
    const test = makeAgentTest()
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(writeTestOutput).toHaveBeenCalledWith(
      '/mock/output/run-001', 'run-001', 'gap-analysis', ['r-and-d'], test, []
    )
  })

  it('runs multiple tests sequentially', async () => {
    const tests = [
      makeAgentTest({ name: 'Test 1', agentFile: 'r-and-d:agent-a' }),
      makeAgentTest({ name: 'Test 2', agentFile: 'r-and-d:agent-b' }),
    ]
    await runAgentCallTests(tests, mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(buildTempAgentPlugin).toHaveBeenCalledTimes(2)
    expect(runClaude).toHaveBeenCalledTimes(2)
  })

  it('increments failures when exit code is non-zero', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
    const test = makeAgentTest()
    const result = await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(result.failures).toBe(1)
  })

  it('increments failures when metrics reports isError', async () => {
    const { extractMetrics } = await import('@testdouble/harness-data')
    vi.mocked(extractMetrics).mockReturnValueOnce({
      durationMs: 100,
      inputTokens: 50,
      outputTokens: 25,
      isError: true,
      result: '',
    })
    const test = makeAgentTest()
    const result = await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(result.failures).toBe(1)
  })

  it('increments failures by 2 when both exitCode and isError fail (TP-001)', async () => {
    const { extractMetrics } = await import('@testdouble/harness-data')
    vi.mocked(runClaude).mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
    vi.mocked(extractMetrics).mockReturnValueOnce({
      durationMs: 100,
      inputTokens: 50,
      outputTokens: 25,
      isError: true,
      result: '',
    })
    const test = makeAgentTest()
    const result = await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(result.failures).toBe(2)
  })

  it('accumulates failures across multiple failing tests (TP-002)', async () => {
    vi.mocked(runClaude)
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
    const tests = [
      makeAgentTest({ name: 'Test 1' }),
      makeAgentTest({ name: 'Test 2' }),
    ]
    const result = await runAgentCallTests(tests, mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(result.failures).toBe(2)
  })

  it('preserves incoming non-zero failures from totals (TP-004)', async () => {
    vi.mocked(runClaude).mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
    const test = makeAgentTest()
    const incomingTotals = { ...defaultTotals, failures: 3 }
    const result = await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', incomingTotals, '/mock/output', '/mock/repo')

    expect(result.failures).toBe(4)
  })

  it('forwards debug=true to runClaude (TP-003)', async () => {
    const test = makeAgentTest()
    await runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', true, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    const claudeCall = vi.mocked(runClaude).mock.calls[0][0]
    expect(claudeCall.debug).toBe(true)
  })

  it('returns empty array for no tests', async () => {
    const result = await runAgentCallTests([], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')

    expect(result).toEqual(defaultTotals)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('throws HarnessError when prompt file is not found', async () => {
    vi.mocked(readPromptFile).mockRejectedValueOnce(new Error('ENOENT'))
    const test = makeAgentTest()

    await expect(
      runAgentCallTests([test], mockConfig, 'gap-analysis', '/mock/suite', false, 'run-001', { ...defaultTotals }, '/mock/output', '/mock/repo')
    ).rejects.toThrow('Prompt file not found')
  })
})
