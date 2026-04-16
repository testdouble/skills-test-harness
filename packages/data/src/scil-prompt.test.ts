import { describe, it, expect } from 'vitest'
import type { QueryResult, IterationResult } from './types.js'
import type { Phase } from './phase.js'
import { buildImprovementPrompt } from './scil-prompt.js'

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
    expect(prompt).toContain('FAIL: skill was NOT invoked')
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
    expect(prompt).toContain('FAIL: skill WAS invoked')
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

  // EC — NaN trainAccuracy coerced to 0%
  it('formats NaN trainAccuracy as 0%', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ iteration: 1, trainAccuracy: NaN })],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('Iteration 1: train accuracy 0%')
    expect(prompt).not.toContain('NaN')
  })

  // Phase-specific instruction tests
  it('explore phase produces explore-style instructions', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('fundamentally different')
    expect(prompt).toContain('Start fresh')
  })

  it('transition phase produces transition-style instructions', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ trainAccuracy: 0.8 })],
      holdout: 0,
      phase: 'transition',
    })
    expect(prompt).toContain('higher accuracy')
    expect(prompt).toContain('strongest elements')
  })

  it('converge phase produces converge-style instructions', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      iterations: [makeIterationResult({ trainAccuracy: 0.9 })],
      holdout: 0,
      phase: 'converge',
    })
    expect(prompt).toContain('surgical edits')
    expect(prompt).toContain('90%')
  })

  // Holdout failure inclusion/exclusion
  it('converge phase includes holdout failures when train accuracy is 1.0', () => {
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
    expect(prompt).toContain('additional user messages your description should handle')
  })

  it('converge phase omits holdout failures when train accuracy < 1.0', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [makeQueryResult({ passed: false })],
      testResults: [makeQueryResult({ passed: false, promptContent: 'review my code' })],
      iterations: [makeIterationResult({ trainAccuracy: 0.8 })],
      holdout: 0.5,
      phase: 'converge',
    })
    expect(prompt).not.toContain('review my code')
  })

  it('explore phase ignores holdout failures', () => {
    const prompt = buildImprovementPrompt({
      skillName: 'skill',
      currentDescription: 'desc',
      skillBody: 'body',
      trainResults: [],
      testResults: [makeQueryResult({ passed: false, promptContent: 'review my code' })],
      iterations: [makeIterationResult({ trainAccuracy: 1.0 })],
      holdout: 0.5,
      phase: 'explore',
    })
    expect(prompt).not.toContain('review my code')
  })
})
