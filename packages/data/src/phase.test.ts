import { describe, it, expect } from 'vitest'
import { getPhase, getPhaseInstructions } from './phase.js'
import type { Phase, EntityType } from './phase.js'

describe('getPhase', () => {
  // Parameterized tests covering the full allocation table from the PRD
  const allocationTable: { max: number; explore: number; transition: number; converge: number }[] = [
    { max: 1,  explore: 1, transition: 0, converge: 0 },
    { max: 2,  explore: 1, transition: 0, converge: 1 },
    { max: 3,  explore: 2, transition: 0, converge: 1 },
    { max: 4,  explore: 2, transition: 0, converge: 2 },
    { max: 5,  explore: 3, transition: 0, converge: 2 },
    { max: 6,  explore: 2, transition: 2, converge: 2 },
    { max: 7,  explore: 3, transition: 2, converge: 2 },
    { max: 8,  explore: 3, transition: 3, converge: 2 },
    { max: 9,  explore: 3, transition: 3, converge: 3 },
    { max: 10, explore: 4, transition: 3, converge: 3 },
    { max: 11, explore: 4, transition: 4, converge: 3 },
    { max: 12, explore: 4, transition: 4, converge: 4 },
  ]

  describe.each(allocationTable)('maxIterations=$max', ({ max, explore, transition, converge }) => {
    it(`allocates ${explore} explore, ${transition} transition, ${converge} converge`, () => {
      const phases: Phase[] = []
      for (let i = 1; i <= max; i++) {
        phases.push(getPhase(i, max))
      }

      const exploreCount = phases.filter(p => p === 'explore').length
      const transitionCount = phases.filter(p => p === 'transition').length
      const convergeCount = phases.filter(p => p === 'converge').length

      expect(exploreCount).toBe(explore)
      expect(transitionCount).toBe(transition)
      expect(convergeCount).toBe(converge)
    })

    it('returns phases in order: explore then transition then converge', () => {
      const phases: Phase[] = []
      for (let i = 1; i <= max; i++) {
        phases.push(getPhase(i, max))
      }

      // Verify ordering: all explore before transition, all transition before converge
      const lastExplore = phases.lastIndexOf('explore')
      const firstTransition = phases.indexOf('transition')
      const lastTransition = phases.lastIndexOf('transition')
      const firstConverge = phases.indexOf('converge')

      if (firstTransition !== -1) {
        expect(lastExplore).toBeLessThan(firstTransition)
      }
      if (firstConverge !== -1 && lastTransition !== -1) {
        expect(lastTransition).toBeLessThan(firstConverge)
      }
      if (firstConverge !== -1 && firstTransition === -1) {
        expect(lastExplore).toBeLessThan(firstConverge)
      }
    })
  })

  // Edge case: single iteration
  it('returns explore for getPhase(1, 1)', () => {
    expect(getPhase(1, 1)).toBe('explore')
  })

  // Edge case: large maxIterations values
  it('handles maxIterations=20 without error', () => {
    for (let i = 1; i <= 20; i++) {
      expect(() => getPhase(i, 20)).not.toThrow()
    }
    // Verify counts: 20/3 = 6 base, remainder 2 → explore=7, transition=7, converge=6
    const phases: Phase[] = []
    for (let i = 1; i <= 20; i++) {
      phases.push(getPhase(i, 20))
    }
    expect(phases.filter(p => p === 'explore').length).toBe(7)
    expect(phases.filter(p => p === 'transition').length).toBe(7)
    expect(phases.filter(p => p === 'converge').length).toBe(6)
  })

  it('handles maxIterations=100 without error', () => {
    for (let i = 1; i <= 100; i++) {
      expect(() => getPhase(i, 100)).not.toThrow()
    }
    // Verify counts: 100/3 = 33 base, remainder 1 → explore=34, transition=33, converge=33
    const phases: Phase[] = []
    for (let i = 1; i <= 100; i++) {
      phases.push(getPhase(i, 100))
    }
    expect(phases.filter(p => p === 'explore').length).toBe(34)
    expect(phases.filter(p => p === 'transition').length).toBe(33)
    expect(phases.filter(p => p === 'converge').length).toBe(33)
  })
})

