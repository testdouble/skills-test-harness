import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./step-1-resolve-and-load.js', () => ({
  resolveAndLoad: vi.fn(),
}))
vi.mock('./step-2-split-sets.js', () => ({
  splitSets: vi.fn(),
}))
vi.mock('./step-3-read-agent.js', () => ({
  readAgent: vi.fn(),
}))
vi.mock('./step-4-build-temp-plugin.js', () => ({
  buildIterationPlugin: vi.fn(),
}))
vi.mock('./step-5-run-eval.js', () => ({
  runEval: vi.fn(),
}))
vi.mock('./step-6-score.js', () => ({
  scoreResults: vi.fn(),
  selectBestIteration: vi.fn(),
}))
vi.mock('./step-7-improve-description.js', () => ({
  improveDescription: vi.fn(),
}))
vi.mock('./step-8-apply-description.js', () => ({
  applyDescription: vi.fn(),
}))
vi.mock('./step-9-write-output.js', () => ({
  writeIterationOutput: vi.fn(),
  writeSummaryOutput: vi.fn(),
}))
vi.mock('./step-10-print-report.js', () => ({
  printIterationProgress: vi.fn(),
  printFinalSummary: vi.fn(),
}))
vi.mock('@testdouble/docker-integration', () => ({
  ensureSandboxExists: vi.fn(),
}))
vi.mock('@testdouble/harness-data', () => ({
  getPhase: vi.fn().mockReturnValue('converge'),
}))
vi.mock('../test-runners/steps/step-4-generate-run-id.js', () => ({
  generateRunId: vi.fn().mockReturnValue('run-abc'),
}))
vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(),
}))

import type { AcilConfig, AcilTestCase, AcilQueryResult } from './types.js'
import { runAcilLoop } from './loop.js'
import { resolveAndLoad } from './step-1-resolve-and-load.js'
import { splitSets } from './step-2-split-sets.js'
import { readAgent } from './step-3-read-agent.js'
import { buildIterationPlugin } from './step-4-build-temp-plugin.js'
import { runEval } from './step-5-run-eval.js'
import { scoreResults, selectBestIteration } from './step-6-score.js'
import { improveDescription } from './step-7-improve-description.js'
import { applyDescription } from './step-8-apply-description.js'
import { writeIterationOutput, writeSummaryOutput } from './step-9-write-output.js'
import { printIterationProgress, printFinalSummary } from './step-10-print-report.js'
import { ensureSandboxExists } from '@testdouble/docker-integration'
import { getPhase } from '@testdouble/harness-data'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
import { createInterface } from 'node:readline/promises'

function makeConfig(overrides: Partial<AcilConfig> = {}): AcilConfig {
  return {
    suite:             'my-suite',
    agent:             'r-and-d:gap-analyzer',
    maxIterations:     5,
    holdout:           0,
    concurrency:       1,
    runsPerQuery:      1,
    model:             'opus',
    debug:             false,
    apply:             true,
    outputDir:         '/mock-output',
    testsDir:          '/mock-tests',
    repoRoot:          '/mock-repo',
    ...overrides,
  }
}

function makeQueryResult(overrides: Partial<AcilQueryResult> = {}): AcilQueryResult {
  return {
    testName:     'test-1',
    agentFile:    'r-and-d:gap-analyzer',
    promptContent: 'test prompt',
    expected:     true,
    actual:       true,
    passed:       true,
    runIndex:     0,
    events:       [],
    ...overrides,
  }
}

const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

beforeEach(() => {
  vi.clearAllMocks()
  stderrSpy.mockClear()

  // Default mocks for the happy path (single iteration, perfect accuracy)
  vi.mocked(resolveAndLoad).mockResolvedValue({
    agentFile: 'r-and-d:gap-analyzer',
    agentMdPath: '/repo/r-and-d/agents/gap-analyzer.md',
    tests: [{ name: 'test-1', type: 'agent-call', promptFile: 'test-1.md', expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }] }],
  })

  vi.mocked(splitSets).mockReturnValue([
    { name: 'test-1', type: 'agent-call', promptFile: 'test-1.md', set: 'train', expect: [{ type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' }] },
  ] as AcilTestCase[])

  vi.mocked(readAgent).mockResolvedValue({
    name: 'gap-analyzer',
    description: 'original description',
    body: 'Agent body content',
  })

  vi.mocked(buildIterationPlugin).mockResolvedValue({
    tempDir: '/tmp/acil-plugin',
  })

  vi.mocked(runEval).mockResolvedValue([makeQueryResult()])
  vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })
  vi.mocked(selectBestIteration).mockImplementation((iterations) => iterations[0] ?? null)
  vi.mocked(improveDescription).mockResolvedValue('improved description')
  vi.mocked(applyDescription).mockResolvedValue(undefined)
  vi.mocked(writeIterationOutput).mockResolvedValue(undefined)
  vi.mocked(writeSummaryOutput).mockResolvedValue(undefined)
  vi.mocked(ensureSandboxExists).mockResolvedValue(undefined)
  vi.mocked(getPhase).mockReturnValue('converge')
})

