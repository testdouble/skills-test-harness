import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/harness-data', () => ({
  resolvePromptPath: vi.fn().mockReturnValue('/resolved/prompt.md'),
  readPromptFile: vi.fn().mockResolvedValue('prompt content'),
  parseStreamJsonLines: vi.fn().mockReturnValue([]),
}))
vi.mock('@testdouble/harness-evals', () => ({
  evaluateSkillCall: vi.fn().mockReturnValue(true),
}))
vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' }),
}))

import { runClaude } from '@testdouble/claude-integration'
import { parseStreamJsonLines, readPromptFile, resolvePromptPath } from '@testdouble/harness-data'
import { evaluateSkillCall } from '@testdouble/harness-evals'
import type { RunEvalOptions } from './step-5-run-eval.js'
import { runEval } from './step-5-run-eval.js'
import type { ScilTestCase } from './types.js'

function makeTestCase(overrides: Partial<ScilTestCase> = {}): ScilTestCase {
  return {
    name: 'test-1',
    type: 'skill-call',
    promptFile: 'test-1.md',
    set: 'train',
    expect: [{ type: 'skill-call' as const, value: true, skillFile: 'plugin:skill' }],
    ...overrides,
  }
}

function makeOpts(overrides: Partial<RunEvalOptions> = {}): RunEvalOptions {
  return {
    tempDir: '/tmp/scil',
    testCases: [makeTestCase()],
    suite: 'my-suite',
    testsDir: '/mock/tests',
    concurrency: 2,
    runsPerQuery: 1,
    debug: false,
    testRunId: 'run-1',
    runDir: '/tmp/scil-output',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolvePromptPath).mockReturnValue('/resolved/prompt.md')
  vi.mocked(readPromptFile).mockResolvedValue('prompt content')
  vi.mocked(evaluateSkillCall).mockReturnValue(true)
  vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' })
  vi.mocked(parseStreamJsonLines).mockReturnValue([])
})