describe('getPhaseInstructions', () => {
  const makeIterations = (accuracies: number[]) =>
    accuracies.map(a => ({ trainAccuracy: a, testAccuracy: null }))

  // Phase × EntityType matrix (6 combinations)
  describe.each<{ phase: Phase; entityType: EntityType }>([
    { phase: 'explore', entityType: 'skill' },
    { phase: 'explore', entityType: 'agent' },
    { phase: 'transition', entityType: 'skill' },
    { phase: 'transition', entityType: 'agent' },
    { phase: 'converge', entityType: 'skill' },
    { phase: 'converge', entityType: 'agent' },
  ])('$phase phase with $entityType entity', ({ phase, entityType }) => {
    it('includes structural constraints', () => {
      const result = getPhaseInstructions(phase, entityType, makeIterations([0.8]))
      expect(result).toContain('boundary statements')
      expect(result).toContain('3-5 sentences')
      expect(result).toContain('1024 characters')
      expect(result).toContain('Generalize')
    })

    it('uses correct entity vocabulary', () => {
      const result = getPhaseInstructions(phase, entityType, makeIterations([0.8]))
      if (entityType === 'skill') {
        expect(result).toContain('WHAT the skill does')
        expect(result).toContain('WHEN to use it')
      } else {
        expect(result).toContain('WHAT the agent does')
        expect(result).toContain('WHEN to delegate to it')
      }
    })
  })

  // Explore phase behavior
  it('explore instructs to write a fundamentally different description', () => {
    const result = getPhaseInstructions('explore', 'skill', makeIterations([0.8]))
    expect(result).toContain('fundamentally different')
    expect(result).toContain('Start fresh')
    expect(result).toContain('Do NOT make incremental edits')
  })

  // Transition phase behavior
  it('transition instructs to combine best elements', () => {
    const result = getPhaseInstructions('transition', 'skill', makeIterations([0.8]))
    expect(result).toContain('higher accuracy')
    expect(result).toContain('strongest elements')
    expect(result).toContain('experimenting')
  })

  // Converge phase behavior
  it('converge instructs to make surgical edits', () => {
    const result = getPhaseInstructions('converge', 'skill', makeIterations([0.8]))
    expect(result).toContain('surgical edits')
    expect(result).toContain('80%')
  })

  it('converge derives best train accuracy from iterations', () => {
    const result = getPhaseInstructions('converge', 'skill', makeIterations([0.6, 0.9, 0.75]))
    expect(result).toContain('90%')
  })

  // Converge with holdout failures: includes failing query texts when train accuracy is 1.0
  it('converge includes holdout failures when train accuracy is 1.0 and holdoutFailures is non-empty', () => {
    const result = getPhaseInstructions(
      'converge', 'skill',
      makeIterations([1.0]),
      ['review my code', 'check this PR'],
    )
    expect(result).toContain('review my code')
    expect(result).toContain('check this PR')
    expect(result).toContain('additional user messages your description should handle')
  })

  // Converge without holdout failures: omits when train accuracy < 1.0
  it('converge omits holdout failures when train accuracy < 1.0', () => {
    const result = getPhaseInstructions(
      'converge', 'skill',
      makeIterations([0.9]),
      ['review my code'],
    )
    expect(result).not.toContain('review my code')
    expect(result).not.toContain('additional user messages')
  })

  // Converge without holdout failures: omits when holdoutFailures is empty
  it('converge omits holdout failures when holdoutFailures is empty', () => {
    const result = getPhaseInstructions(
      'converge', 'skill',
      makeIterations([1.0]),
      [],
    )
    expect(result).not.toContain('additional user messages')
  })

  // Converge without holdout failures: omits when holdoutFailures is undefined
  it('converge omits holdout failures when holdoutFailures is undefined', () => {
    const result = getPhaseInstructions(
      'converge', 'skill',
      makeIterations([1.0]),
    )
    expect(result).not.toContain('additional user messages')
  })

  // Explore and transition ignore holdoutFailures
  it('explore ignores holdoutFailures', () => {
    const result = getPhaseInstructions(
      'explore', 'skill',
      makeIterations([1.0]),
      ['review my code'],
    )
    expect(result).not.toContain('review my code')
    expect(result).not.toContain('additional user messages')
  })

  it('transition ignores holdoutFailures', () => {
    const result = getPhaseInstructions(
      'transition', 'agent',
      makeIterations([1.0]),
      ['review my code'],
    )
    expect(result).not.toContain('review my code')
    expect(result).not.toContain('additional user messages')
  })
})
