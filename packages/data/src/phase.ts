export type Phase = 'explore' | 'transition' | 'converge'

export type EntityType = 'skill' | 'agent'

interface IterationSummary {
  trainAccuracy: number
  testAccuracy: number | null
}

export function getPhaseInstructions(
  phase: Phase,
  entityType: EntityType,
  iterations: IterationSummary[],
  holdoutFailures?: string[],
): string {
  const what =
    entityType === 'skill' ? 'WHAT the skill does / WHEN to use it' : 'WHAT the agent does / WHEN to delegate to it'

  const trigger = entityType === 'skill' ? 'trigger the skill' : 'trigger delegation'

  const structural = `Describe ${what}. Include boundary statements. Keep to 3-5 sentences, under 1024 characters. Generalize rather than listing specific cases.`

  switch (phase) {
    case 'explore': {
      return `Write a fundamentally different description from all previous iterations. Start fresh, restructure sentences, reframe the domain, use different vocabulary to ${trigger}. Do NOT make incremental edits — rewrite from scratch.\n\n${structural}`
    }
    case 'transition': {
      return `Identify patterns that correlated with higher accuracy across previous iterations. Combine the strongest elements from the best-performing iterations while still experimenting with boundary statements and trigger phrasing to ${trigger}.\n\n${structural}`
    }
    case 'converge': {
      const bestTrain =
        iterations.length > 0 ? Math.max(...iterations.map((i) => (isNaN(i.trainAccuracy) ? 0 : i.trainAccuracy))) : 0

      let holdoutSection = ''
      if (bestTrain >= 1.0 && holdoutFailures && holdoutFailures.length > 0) {
        const failingQueries = holdoutFailures.map((q) => `- "${q}"`).join('\n')
        holdoutSection = `\n\nThe following held-out user messages are not yet handled by the current description. These are additional user messages your description should handle:\n${failingQueries}`
      }

      return `Make targeted, surgical edits to improve failing cases without regressing passing ones. The best train accuracy so far is ${Math.round(bestTrain * 100)}%. Focus on the specific cases that are failing and adjust phrasing to ${trigger} correctly.${holdoutSection}\n\n${structural}`
    }
    default: {
      const _exhaustive: never = phase
      throw new Error(`Unknown phase: ${_exhaustive}`)
    }
  }
}

export function getPhase(iteration: number, maxIterations: number): Phase {
  if (maxIterations <= 5) {
    // Two phases: explore, converge (no transition)
    const base = Math.floor(maxIterations / 2)
    const exploreCount = base + (maxIterations % 2)
    return iteration <= exploreCount ? 'explore' : 'converge'
  }

  // Three phases: explore, transition, converge
  const base = Math.floor(maxIterations / 3)
  const remainder = maxIterations % 3
  const exploreCount = base + (remainder >= 1 ? 1 : 0)
  const transitionCount = base + (remainder >= 2 ? 1 : 0)

  if (iteration <= exploreCount) return 'explore'
  if (iteration <= exploreCount + transitionCount) return 'transition'
  return 'converge'
}
