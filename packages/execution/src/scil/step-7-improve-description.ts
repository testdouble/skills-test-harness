import { runClaude } from '@testdouble/claude-integration'
import type { Phase } from '@testdouble/harness-data'
import { buildImprovementPrompt, getResultText, parseStreamJsonLines } from '@testdouble/harness-data'
import type { IterationResult, QueryResult } from './types.js'

const MAX_DESCRIPTION_LENGTH = 1024

export interface ImproveDescriptionOptions {
  skillName: string
  currentDescription: string
  skillBody: string
  trainResults: QueryResult[]
  testResults?: QueryResult[]
  iterations: IterationResult[]
  holdout: number
  phase: Phase
  model: string
  debug: boolean
}

export { buildImprovementPrompt }

export async function improveDescription(opts: ImproveDescriptionOptions): Promise<string | null> {
  const prompt = buildImprovementPrompt({
    skillName: opts.skillName,
    currentDescription: opts.currentDescription,
    skillBody: opts.skillBody,
    trainResults: opts.trainResults,
    testResults: opts.testResults,
    iterations: opts.iterations,
    holdout: opts.holdout,
    phase: opts.phase,
  })

  const { stdout, stderr } = await runClaude({
    model: opts.model,
    prompt,
    debug: opts.debug,
  })
  const events = parseStreamJsonLines(stdout)
  const resultText = getResultText(events)

  if (!resultText?.trim()) {
    const stderrHint = stderr?.trim() ? ` (stderr: ${stderr.trim()})` : ''
    process.stderr.write(
      `  Warning: no result text returned from improvement prompt${stderrHint}, keeping current description\n`,
    )
    return null
  }

  const trimmed = resultText.trim()

  // Guard against API errors leaking as descriptions
  const looksLikeError = /^(credit balance|rate limit|unauthorized|internal server error)/i.test(trimmed)
  if (trimmed.length < 20 || looksLikeError) {
    const stderrHint = stderr?.trim() ? ` (stderr: ${stderr.trim()})` : ''
    process.stderr.write(
      `  Warning: improvement returned invalid text (got: "${trimmed}")${stderrHint}, keeping current description\n`,
    )
    return null
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return trimmed.slice(0, MAX_DESCRIPTION_LENGTH)
  }

  return trimmed
}
