import type { AcilQueryResult, AcilIterationResult } from './types.js'
import type { Phase } from './phase.js'
import { getPhaseInstructions } from './phase.js'

export function buildAcilImprovementPrompt(opts: {
  agentName:          string
  currentDescription: string
  agentBody:          string
  trainResults:       AcilQueryResult[]
  testResults?:       AcilQueryResult[]
  iterations:         AcilIterationResult[]
  holdout:            number
  phase:              Phase
}): string {
  const shouldTrigger = opts.trainResults.filter(r => r.expected === true)
  const shouldNotTrigger = opts.trainResults.filter(r => r.expected === false)

  const formatResult = (r: AcilQueryResult): string => {
    const status = r.passed
      ? 'PASS'
      : r.expected
        ? 'FAIL: agent was NOT delegated to'
        : 'FAIL: agent WAS delegated to'
    return `- "${r.testName}" (user said: "${r.promptContent}") → ${status}`
  }

  const shouldTriggerSection = shouldTrigger.length > 0
    ? shouldTrigger.map(formatResult).join('\n')
    : '(none)'

  const shouldNotTriggerSection = shouldNotTrigger.length > 0
    ? shouldNotTrigger.map(formatResult).join('\n')
    : '(none)'

  const historyLines = opts.iterations.map(iter => {
    const accuracy = isNaN(iter.trainAccuracy) ? 0 : Math.round(iter.trainAccuracy * 100)
    return `Iteration ${iter.iteration}: train accuracy ${accuracy}% — "${iter.description}"`
  })
  const historySection = historyLines.length > 0
    ? historyLines.join('\n')
    : '(none)'

  const holdoutFailures = opts.testResults
    ? opts.testResults.filter(r => !r.passed).map(r => r.promptContent)
    : undefined

  const phaseInstructions = getPhaseInstructions(opts.phase, 'agent', opts.iterations, holdoutFailures)

  return `You are an expert at writing agent descriptions for Claude Code plugins.
An agent description determines when Claude delegates to the agent. Your job is
to improve the description so Claude correctly delegates to the agent for
intended use cases and does NOT delegate for unintended ones.

## Agent Name
${opts.agentName}

## Current Description
${opts.currentDescription}

## Agent Body (what the agent does)
${opts.agentBody}

## Evaluation Results

### Should trigger (expected=true):
${shouldTriggerSection}

### Should NOT trigger (expected=false):
${shouldNotTriggerSection}

## Previous Iterations
${historySection}

## Instructions
Write an improved description. Use the actual user messages above to understand what phrasing should and should not trigger delegation — generalize these into broader patterns, but make sure the description covers the intent behind failing cases.

${phaseInstructions}

Output ONLY the new description text. No quotes, no explanation, no markdown.`
}