describe('runEval', () => {
  // TP-007: happy path — single test case passes
  it('returns a passing result for a single test case', async () => {
    const results = await runEval(makeOpts())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].testName).toBe('test-1')
    expect(results[0].expected).toBe(true)
    expect(results[0].actual).toBe(true)
    expect(runClaude).toHaveBeenCalledOnce()
  })

  // TP-013: scaffold path passed when set
  it('passes scaffold path to runClaude when scaffold is set', async () => {
    const testCase = makeTestCase({ scaffold: 'my-scaffold' })
    await runEval(makeOpts({ testCases: [testCase] }))

    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.scaffold).toBe('/mock/tests/test-suites/my-suite/scaffolds/my-scaffold')
  })

  // TP-025: scaffold null when falsy
  it('passes null scaffold when scaffold is not set', async () => {
    await runEval(makeOpts())

    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.scaffold).toBeNull()
  })

  // TP-022: model defaults to 'sonnet'
  it('defaults model to sonnet when not specified', async () => {
    await runEval(makeOpts())

    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.model).toBe('sonnet')
  })

  it('uses specified model from test case', async () => {
    const testCase = makeTestCase({ model: 'opus' })
    await runEval(makeOpts({ testCases: [testCase] }))

    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.model).toBe('opus')
  })

  // TP-008: no skill-call expectation defaults expected to true
  it('defaults expected to true when no skill-call expectation', async () => {
    const testCase = makeTestCase({
      expect: [{ type: 'result-contains' as const, value: 'hello' }],
    })
    vi.mocked(evaluateSkillCall).mockReturnValue(true)
    const results = await runEval(makeOpts({ testCases: [testCase] }))

    expect(results[0].expected).toBe(true)
    expect(results[0].passed).toBe(true)
  })

  // TP-009: expected=false, actual=true → passed=false
  it('reports failure when expected and actual differ', async () => {
    const testCase = makeTestCase({
      expect: [{ type: 'skill-call' as const, value: false, skillFile: 'plugin:skill' }],
    })
    vi.mocked(evaluateSkillCall).mockReturnValue(true)
    const results = await runEval(makeOpts({ testCases: [testCase] }))

    expect(results[0].expected).toBe(false)
    expect(results[0].actual).toBe(true)
    expect(results[0].passed).toBe(false)
  })

  // TP-024: skillFile resolved from test.skillFile when present
  it('uses test-level skillFile over expectation skillFile', async () => {
    const testCase = makeTestCase({ skillFile: 'test-level:skill' })
    const results = await runEval(makeOpts({ testCases: [testCase] }))

    expect(results[0].skillFile).toBe('test-level:skill')
  })

  // TP-002 (EC3): missing skill-call expectation + no skillFile → empty string
  it('uses empty skillFile when no skill-call expectation and no test.skillFile', async () => {
    const testCase = makeTestCase({
      skillFile: undefined,
      expect: [{ type: 'result-contains' as const, value: 'hello' }],
    })
    const results = await runEval(makeOpts({ testCases: [testCase] }))

    expect(results[0].skillFile).toBe('')
  })

  // TP-023: multiple test cases produce one result per test
  it('produces one result per test case with runsPerQuery=1', async () => {
    const testCases = [
      makeTestCase({ name: 'test-a' }),
      makeTestCase({ name: 'test-b' }),
      makeTestCase({ name: 'test-c' }),
    ]
    const results = await runEval(makeOpts({ testCases }))

    expect(results).toHaveLength(3)
    const names = results.map((r) => r.testName).sort()
    expect(names).toEqual(['test-a', 'test-b', 'test-c'])
  })

  // TP-010: majority vote aggregation
  it('aggregates by majority vote when runsPerQuery > 1', async () => {
    let callCount = 0
    vi.mocked(evaluateSkillCall).mockImplementation(() => {
      callCount++
      return callCount <= 2 // first 2 calls return true, 3rd returns false
    })

    const results = await runEval(makeOpts({ runsPerQuery: 3 }))

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true) // 2/3 majority
  })

  // TP-026 (EC5): even runsPerQuery tie → failure
  it('treats 50/50 tie as failure with even runsPerQuery', async () => {
    let callCount = 0
    vi.mocked(evaluateSkillCall).mockImplementation(() => {
      callCount++
      return callCount === 1 // first pass, second fail
    })

    const results = await runEval(makeOpts({ runsPerQuery: 2 }))

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false) // 1/2 is not > 0.5
  })

  // TP-001 (EC2): runsPerQuery=0 produces empty results
  it('returns empty results when runsPerQuery is 0', async () => {
    const results = await runEval(makeOpts({ runsPerQuery: 0 }))

    expect(results).toHaveLength(0)
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('returns results in work-item order regardless of promise resolution order', async () => {
    const resolvers: Array<() => void> = []
    vi.mocked(runClaude).mockImplementation(
      () =>
        new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
          resolvers.push(() => resolve({ exitCode: 0, stdout: '{}', stderr: '' }))
        }),
    )

    const testCases = [
      makeTestCase({ name: 'test-a' }),
      makeTestCase({ name: 'test-b' }),
      makeTestCase({ name: 'test-c' }),
    ]

    const resultPromise = runEval(makeOpts({ testCases, concurrency: 10 }))

    // Flush microtasks so runSingleQuery reaches its `await runClaude()` call
    await Promise.resolve()

    // Resolve in reverse order
    resolvers[2]()
    resolvers[1]()
    resolvers[0]()

    const results = await resultPromise

    expect(results).toHaveLength(3)
    expect(results.map((r) => r.testName)).toEqual(['test-a', 'test-b', 'test-c'])
  })

  it('returns results for remaining tasks when one task fails', async () => {
    let callCount = 0
    vi.mocked(runClaude).mockImplementation(() => {
      callCount++
      if (callCount === 2) return Promise.reject(new Error('sandbox failure'))
      return Promise.resolve({ exitCode: 0, stdout: '{}', stderr: '' })
    })

    const testCases = [
      makeTestCase({ name: 'test-a' }),
      makeTestCase({ name: 'test-b' }),
      makeTestCase({ name: 'test-c' }),
    ]

    const results = await runEval(makeOpts({ testCases, concurrency: 10 }))

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.testName).sort()).toEqual(['test-a', 'test-c'])
  })

  // TP-011 (EC4): duplicate test names merge in majority vote
  it('merges duplicate test names during majority vote aggregation', async () => {
    const testCases = [makeTestCase({ name: 'same-name' }), makeTestCase({ name: 'same-name' })]
    vi.mocked(evaluateSkillCall).mockReturnValue(true)

    const results = await runEval(makeOpts({ testCases, runsPerQuery: 2 }))

    // 4 sandbox exec calls (2 test cases × 2 runs), grouped by name into 1 group
    expect(runClaude).toHaveBeenCalledTimes(4)
    expect(results).toHaveLength(1)
  })
})
