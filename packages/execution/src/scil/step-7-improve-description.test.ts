import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@testdouble/harness-data', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    parseStreamJsonLines: vi.fn().mockReturnValue([]),
    getResultText: vi.fn().mockReturnValue('improved description'),
  }
})
vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}))

import { parseStreamJsonLines, getResultText } from '@testdouble/harness-data'
import { runClaude } from '@testdouble/claude-integration'
import { buildImprovementPrompt, improveDescription } from './step-7-improve-description.js'

import type { ImproveDescriptionOptions } from './step-7-improve-description.js'
import type { QueryResult, IterationResult } from './types.js'
import type { Phase } from '@testdouble/harness-data'

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    testName: 'test-query',
    skillFile: 'plugin:skill',
    promptContent: 'do the thing',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    events: [],
    ...overrides,
  }
}

function makeIterationResult(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    iteration: 1,
    phase: 'explore' as Phase,
    description: 'a test description',
    trainResults: [],
    testResults: [],
    trainAccuracy: 0.85,
    testAccuracy: null,
    ...overrides,
  }
}

function makeOpts(overrides: Partial<ImproveDescriptionOptions> = {}): ImproveDescriptionOptions {
  return {
    skillName: 'my-skill',
    currentDescription: 'current desc',
    skillBody: 'skill body content',
    trainResults: [],
    iterations: [],
    holdout: 0,
    phase: 'explore',
    model: 'opus',
    debug: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(parseStreamJsonLines).mockReturnValue([])
  vi.mocked(getResultText).mockReturnValue('improved description')
  vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
})

describe('buildImprovementPrompt', () => {
  it('includes skill name, description, and body in correct sections', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'code-review',
      currentDescription: 'Reviews code for quality',
      skillBody: 'Analyze the code and provide feedback',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('## Skill Name\ncode-review')
    expect(prompt).toContain('## Current Description\nReviews code for quality')
    expect(prompt).toContain('## Skill Body (what the skill does)\nAnalyze the code and provide feedback')
  })

  it('formats should-trigger PASS results', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ testName: 'trigger-test', expected: true, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should trigger (expected=true):\n- "trigger-test" (user said: "do the thing") → PASS')
  })

  it('formats should-trigger FAIL results as "skill was NOT invoked"', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ testName: 'miss-test', expected: true, passed: false })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('- "miss-test" (user said: "do the thing") → FAIL: skill was NOT invoked')
  })

  it('formats should-NOT-trigger FAIL results as "skill WAS invoked"', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ testName: 'false-pos', expected: false, passed: false })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should NOT trigger (expected=false):\n- "false-pos" (user said: "do the thing") → FAIL: skill WAS invoked')
  })

  it('formats should-NOT-trigger PASS results', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ testName: 'correct-skip', expected: false, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should NOT trigger (expected=false):\n- "correct-skip" (user said: "do the thing") → PASS')
  })

  it('shows "(none)" for both sections when trainResults is empty', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should trigger (expected=true):\n(none)')
    expect(prompt).toContain('### Should NOT trigger (expected=false):\n(none)')
  })

  it('shows "(none)" for should-NOT-trigger when all results are expected=true', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ expected: true, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should NOT trigger (expected=false):\n(none)')
  })

  it('shows "(none)" for should-trigger when all results are expected=false', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ expected: false, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('### Should trigger (expected=true):\n(none)')
  })

  it('shows "(none)" for empty iterations', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('## Previous Iterations\n(none)')
  })

  it('formats iteration history with rounded accuracy percentage', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [
        makeIterationResult({ iteration: 1, trainAccuracy: 0.666, description: 'first try' }),
        makeIterationResult({ iteration: 2, trainAccuracy: 0.85, description: 'second try' }),
      ],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('Iteration 1: train accuracy 67% — "first try"')
    expect(prompt).toContain('Iteration 2: train accuracy 85% — "second try"')
  })

  it('formats iteration history with holdout > 0', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ iteration: 1, trainAccuracy: 0.75, description: 'holdout desc' })],
      holdout: 0.3,
      phase: 'explore',
    })

    expect(prompt).toContain('Iteration 1: train accuracy 75% — "holdout desc"')
  })

  it('formats iteration history with holdout = 0', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ iteration: 1, trainAccuracy: 0.9, description: 'no holdout' })],
      holdout: 0,
      phase: 'explore',
    })

    expect(prompt).toContain('Iteration 1: train accuracy 90% — "no holdout"')
  })

  it('includes phase-specific instructions in the prompt', () => {
    const explorePrompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(explorePrompt).toContain('fundamentally different')

    const convergePrompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ trainAccuracy: 0.9 })],
      holdout: 0,
      phase: 'converge',
    })
    expect(convergePrompt).toContain('surgical edits')
  })

  it('includes holdout failure texts in converge phase when train accuracy is 1.0', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ passed: true })],
      testResults: [makeQueryResult({ passed: false, promptContent: 'review my code' })],
      iterations: [makeIterationResult({ trainAccuracy: 1.0 })],
      holdout: 0.5,
      phase: 'converge',
    })
    expect(prompt).toContain('review my code')
  })
})

