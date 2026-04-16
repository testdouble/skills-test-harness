import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  resolvePromptPath: vi.fn(),
  readPromptFile: vi.fn(),
  parseStreamJsonLines: vi.fn(),
}))
vi.mock('@testdouble/harness-evals', () => ({
  evaluateAgentCall: vi.fn(),
}))
vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn(),
}))

import { runClaude } from '@testdouble/claude-integration'
import { parseStreamJsonLines, readPromptFile, resolvePromptPath } from '@testdouble/harness-data'
import { evaluateAgentCall } from '@testdouble/harness-evals'
import { runEval } from './step-5-run-eval.js'
import type { AcilTestCase } from './types.js'

const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

function makeTestCase(overrides: Partial<AcilTestCase> = {}): AcilTestCase {
  return {
    name: 'test-1',
    type: 'agent-call',
    promptFile: 'test-1.md',
    set: 'train',
    expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }],
    ...overrides,
  } as AcilTestCase
}

beforeEach(() => {
  vi.clearAllMocks()
  stderrSpy.mockClear()

  vi.mocked(resolvePromptPath).mockReturnValue('/tests/test-suites/my-suite/prompts/test-1.md')
  vi.mocked(readPromptFile).mockResolvedValue('test prompt content')
  vi.mocked(runClaude).mockResolvedValue({ stdout: 'stream output', stderr: '', exitCode: 0 })
  vi.mocked(parseStreamJsonLines).mockReturnValue([])
  vi.mocked(evaluateAgentCall).mockReturnValue(true)
})

describe('runEval (ACIL)', () => {
  it('returns AcilQueryResult with agentFile field', async () => {
    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(1)
    expect(results[0].agentFile).toBe('r-and-d:gap-analyzer')
    expect(results[0].testName).toBe('test-1')
    expect(results[0].passed).toBe(true)
  })

  it('calls evaluateAgentCall with the correct agentFile', async () => {
    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(evaluateAgentCall).toHaveBeenCalledWith('r-and-d:gap-analyzer', true, [])
  })

  it('handles failed evaluation (expected true, actual false)', async () => {
    vi.mocked(evaluateAgentCall).mockReturnValue(false)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results[0].passed).toBe(false)
    expect(results[0].expected).toBe(true)
    expect(results[0].actual).toBe(false)
  })

  it('handles negative test (expected false)', async () => {
    vi.mocked(evaluateAgentCall).mockReturnValue(false)

    const testCase = makeTestCase({
      expect: [{ type: 'agent-call', value: false, agentFile: 'r-and-d:gap-analyzer' }],
    } as Partial<AcilTestCase>)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [testCase],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results[0].expected).toBe(false)
    expect(results[0].passed).toBe(true)
  })

  it('aggregates by majority vote when runsPerQuery > 1', async () => {
    vi.mocked(evaluateAgentCall).mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(true)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 3,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true) // 2/3 passed
  })

  it('passes pluginDirs with tempDir to runClaude', async () => {
    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginDirs: ['/tmp/acil-plugin'],
      }),
    )
  })

  it('returns empty array for empty testCases', async () => {
    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toEqual([])
  })

  // TP-010 (EC2/T12): failed query excluded from results, does not crash
  it('excludes failed queries and continues with successful ones', async () => {
    vi.mocked(runClaude)
      .mockRejectedValueOnce(new Error('sandbox crashed'))
      .mockResolvedValueOnce({ stdout: 'output', stderr: '', exitCode: 0 })

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase({ name: 'will-fail' }), makeTestCase({ name: 'will-succeed' })],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(1)
    expect(results[0].testName).toBe('will-succeed')
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('will-fail'))
  })

  // TP-011 (EC10): majority vote tie with even runsPerQuery resolves to fail
  it('resolves majority vote tie as fail when runsPerQuery is even', async () => {
    vi.mocked(evaluateAgentCall).mockReturnValueOnce(true).mockReturnValueOnce(false)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 2,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false) // 1/2 is not > 1, tie breaks as fail
  })

  // TP-012 (T13): scaffold path resolution
  it('resolves scaffold path when test.scaffold is set', async () => {
    const testCase = makeTestCase({ scaffold: 'my-scaffold' } as Partial<AcilTestCase>)

    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [testCase],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        scaffold: '/tests/test-suites/my-suite/scaffolds/my-scaffold',
      }),
    )
  })

  it('passes null scaffold when test has no scaffold', async () => {
    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        scaffold: null,
      }),
    )
  })

  // TP-014 (T14): model default and override
  it('defaults model to sonnet when test has no model', async () => {
    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'sonnet',
      }),
    )
  })

  it('uses test-level model when specified', async () => {
    const testCase = makeTestCase({ model: 'haiku' } as Partial<AcilTestCase>)

    await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [testCase],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'haiku',
      }),
    )
  })

  // TP-015/TP-016 (T15/EC11): agentFile fallback chain
  it('uses test-level agentFile when present', async () => {
    const testCase = makeTestCase({
      agentFile: 'r-and-d:custom-agent',
      expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }],
    } as Partial<AcilTestCase>)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [testCase],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results[0].agentFile).toBe('r-and-d:custom-agent')
  })

  // T1: concurrency pool exercises Promise.race branch
  it('returns all results with concurrency < work items', async () => {
    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase({ name: 'test-a' }), makeTestCase({ name: 'test-b' }), makeTestCase({ name: 'test-c' })],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 2,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(3)
    expect(runClaude).toHaveBeenCalledTimes(3)
  })

  // T3 (EC2): all queries fail — returns empty array without crashing
  it('returns empty array when all queries fail', async () => {
    vi.mocked(runClaude).mockRejectedValue(new Error('sandbox failure'))

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase({ name: 'test-a' }), makeTestCase({ name: 'test-b' })],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 1,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toEqual([])
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('test-a'))
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('test-b'))
  })

  // T4: majority vote with all failures
  it('returns passed=false when all runs fail evaluation', async () => {
    vi.mocked(evaluateAgentCall).mockReturnValue(false)

    const results = await runEval({
      tempDir: '/tmp/acil-plugin',
      testCases: [makeTestCase()],
      suite: 'my-suite',
      testsDir: '/tests',
      concurrency: 1,
      runsPerQuery: 3,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/tmp/acil-output',
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
  })
})
