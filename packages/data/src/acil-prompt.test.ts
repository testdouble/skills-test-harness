import { describe, expect, it } from 'vitest'
import { buildAcilImprovementPrompt } from './acil-prompt.js'
import type { Phase } from './phase.js'
import type { AcilIterationResult, AcilQueryResult } from './types.js'

function makeAcilQueryResult(overrides: Partial<AcilQueryResult> = {}): AcilQueryResult {
  return {
    testName: 'test-query',
    agentFile: 'plugin:agent',
    promptContent: 'do the thing',
    expected: true,
    actual: true,
    passed: true,
    runIndex: 0,
    events: [],
    ...overrides,
  }
}

function makeAcilIterationResult(overrides: Partial<AcilIterationResult> = {}): AcilIterationResult {
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

describe('buildAcilImprovementPrompt', () => {
  it('includes agent name, description, and body in correct sections', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'gap-analyzer',
      currentDescription: 'Analyzes gaps between states',
      agentBody: 'You are an adversarial gap analyst.',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('## Agent Name\ngap-analyzer')
    expect(prompt).toContain('## Current Description\nAnalyzes gaps between states')
    expect(prompt).toContain('## Agent Body (what the agent does)\nYou are an adversarial gap analyst.')
  })

  it('uses agent terminology throughout the prompt', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('writing agent descriptions')
    expect(prompt).toContain('An agent description determines when Claude delegates to the agent')
    expect(prompt).toContain('WHAT the agent does')
    expect(prompt).toContain('WHEN to delegate to it')
  })

  it('formats should-trigger PASS results', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ testName: 'trigger-test', expected: true, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('### Should trigger (expected=true):\n- "trigger-test" (user said: "do the thing") → PASS')
  })

  it('formats should-trigger FAIL results as "agent was NOT delegated to"', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ testName: 'miss-test', expected: true, passed: false })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('FAIL: agent was NOT delegated to')
  })

  it('formats should-NOT-trigger FAIL results as "agent WAS delegated to"', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ testName: 'false-pos', expected: false, passed: false })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('FAIL: agent WAS delegated to')
  })

  it('shows "(none)" for both sections when trainResults is empty', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('### Should trigger (expected=true):\n(none)')
    expect(prompt).toContain('### Should NOT trigger (expected=false):\n(none)')
  })

  it('formats iteration history with rounded accuracy percentage', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [
        makeAcilIterationResult({ iteration: 1, trainAccuracy: 0.666, description: 'first try' }),
        makeAcilIterationResult({ iteration: 2, trainAccuracy: 0.85, description: 'second try' }),
      ],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('Iteration 1: train accuracy 67% — "first try"')
    expect(prompt).toContain('Iteration 2: train accuracy 85% — "second try"')
  })

  // TP-001 (T2/EC2) — empty trainResults must not produce holdout content
  it('does not include holdout content when trainResults is empty', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0.5,
      phase: 'converge',
    })
    expect(prompt).not.toContain('additional user messages')
  })

  // TP-002 (T1) — expected=false PASS result appears in correct section
  it('places should-NOT-trigger PASS results in the correct section', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ testName: 'correct-reject', expected: false, passed: true })],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('### Should NOT trigger (expected=false):\n- "correct-reject"')
    expect(prompt).toContain('→ PASS')
    expect(prompt).toContain('### Should trigger (expected=true):\n(none)')
  })

  // TP-003 (T3) — multiple mixed results in both sections
  it('formats multiple results per section with correct ordering', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [
        makeAcilQueryResult({ testName: 'hit-1', expected: true, passed: true }),
        makeAcilQueryResult({ testName: 'miss-1', expected: true, passed: false }),
        makeAcilQueryResult({ testName: 'reject-1', expected: false, passed: true }),
        makeAcilQueryResult({ testName: 'false-pos', expected: false, passed: false }),
      ],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    const triggerIdx = prompt.indexOf('### Should trigger (expected=true):')
    const notTriggerIdx = prompt.indexOf('### Should NOT trigger (expected=false):')
    const hit1Idx = prompt.indexOf('"hit-1"')
    const miss1Idx = prompt.indexOf('"miss-1"')
    const reject1Idx = prompt.indexOf('"reject-1"')
    const falsePosIdx = prompt.indexOf('"false-pos"')
    expect(hit1Idx).toBeGreaterThan(triggerIdx)
    expect(hit1Idx).toBeLessThan(notTriggerIdx)
    expect(miss1Idx).toBeGreaterThan(triggerIdx)
    expect(miss1Idx).toBeLessThan(notTriggerIdx)
    expect(reject1Idx).toBeGreaterThan(notTriggerIdx)
    expect(falsePosIdx).toBeGreaterThan(notTriggerIdx)
  })

  // TP-004 (T5) — iteration history shows (none) when empty
  it('shows "(none)" for iteration history when iterations is empty', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('## Previous Iterations\n(none)')
  })

  // EC — NaN trainAccuracy coerced to 0%
  it('formats NaN trainAccuracy as 0%', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [makeAcilIterationResult({ iteration: 1, trainAccuracy: NaN })],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('Iteration 1: train accuracy 0%')
    expect(prompt).not.toContain('NaN')
  })

  // TP-007 (T7/EC1) — accuracy rounding at boundaries
  it('formats 0% and 100% accuracy correctly', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [
        makeAcilIterationResult({ iteration: 1, trainAccuracy: 0 }),
        makeAcilIterationResult({ iteration: 2, trainAccuracy: 1.0 }),
      ],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('Iteration 1: train accuracy 0%')
    expect(prompt).toContain('Iteration 2: train accuracy 100%')
  })

  // Phase-specific instruction tests
  it('explore phase produces explore-style instructions with agent vocabulary', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [],
      holdout: 0,
      phase: 'explore',
    })
    expect(prompt).toContain('fundamentally different')
    expect(prompt).toContain('trigger delegation')
  })

  it('transition phase produces transition-style instructions', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [makeAcilIterationResult({ trainAccuracy: 0.8 })],
      holdout: 0,
      phase: 'transition',
    })
    expect(prompt).toContain('higher accuracy')
    expect(prompt).toContain('strongest elements')
  })

  it('converge phase produces converge-style instructions', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      iterations: [makeAcilIterationResult({ trainAccuracy: 0.9 })],
      holdout: 0,
      phase: 'converge',
    })
    expect(prompt).toContain('surgical edits')
    expect(prompt).toContain('90%')
  })

  // Holdout failure inclusion/exclusion
  it('converge phase includes holdout failures when train accuracy is 1.0', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ passed: true })],
      testResults: [makeAcilQueryResult({ passed: false, promptContent: 'analyze this gap' })],
      iterations: [makeAcilIterationResult({ trainAccuracy: 1.0 })],
      holdout: 0.5,
      phase: 'converge',
    })
    expect(prompt).toContain('analyze this gap')
    expect(prompt).toContain('additional user messages your description should handle')
  })

  it('converge phase omits holdout failures when train accuracy < 1.0', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [makeAcilQueryResult({ passed: false })],
      testResults: [makeAcilQueryResult({ passed: false, promptContent: 'analyze this gap' })],
      iterations: [makeAcilIterationResult({ trainAccuracy: 0.8 })],
      holdout: 0.5,
      phase: 'converge',
    })
    expect(prompt).not.toContain('analyze this gap')
  })

  it('explore phase ignores holdout failures', () => {
    const prompt = buildAcilImprovementPrompt({
      agentName: 'agent',
      currentDescription: 'desc',
      agentBody: 'body',
      trainResults: [],
      testResults: [makeAcilQueryResult({ passed: false, promptContent: 'analyze this gap' })],
      iterations: [makeAcilIterationResult({ trainAccuracy: 1.0 })],
      holdout: 0.5,
      phase: 'explore',
    })
    expect(prompt).not.toContain('analyze this gap')
  })
})