describe('improveDescription', () => {
  it('returns trimmed result text from sandbox output', async () => {
    vi.mocked(getResultText).mockReturnValue('  improved description  ')
    const result = await improveDescription(makeOpts())
    expect(result).toBe('improved description')
  })

  it('returns null when getResultText returns null', async () => {
    vi.mocked(getResultText).mockReturnValue(null)
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when getResultText returns empty string', async () => {
    vi.mocked(getResultText).mockReturnValue('')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when sandbox returns empty stdout (no events)', async () => {
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    vi.mocked(getResultText).mockReturnValue(null)
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('truncates result to 1024 characters when exceeding limit', async () => {
    const longText = 'x'.repeat(1500)
    vi.mocked(getResultText).mockReturnValue(longText)
    const result = await improveDescription(makeOpts())
    expect(result).toHaveLength(1024)
    expect(result).toBe('x'.repeat(1024))
  })

  it('returns full text when exactly at 1024 characters', async () => {
    const exactText = 'y'.repeat(1024)
    vi.mocked(getResultText).mockReturnValue(exactText)
    const result = await improveDescription(makeOpts())
    expect(result).toHaveLength(1024)
    expect(result).toBe(exactText)
  })

  it('includes model in runClaude options', async () => {
    await improveDescription(makeOpts({ model: 'sonnet' }))
    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.model).toBe('sonnet')
  })

  it('forwards debug flag to runClaude', async () => {
    await improveDescription(makeOpts({ debug: true }))
    const opts = vi.mocked(runClaude).mock.calls[0][0]
    expect(opts.debug).toBe(true)
  })

  it('returns null for whitespace-only result text', async () => {
    vi.mocked(getResultText).mockReturnValue('   \n\t  ')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when result looks like an API error', async () => {
    vi.mocked(getResultText).mockReturnValue('Credit balance is too low')
    const result = await improveDescription(makeOpts())
    expect(result).toBeNull()
  })

  it('returns null when result is too short to be a valid description', async () => {
    vi.mocked(getResultText).mockReturnValue('Error occurred')
    const result = await improveDescription(makeOpts())
    expect(result).toBeNull()
  })

  it('returns null for rate limit errors', async () => {
    vi.mocked(getResultText).mockReturnValue('Rate limit exceeded, please try again later')
    const result = await improveDescription(makeOpts())
    expect(result).toBeNull()
  })

  it('returns null for internal server errors', async () => {
    vi.mocked(getResultText).mockReturnValue('Internal server error: something went wrong')
    const result = await improveDescription(makeOpts())
    expect(result).toBeNull()
  })

  it('accepts a valid description that mentions errors in context', async () => {
    const desc = 'Review code for error handling patterns, security vulnerabilities, and performance issues in the current codebase.'
    vi.mocked(getResultText).mockReturnValue(desc)
    const result = await improveDescription(makeOpts())
    expect(result).toBe(desc)
  })

  it('passes phase and testResults to buildImprovementPrompt', async () => {
    const testResults = [makeQueryResult({ passed: false, promptContent: 'check this' })]
    await improveDescription(makeOpts({
      phase: 'converge',
      testResults,
      iterations: [makeIterationResult({ trainAccuracy: 1.0 })],
    }))
    const promptArg = vi.mocked(runClaude).mock.calls[0][0].prompt
    expect(promptArg).toContain('surgical edits')
  })
})