describe('runAcilLoop', () => {
  it('exits after one iteration when train accuracy is 1.0 and holdout is 0', async () => {
    await runAcilLoop(makeConfig({ maxIterations: 5, holdout: 0 }))

    expect(runEval).toHaveBeenCalledOnce()
    expect(improveDescription).not.toHaveBeenCalled()
    expect(writeIterationOutput).toHaveBeenCalledOnce()
    expect(printIterationProgress).toHaveBeenCalledOnce()
  })

  it('continues iterating when train is perfect but test is not (holdout > 0)', async () => {
    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: 0.5 })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: 0.5 })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: 1.0 })

    await runAcilLoop(makeConfig({ maxIterations: 5, holdout: 0.5 }))

    expect(runEval).toHaveBeenCalledTimes(3)
    expect(improveDescription).toHaveBeenCalledTimes(2)
  })

  it('exits on first iteration when both train and test are perfect (holdout > 0)', async () => {
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: 1.0 })

    await runAcilLoop(makeConfig({ maxIterations: 5, holdout: 0.5 }))

    expect(runEval).toHaveBeenCalledOnce()
    expect(improveDescription).not.toHaveBeenCalled()
  })

  it('keeps current description when improveDescription returns null', async () => {
    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    vi.mocked(improveDescription).mockResolvedValueOnce(null)

    await runAcilLoop(makeConfig({ maxIterations: 5 }))

    // Second call to buildIterationPlugin should use the ORIGINAL description (not improved)
    const secondCall = vi.mocked(buildIterationPlugin).mock.calls[1]
    expect(secondCall[2]).toBe('original description')
    expect(secondCall[4]).toBe(2)
  })

  it('runs multiple iterations and updates description when accuracy is below 1.0', async () => {
    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 5 }))

    expect(runEval).toHaveBeenCalledTimes(2)
    expect(improveDescription).toHaveBeenCalledOnce()

    // Second call to buildIterationPlugin should use the improved description
    const secondCall = vi.mocked(buildIterationPlugin).mock.calls[1]
    expect(secondCall[2]).toBe('improved description')
    expect(secondCall[4]).toBe(2)
  })

  it('throws HarnessError when maxIterations=0 produces no iterations', async () => {
    vi.mocked(selectBestIteration).mockReturnValue(null)

    await expect(runAcilLoop(makeConfig({ maxIterations: 0 }))).rejects.toThrow(/No iterations completed/)
  })

  it('does not call improveDescription on the last iteration', async () => {
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 0.5, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 2 }))

    expect(improveDescription).toHaveBeenCalledOnce() // only iteration 1
    expect(runEval).toHaveBeenCalledTimes(2)
  })

  it('partitions eval results into train and test sets for scoring', async () => {
    vi.mocked(splitSets).mockReturnValue([
      { name: 'train-1', type: 'agent-call', promptFile: 't1.md', set: 'train', expect: [] },
      { name: 'test-1', type: 'agent-call', promptFile: 't2.md', set: 'test', expect: [] },
    ] as AcilTestCase[])

    const trainResult = makeQueryResult({ testName: 'train-1' })
    const testResult = makeQueryResult({ testName: 'test-1' })
    vi.mocked(runEval).mockResolvedValue([trainResult, testResult])

    await runAcilLoop(makeConfig())

    expect(scoreResults).toHaveBeenCalledWith(
      [expect.objectContaining({ testName: 'train-1' })],
      [expect.objectContaining({ testName: 'test-1' })],
    )
  })

  it('applies description automatically when config.apply is true and description changed', async () => {
    vi.mocked(selectBestIteration).mockImplementation(() => ({
      iteration: 2,
      phase: 'explore',
      description: 'improved description',
      trainResults: [makeQueryResult()],
      testResults: [],
      trainAccuracy: 1.0,
      testAccuracy: null,
    }))

    await runAcilLoop(makeConfig({ apply: true }))

    expect(applyDescription).toHaveBeenCalledWith(
      '/repo/r-and-d/agents/gap-analyzer.md',
      'improved description',
    )
    expect(createInterface).not.toHaveBeenCalled()
  })

  it('skips apply when best description is identical to original', async () => {
    await runAcilLoop(makeConfig({ apply: true }))

    expect(applyDescription).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('identical to the original'))
  })

  it('prompts user and applies when answer is y and description changed', async () => {
    vi.mocked(selectBestIteration).mockImplementation(() => ({
      iteration: 2,
      phase: 'explore',
      description: 'improved description',
      trainResults: [makeQueryResult()],
      testResults: [],
      trainAccuracy: 1.0,
      testAccuracy: null,
    }))
    const mockRl = { question: vi.fn().mockResolvedValue('y'), close: vi.fn() }
    vi.mocked(createInterface).mockReturnValue(mockRl as any)

    await runAcilLoop(makeConfig({ apply: false }))

    expect(createInterface).toHaveBeenCalled()
    expect(mockRl.question).toHaveBeenCalled()
    expect(applyDescription).toHaveBeenCalled()
    expect(mockRl.close).toHaveBeenCalled()
  })

  it('does not apply when user answers N', async () => {
    vi.mocked(selectBestIteration).mockImplementation(() => ({
      iteration: 2,
      phase: 'explore',
      description: 'improved description',
      trainResults: [makeQueryResult()],
      testResults: [],
      trainAccuracy: 1.0,
      testAccuracy: null,
    }))
    const mockRl = { question: vi.fn().mockResolvedValue('N'), close: vi.fn() }
    vi.mocked(createInterface).mockReturnValue(mockRl as any)

    await runAcilLoop(makeConfig({ apply: false }))

    expect(applyDescription).not.toHaveBeenCalled()
    expect(mockRl.close).toHaveBeenCalled()
  })

  it('passes correct options to runEval', async () => {
    await runAcilLoop(makeConfig({ concurrency: 4, runsPerQuery: 3 }))

    expect(runEval).toHaveBeenCalledWith(expect.objectContaining({
      tempDir: '/tmp/acil-plugin',
      suite: 'my-suite',
      testsDir: '/mock-tests',
      concurrency: 4,
      runsPerQuery: 3,
      debug: false,
      testRunId: 'run-abc',
      runDir: '/mock-output/run-abc',
    }))
  })

  it('calls steps in correct sequential order', async () => {
    const callOrder: string[] = []
    vi.mocked(resolveAndLoad).mockImplementation(async () => { callOrder.push('resolveAndLoad'); return { agentFile: 'r-and-d:gap-analyzer', agentMdPath: '/agent.md', tests: [] } })
    vi.mocked(splitSets).mockImplementation(() => { callOrder.push('splitSets'); return [] as any })
    vi.mocked(readAgent).mockImplementation(async () => { callOrder.push('readAgent'); return { name: 'agent', description: 'desc', body: '' } })
    vi.mocked(ensureSandboxExists).mockImplementation(async () => { callOrder.push('ensureSandboxExists') })
    vi.mocked(generateRunId).mockImplementation(() => { callOrder.push('generateRunId'); return 'run-abc' })
    vi.mocked(runEval).mockImplementation(async () => { callOrder.push('runEval'); return [] })
    vi.mocked(scoreResults).mockImplementation(() => { callOrder.push('scoreResults'); return { trainAccuracy: 1.0, testAccuracy: null } })
    vi.mocked(writeIterationOutput).mockImplementation(async () => { callOrder.push('writeIterationOutput') })
    vi.mocked(printIterationProgress).mockImplementation(() => { callOrder.push('printIterationProgress') })
    vi.mocked(selectBestIteration).mockImplementation((iters) => { callOrder.push('selectBestIteration'); return iters[0] ?? { iteration: 1, phase: 'explore', description: 'desc', trainResults: [], testResults: [], trainAccuracy: 1.0, testAccuracy: null } })
    vi.mocked(printFinalSummary).mockImplementation(() => { callOrder.push('printFinalSummary') })
    vi.mocked(writeSummaryOutput).mockImplementation(async () => { callOrder.push('writeSummaryOutput') })
    vi.mocked(applyDescription).mockImplementation(async () => { callOrder.push('applyDescription') })

    await runAcilLoop(makeConfig({ maxIterations: 1 }))

    expect(callOrder).toEqual([
      'resolveAndLoad',
      'splitSets',
      'readAgent',
      'ensureSandboxExists',
      'generateRunId',
      // iteration 1
      'runEval',
      'scoreResults',
      'writeIterationOutput',
      'printIterationProgress',
      // post-loop
      'selectBestIteration',
      'printFinalSummary',
      'writeSummaryOutput',
      // applyDescription skipped — best description is identical to original
    ])
  })

  it('passes runId from generateRunId to output functions', async () => {
    vi.mocked(generateRunId).mockReturnValue('run-xyz')

    await runAcilLoop(makeConfig())

    const iterOutputCall = vi.mocked(writeIterationOutput).mock.calls[0]
    expect(iterOutputCall[1]).toBe('run-xyz') // runId arg

    const summaryCall = vi.mocked(writeSummaryOutput).mock.calls[0]
    expect(summaryCall[1]).toBe('run-xyz') // runId arg
  })

  it('passes agentFile, runDir, currentDescription, and repoRoot to buildIterationPlugin', async () => {
    vi.mocked(generateRunId).mockReturnValue('run-123')

    await runAcilLoop(makeConfig())

    expect(buildIterationPlugin).toHaveBeenCalledWith(
      'r-and-d:gap-analyzer',
      '/mock-output/run-123',
      'original description',
      '/mock-repo',
      1,
    )
  })

  // TP-013 (T16): holdout > 0 with testAccuracy null — train is perfect, no improvement needed
  it('skips improvement when holdout > 0 but testAccuracy is null and train is perfect', async () => {
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 5, holdout: 0.5 }))

    expect(runEval).toHaveBeenCalledOnce()
    expect(improveDescription).not.toHaveBeenCalled()
  })

  // Phase behavior: needsImprovement always true in explore/transition
  it('calls improveDescription during explore phase even at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValue('explore')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 2 }))

    expect(improveDescription).toHaveBeenCalledOnce()
  })

  // Phase behavior: early stopping suppressed during explore/transition
  it('does not exit early during explore phase even at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValue('explore')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 3 }))

    expect(runEval).toHaveBeenCalledTimes(3)
  })

  // Phase behavior: early stopping fires during converge
  it('exits early during converge phase at perfect accuracy', async () => {
    vi.mocked(getPhase)
      .mockReturnValueOnce('explore')
      .mockReturnValueOnce('converge')

    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 5 }))

    expect(runEval).toHaveBeenCalledTimes(2)
  })

  // Phase: records phase on AcilIterationResult
  it('records phase from getPhase on each AcilIterationResult', async () => {
    vi.mocked(getPhase)
      .mockReturnValueOnce('explore')
      .mockReturnValueOnce('converge')

    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runAcilLoop(makeConfig({ maxIterations: 2 }))

    const iter1 = vi.mocked(writeIterationOutput).mock.calls[0][2]
    expect(iter1.phase).toBe('explore')

    const iter2 = vi.mocked(writeIterationOutput).mock.calls[1][2]
    expect(iter2.phase).toBe('converge')
  })

  // Phase: passes phase and testResults to improveDescription
  it('passes phase and testResults to improveDescription', async () => {
    vi.mocked(getPhase).mockReturnValue('explore')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 0.5, testAccuracy: null })

    vi.mocked(splitSets).mockReturnValue([
      { name: 'train-1', type: 'agent-call', promptFile: 't1.md', set: 'train', expect: [] },
      { name: 'test-1', type: 'agent-call', promptFile: 't2.md', set: 'test', expect: [] },
    ] as AcilTestCase[])

    const trainResult = makeQueryResult({ testName: 'train-1' })
    const testResult = makeQueryResult({ testName: 'test-1' })
    vi.mocked(runEval).mockResolvedValue([trainResult, testResult])

    await runAcilLoop(makeConfig({ maxIterations: 2 }))

    const improveCall = vi.mocked(improveDescription).mock.calls[0][0]
    expect(improveCall.phase).toBe('explore')
    expect(improveCall.testResults).toEqual([expect.objectContaining({ testName: 'test-1' })])
  })
})
