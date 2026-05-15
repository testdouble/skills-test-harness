import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./step-1-resolve-and-load.js', () => ({
  resolveAndLoad: vi.fn(),
}))
vi.mock('./step-2-split-sets.js', () => ({
  splitSets: vi.fn(),
}))
vi.mock('./step-3-read-skill.js', () => ({
  readSkill: vi.fn(),
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
vi.mock('@testdouble/sandbox-integration', () => ({
  ensureSandboxExists: vi.fn(),
}))
vi.mock('@testdouble/harness-data', () => ({
  getPhase: vi.fn().mockReturnValue('explore'),
}))
vi.mock('../test-runners/steps/step-4-generate-run-id.js', () => ({
  generateRunId: vi.fn().mockReturnValue('run-abc'),
}))
vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(),
}))

import { createInterface } from 'node:readline/promises'
import { ensureSandboxExists } from '@testdouble/sandbox-integration'
import { getPhase } from '@testdouble/harness-data'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
import { runScilLoop } from './loop.js'
import { resolveAndLoad } from './step-1-resolve-and-load.js'
import { splitSets } from './step-2-split-sets.js'
import { readSkill } from './step-3-read-skill.js'
import { buildIterationPlugin } from './step-4-build-temp-plugin.js'
import { runEval } from './step-5-run-eval.js'
import { scoreResults, selectBestIteration } from './step-6-score.js'
import { improveDescription } from './step-7-improve-description.js'
import { applyDescription } from './step-8-apply-description.js'
import { writeIterationOutput, writeSummaryOutput } from './step-9-write-output.js'
import { printFinalSummary, printIterationProgress } from './step-10-print-report.js'
import type { QueryResult, ScilConfig, ScilTestCase } from './types.js'

function makeConfig(overrides: Partial<ScilConfig> = {}): ScilConfig {
  return {
    suite: 'my-suite',
    skill: 'plugin:skill',
    maxIterations: 5,
    holdout: 0,
    concurrency: 1,
    runsPerQuery: 1,
    model: 'opus',
    debug: false,
    apply: true,
    outputDir: '/mock-output',
    testsDir: '/mock-tests',
    repoRoot: '/mock-repo',
    ...overrides,
  }
}

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    testName: 'test-1',
    skillFile: 'plugin:skill',
    promptContent: 'test prompt',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    events: [],
    ...overrides,
  }
}

const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

beforeEach(() => {
  vi.clearAllMocks()
  stderrSpy.mockClear()

  // Default mocks for the happy path (single iteration, perfect accuracy)
  vi.mocked(resolveAndLoad).mockResolvedValue({
    skillFile: 'plugin:skill',
    skillMdPath: '/repo/plugin/skills/skill/SKILL.md',
    tests: [
      {
        name: 'test-1',
        type: 'skill-call',
        promptFile: 'test-1.md',
        expect: [{ type: 'skill-call', value: true, skillFile: 'plugin:skill' }],
      },
    ],
  })

  vi.mocked(splitSets).mockReturnValue([
    {
      name: 'test-1',
      type: 'skill-call',
      promptFile: 'test-1.md',
      set: 'train',
      expect: [{ type: 'skill-call', value: true, skillFile: 'plugin:skill' }],
    },
  ] as ScilTestCase[])

  vi.mocked(readSkill).mockResolvedValue({
    name: 'skill',
    description: 'original description',
    frontmatterRaw: 'name: skill\ndescription: "original description"',
    body: 'Skill body content',
    fullContent: '---\nname: skill\ndescription: "original description"\n---\nSkill body content',
  })

  vi.mocked(buildIterationPlugin).mockResolvedValue({
    tempDir: '/tmp/scil-plugin',
  })

  vi.mocked(runEval).mockResolvedValue([makeQueryResult()])
  vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })
  vi.mocked(selectBestIteration).mockImplementation((iterations) => iterations[0] ?? null)
  vi.mocked(improveDescription).mockResolvedValue('improved description')
  vi.mocked(applyDescription).mockResolvedValue(undefined)
  vi.mocked(writeIterationOutput).mockResolvedValue(undefined)
  vi.mocked(writeSummaryOutput).mockResolvedValue(undefined)
  vi.mocked(ensureSandboxExists).mockResolvedValue(undefined)
  // Default: single converge phase so early exit works immediately
  vi.mocked(getPhase).mockReturnValue('converge')
})

