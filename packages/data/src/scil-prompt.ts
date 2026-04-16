import type { Phase } from './phase.js'
import { getPhaseInstructions } from './phase.js'
import type { IterationResult, QueryResult } from './types.js'

export function buildImprovementPrompt(opts: {
  skillName: string
  currentDescription: string
  skillBody: string
  trainResults: QueryResult[]
  testResults?: QueryResult[]
  iterations: IterationResult[]
  holdout: number
  phase: Phase
}): string {
  const shouldTrigger = opts.trainResults.filter((r) => r.expected === true)
  const shouldNotTrigger = opts.trainResults.filter((r) => r.expected === false)

  const formatResult = (r: QueryResult): string => {
    const status = r.passed ? 'PASS' : r.expected ? 'FAIL: skill was NOT invoked' : 'FAIL: skill WAS invoked'
    return `- "${r.testName}" (user said: "${r.promptContent}") → ${status}`
  }

  const shouldTriggerSection = shouldTrigger.length > 0 ? shouldTrigger.map(formatResult).join('\n') : '(none)'

  const shouldNotTriggerSection = shouldNotTrigger.length > 0 ? shouldNotTrigger.map(formatResult).join('\n') : '(none)'

  const historyLines = opts.iterations.map((iter) => {
    const accuracy = isNaN(iter.trainAccuracy) ? 0 : Math.round(iter.trainAccuracy * 100)
    return `Iteration ${iter.iteration}: train accuracy ${accuracy}% — "${iter.description}"`
  })
  const historySection = historyLines.length > 0 ? historyLines.join('\n') : '(none)'

  const holdoutFailures = opts.testResults
    ? opts.testResults.filter((r) => !r.passed).map((r) => r.promptContent)
    : undefined

  const phaseInstructions = getPhaseInstructions(opts.phase, 'skill', opts.iterations, holdoutFailures)

  return `You are an expert at writing skill descriptions for Claude Code plugins.
A skill description determines when Claude invokes the skill. Your job is
to improve the description so Claude correctly triggers the skill for
intended use cases and does NOT trigger it for unintended ones.

## Skill Name
${opts.skillName}

## Current Description
${opts.currentDescription}

## Skill Body (what the skill does)
${opts.skillBody}

## Evaluation Results

### Should trigger (expected=true):
${shouldTriggerSection}

### Should NOT trigger (expected=false):
${shouldNotTriggerSection}

## Previous Iterations
${historySection}

## Instructions
Write an improved description. Use the actual user messages above to understand what phrasing should and should not trigger the skill — generalize these into broader patterns, but make sure the description covers the intent behind failing cases.

${phaseInstructions}

Output ONLY the new description text. No quotes, no explanation, no markdown.`
}
