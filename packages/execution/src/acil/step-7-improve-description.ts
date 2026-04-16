import { getResultText, parseStreamJsonLines, buildAcilImprovementPrompt } from '@testdouble/harness-data'
import type { Phase } from '@testdouble/harness-data'

import type { AcilQueryResult, AcilIterationResult } from './types.js'
import { runClaude } from '@testdouble/claude-integration'

const MAX_DESCRIPTION_LENGTH = 1024

export interface ImproveDescriptionOptions {
  agentName:      string
  currentDescription: string
  agentBody:      string
  trainResults:   AcilQueryResult[]
  testResults?:   AcilQueryResult[]
  iterations:     AcilIterationResult[]
  holdout:        number
  phase:          Phase
  model:          string
  debug:          boolean
}

export { buildAcilImprovementPrompt }

export async function improveDescription(opts: ImproveDescriptionOptions): Promise<string | null> {
  const prompt = buildAcilImprovementPrompt({
    agentName:          opts.agentName,
    currentDescription: opts.currentDescription,
    agentBody:          opts.agentBody,
    trainResults:       opts.trainResults,
    testResults:        opts.testResults,
    iterations:         opts.iterations,
    holdout:            opts.holdout,
    phase:              opts.phase,
  })

  const { stdout, stderr } = await runClaude({
    model: opts.model,
    prompt,
    debug: opts.debug,
  })
  const events = parseStreamJsonLines(stdout)
  const resultText = getResultText(events)

  if (!resultText || !resultText.trim()) {
    const stderrHint = stderr?.trim() ? ` (stderr: ${stderr.trim()})` : ''
    process.stderr.write(`  Warning: no result text returned from improvement prompt${stderrHint}, keeping current description\n`)
    return null
  }

  const trimmed = resultText.trim()

  // Guard against API errors leaking as descriptions
  const looksLikeError = /^(credit balance|rate limit|unauthorized|internal server error)/i.test(trimmed)
  if (trimmed.length < 20 || looksLikeError) {
    const stderrHint = stderr?.trim() ? ` (stderr: ${stderr.trim()})` : ''
    process.stderr.write(`  Warning: improvement returned invalid text (got: "${trimmed}")${stderrHint}, keeping current description\n`)
    return null
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return trimmed.slice(0, MAX_DESCRIPTION_LENGTH)
  }

  return trimmed
}