describe('runScilLoop', () => {
  // TP-003: early exit on perfect train accuracy (holdout=0)
  it('exits after one iteration when train accuracy is 1.0 and holdout is 0', async () => {
    await runScilLoop(makeConfig({ maxIterations: 5, holdout: 0 }))

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

    await runScilLoop(makeConfig({ maxIterations: 5, holdout: 0.5 }))

    expect(runEval).toHaveBeenCalledTimes(3)
    expect(improveDescription).toHaveBeenCalledTimes(2)
  })

  it('exits on first iteration when both train and test are perfect (holdout > 0)', async () => {
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: 1.0 })

    await runScilLoop(makeConfig({ maxIterations: 5, holdout: 0.5 }))

    expect(runEval).toHaveBeenCalledOnce()
    expect(improveDescription).not.toHaveBeenCalled()
  })

  it('keeps current description when improveDescription returns null', async () => {
    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    vi.mocked(improveDescription).mockResolvedValueOnce(null)

    await runScilLoop(makeConfig({ maxIterations: 5 }))

    // Second call to buildIterationPlugin should use the ORIGINAL description (not improved)
    const secondCall = vi.mocked(buildIterationPlugin).mock.calls[1]
    expect(secondCall[2]).toBe('original description')
    expect(secondCall[4]).toBe(2)
  })

  // TP-004: multiple iterations with description update
  it('runs multiple iterations and updates description when accuracy is below 1.0', async () => {
    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 5 }))

    expect(runEval).toHaveBeenCalledTimes(2)
    expect(improveDescription).toHaveBeenCalledOnce()

    // Second call to buildIterationPlugin should use the improved description
    const secondCall = vi.mocked(buildIterationPlugin).mock.calls[1]
    expect(secondCall[2]).toBe('improved description')
    expect(secondCall[4]).toBe(2)
  })

  // TP-001: maxIterations=0 results in no iterations
  it('handles maxIterations=0 without crashing', async () => {
    vi.mocked(selectBestIteration).mockReturnValue(null)

    await expect(runScilLoop(makeConfig({ maxIterations: 0 }))).rejects.toThrow()
  })

  // TP-002: negative maxIterations same as zero
  it('handles negative maxIterations without crashing', async () => {
    vi.mocked(selectBestIteration).mockReturnValue(null)

    await expect(runScilLoop(makeConfig({ maxIterations: -1 }))).rejects.toThrow()
  })

  // TP-006: skips improvement on last iteration
  it('does not call improveDescription on the last iteration', async () => {
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 0.5, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 2 }))

    expect(improveDescription).toHaveBeenCalledOnce() // only iteration 1
    expect(runEval).toHaveBeenCalledTimes(2)

    // printIterationProgress on iteration 2 should receive null for newDescription
    const secondProgressCall = vi.mocked(printIterationProgress).mock.calls[1]
    expect(secondProgressCall[2]).toBeNull() // newDescription arg
  })

  // TP-007: splits eval results into train/test sets
  it('partitions eval results into train and test sets for scoring', async () => {
    vi.mocked(splitSets).mockReturnValue([
      { name: 'train-1', type: 'skill-call', promptFile: 't1.md', set: 'train', expect: [] },
      { name: 'test-1', type: 'skill-call', promptFile: 't2.md', set: 'test', expect: [] },
    ] as ScilTestCase[])

    const trainResult = makeQueryResult({ testName: 'train-1' })
    const testResult = makeQueryResult({ testName: 'test-1' })
    vi.mocked(runEval).mockResolvedValue([trainResult, testResult])

    await runScilLoop(makeConfig())

    expect(scoreResults).toHaveBeenCalledWith(
      [expect.objectContaining({ testName: 'train-1' })],
      [expect.objectContaining({ testName: 'test-1' })],
    )
  })

  // TP-008: auto-applies when config.apply is true and description changed
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

    await runScilLoop(makeConfig({ apply: true }))

    expect(applyDescription).toHaveBeenCalledWith('/repo/plugin/skills/skill/SKILL.md', 'improved description')
    expect(createInterface).not.toHaveBeenCalled()
  })

  it('skips apply when best description is identical to original', async () => {
    await runScilLoop(makeConfig({ apply: true }))

    expect(applyDescription).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('identical to the original'))
  })

  // TP-009: prompts and applies on 'y'
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

    await runScilLoop(makeConfig({ apply: false }))

    expect(createInterface).toHaveBeenCalled()
    expect(mockRl.question).toHaveBeenCalled()
    expect(applyDescription).toHaveBeenCalled()
    expect(mockRl.close).toHaveBeenCalled()
  })

  // TP-010: does not apply on 'N'
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

    await runScilLoop(makeConfig({ apply: false }))

    expect(applyDescription).not.toHaveBeenCalled()
    expect(mockRl.close).toHaveBeenCalled()
  })

  // TP-011: runsPerQuery=0 produces empty results, loop still runs
  it('handles empty eval results from runsPerQuery=0', async () => {
    vi.mocked(runEval).mockResolvedValue([])
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 2, runsPerQuery: 0 }))

    expect(runEval).toHaveBeenCalledTimes(2)
    expect(improveDescription).toHaveBeenCalledOnce() // called on iteration 1 only (iteration 2 is last)
  })

  // TP-016: passes correct arguments to runEval
  it('passes correct options to runEval', async () => {
    await runScilLoop(makeConfig({ concurrency: 4, runsPerQuery: 3 }))

    expect(runEval).toHaveBeenCalledWith(
      expect.objectContaining({
        tempDir: '/tmp/scil-plugin',
        suite: 'my-suite',
        testsDir: '/mock-tests',
        concurrency: 4,
        runsPerQuery: 3,
        debug: false,
        testRunId: 'run-abc',
        runDir: '/mock-output/run-abc',
      }),
    )
  })

  // TP-017: steps called in correct order
  it('calls steps in correct sequential order', async () => {
    const callOrder: string[] = []
    vi.mocked(resolveAndLoad).mockImplementation(async () => {
      callOrder.push('resolveAndLoad')
      return { skillFile: 'plugin:skill', skillMdPath: '/skill/SKILL.md', tests: [] }
    })
    vi.mocked(splitSets).mockImplementation(() => {
      callOrder.push('splitSets')
      return [] as any
    })
    vi.mocked(readSkill).mockImplementation(async () => {
      callOrder.push('readSkill')
      return { name: 'skill', description: 'desc', frontmatterRaw: '', body: '', fullContent: '' }
    })
    vi.mocked(ensureSandboxExists).mockImplementation(async () => {
      callOrder.push('ensureSandboxExists')
    })
    vi.mocked(generateRunId).mockImplementation(() => {
      callOrder.push('generateRunId')
      return 'run-abc'
    })
    vi.mocked(runEval).mockImplementation(async () => {
      callOrder.push('runEval')
      return []
    })
    vi.mocked(scoreResults).mockImplementation(() => {
      callOrder.push('scoreResults')
      return { trainAccuracy: 1.0, testAccuracy: null }
    })
    vi.mocked(writeIterationOutput).mockImplementation(async () => {
      callOrder.push('writeIterationOutput')
    })
    vi.mocked(printIterationProgress).mockImplementation(() => {
      callOrder.push('printIterationProgress')
    })
    vi.mocked(selectBestIteration).mockImplementation((iters) => {
      callOrder.push('selectBestIteration')
      return (
        iters[0] ?? {
          iteration: 1,
          phase: 'explore',
          description: 'desc',
          trainResults: [],
          testResults: [],
          trainAccuracy: 1.0,
          testAccuracy: null,
        }
      )
    })
    vi.mocked(printFinalSummary).mockImplementation(() => {
      callOrder.push('printFinalSummary')
    })
    vi.mocked(writeSummaryOutput).mockImplementation(async () => {
      callOrder.push('writeSummaryOutput')
    })
    vi.mocked(applyDescription).mockImplementation(async () => {
      callOrder.push('applyDescription')
    })

    await runScilLoop(makeConfig({ maxIterations: 1 }))

    expect(callOrder).toEqual([
      'resolveAndLoad',
      'splitSets',
      'readSkill',
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

  // TP-018: runId passed to output functions
  it('passes runId from generateRunId to output functions', async () => {
    vi.mocked(generateRunId).mockReturnValue('run-xyz')

    await runScilLoop(makeConfig())

    const iterOutputCall = vi.mocked(writeIterationOutput).mock.calls[0]
    expect(iterOutputCall[1]).toBe('run-xyz') // runId arg

    const summaryCall = vi.mocked(writeSummaryOutput).mock.calls[0]
    expect(summaryCall[1]).toBe('run-xyz') // runId arg
  })

  // TP-021: passes correct args to buildIterationPlugin
  it('passes skillFile, runDir, currentDescription, and repoRoot to buildIterationPlugin', async () => {
    vi.mocked(generateRunId).mockReturnValue('run-123')

    await runScilLoop(makeConfig())

    expect(buildIterationPlugin).toHaveBeenCalledWith(
      'plugin:skill',
      '/mock-output/run-123',
      'original description',
      '/mock-repo',
      1,
    )
  })

  // Phase behavior: needsImprovement always true in explore/transition
  it('calls improveDescription during explore phase even at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValue('explore')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 2 }))

    // Iteration 1 is explore with perfect accuracy — should still call improveDescription
    expect(improveDescription).toHaveBeenCalledOnce()
  })

  it('calls improveDescription during transition phase even at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValue('transition')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 2 }))

    expect(improveDescription).toHaveBeenCalledOnce()
  })

  // Phase behavior: early stopping suppressed during explore/transition
  it('does not exit early during explore phase even at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValue('explore')
    vi.mocked(scoreResults).mockReturnValue({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 3 }))

    // All 3 iterations should run — early exit suppressed because no converge phase reached
    expect(runEval).toHaveBeenCalledTimes(3)
  })

  // Phase behavior: early stopping fires during converge
  it('exits early during converge phase at perfect accuracy', async () => {
    vi.mocked(getPhase).mockReturnValueOnce('explore').mockReturnValueOnce('converge')

    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 5 }))

    // Should exit after iteration 2 (converge with perfect accuracy)
    expect(runEval).toHaveBeenCalledTimes(2)
  })

  // Phase: records phase on IterationResult
  it('records phase from getPhase on each IterationResult', async () => {
    vi.mocked(getPhase).mockReturnValueOnce('explore').mockReturnValueOnce('converge')

    vi.mocked(scoreResults)
      .mockReturnValueOnce({ trainAccuracy: 0.5, testAccuracy: null })
      .mockReturnValueOnce({ trainAccuracy: 1.0, testAccuracy: null })

    await runScilLoop(makeConfig({ maxIterations: 2 }))

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
      { name: 'train-1', type: 'skill-call', promptFile: 't1.md', set: 'train', expect: [] },
      { name: 'test-1', type: 'skill-call', promptFile: 't2.md', set: 'test', expect: [] },
    ] as ScilTestCase[])

    const trainResult = makeQueryResult({ testName: 'train-1' })
    const testResult = makeQueryResult({ testName: 'test-1' })
    vi.mocked(runEval).mockResolvedValue([trainResult, testResult])

    await runScilLoop(makeConfig({ maxIterations: 2 }))

    const improveCall = vi.mocked(improveDescription).mock.calls[0][0]
    expect(improveCall.phase).toBe('explore')
    expect(improveCall.testResults).toEqual([expect.objectContaining({ testName: 'test-1' })])
  })
})
