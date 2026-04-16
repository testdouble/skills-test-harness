import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { StreamJsonEvent, AssistantEvent, UserEvent } from '@testdouble/harness-data'
import type { RubricSection } from './rubric-parser.js'

const MAX_FILE_SIZE = 5 * 1024
const MAX_RESULT_SIZE = 2000

export async function buildJudgePrompt(
  sections: RubricSection[],
  resultText: string,
  scaffoldDir: string | null,
  events: StreamJsonEvent[],
  outputFiles: Map<string, string>,
  context?: { testType?: string }
): Promise<{ prompt: string; autoFailCriteria: string[] }> {
  const isAgent = context?.testType === 'agent-prompt'
  const promptSections: string[] = []
  const autoFailCriteria: string[] = []

  promptSections.push(
    isAgent
      ? 'You are evaluating the output of a Claude Code agent run. The agent was given a task via delegation and produced the transcript and output below.'
      : 'You are evaluating the output of a Claude Code skill run.'
  )

  if (scaffoldDir) {
    const scaffoldFiles = await readScaffoldFiles(scaffoldDir)
    if (scaffoldFiles.size > 0) {
      promptSections.push('# Scaffold Files')
      for (const [relativePath, content] of scaffoldFiles) {
        promptSections.push(`### ${relativePath}\n${content}`)
      }
    }
  }

  const transcript = formatTranscript(events)
  if (transcript) {
    promptSections.push(`# Transcript\n\n${transcript}`)
  }

  promptSections.push(`# Final ${isAgent ? 'Agent' : 'Skill'} Output\n\n${resultText}`)

  // Inject output file content for file-scoped sections
  for (const section of sections) {
    if (section.type === 'file' && section.filePath) {
      const fileContent = outputFiles.get(section.filePath)
      if (fileContent !== undefined) {
        promptSections.push(`# Output File: ${section.filePath}\n\n${fileContent}`)
      }
    }
  }

  // Collect all criteria for the judge, separating auto-fails for missing files
  const judgeCriteria: string[] = []
  for (const section of sections) {
    if (section.type === 'transcript') {
      judgeCriteria.push(...section.criteria)
    } else if (section.type === 'file' && section.filePath) {
      const fileContent = outputFiles.get(section.filePath)
      if (fileContent === undefined) {
        // File missing — all criteria auto-fail
        autoFailCriteria.push(...section.criteria)
      } else {
        // Add file-scoped criteria with context prefix
        for (const criterion of section.criteria) {
          judgeCriteria.push(`[File: ${section.filePath}] ${criterion}`)
        }
      }
    }
  }

  const numberedCriteria = judgeCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
  promptSections.push(`# Rubric Criteria

Evaluate each criterion below. Respond with ONLY a valid JSON object — no markdown, no explanation outside the JSON:

{
  "criteria": [
    { "criterion": "...", "passed": true, "reasoning": "..." },
    { "criterion": "...", "passed": true, "confidence": "partial", "reasoning": "..." },
    { "criterion": "...", "passed": false, "reasoning": "..." }
  ]
}

Rules for passed and confidence:
- Use passed: true when the criterion is clearly and fully met.
- Use passed: true with confidence: "partial" when a major part of the criterion matches but a specific element is missing (e.g., the concept is discussed but exact names, values, or file paths are absent).
- Use passed: false when the criterion is not met.
- Never add a confidence field to passed: false rows.

Criteria:
${numberedCriteria}`)

  return { prompt: promptSections.join('\n\n'), autoFailCriteria }
}

async function readScaffoldFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  await walkDir(dir, dir, files)
  return files
}

async function walkDir(baseDir: string, currentDir: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git') continue
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(baseDir, fullPath, files)
    } else {
      const content = await readFile(fullPath, 'utf8')
      const relativePath = path.relative(baseDir, fullPath)
      files.set(relativePath, content.slice(0, MAX_FILE_SIZE))
    }
  }
}

function formatTranscript(events: StreamJsonEvent[]): string {
  const lines: string[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.type !== 'assistant') continue

    const assistantEvent = event as AssistantEvent
    const message = assistantEvent.message as Record<string, unknown>
    const content = message.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const toolName = block.name as string
      const input = block.input as Record<string, unknown>

      const keyArgs = extractKeyArgs(input)

      // Find the matching tool result in subsequent events
      let resultSnippet = ''
      for (let j = i + 1; j < events.length; j++) {
        const candidate = events[j]
        if (candidate.type !== 'user') continue
        const userEvent = candidate as UserEvent
        const candidateAny = candidate as unknown as Record<string, unknown>
        if (userEvent.tool_use_result?.commandName === toolName ||
            candidateAny.tool_use_id === block.id) {
          const resultContent = candidateAny.content
          if (typeof resultContent === 'string') {
            resultSnippet = resultContent.slice(0, MAX_RESULT_SIZE)
          } else if (Array.isArray(resultContent)) {
            const textBlock = resultContent.find((b: Record<string, unknown>) => b.type === 'text')
            if (textBlock) {
              resultSnippet = (textBlock.text as string).slice(0, MAX_RESULT_SIZE)
            }
          }
          break
        }
      }

      lines.push(`[Tool: ${toolName}] ${keyArgs}`)
      if (resultSnippet) {
        lines.push(`Result: ${resultSnippet}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trim()
}

function extractKeyArgs(input: Record<string, unknown>): string {
  if (input.file_path) return String(input.file_path)
  if (input.command) return String(input.command)
  if (input.pattern) return `pattern: "${input.pattern}"`
  if (input.query) return `query: "${input.query}"`
  return JSON.stringify(input).slice(0, 200)
}
