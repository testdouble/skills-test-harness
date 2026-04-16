import type { AssistantEvent, ParsedRunMetrics, ResultEvent, StreamJsonEvent, UserEvent } from './types.js'

export function parseStreamJsonLines(raw: string): StreamJsonEvent[] {
  return raw
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as StreamJsonEvent)
}

export function getResultText(events: StreamJsonEvent[]): string | null {
  const event = events.find((e) => e.type === 'result') as ResultEvent | undefined
  return event?.result ?? null
}

export function getSkillInvocations(events: StreamJsonEvent[]): string[] {
  return events
    .filter((e) => {
      const userEvent = e as UserEvent
      return (
        userEvent.type === 'user' &&
        userEvent.tool_use_result?.success === true &&
        userEvent.tool_use_result.commandName != null
      )
    })
    .map((e) => (e as UserEvent).tool_use_result!.commandName!)
}

export function getAgentInvocations(events: StreamJsonEvent[]): string[] {
  return events
    .filter((e) => {
      const userEvent = e as UserEvent
      return (
        userEvent.type === 'user' &&
        userEvent.tool_use_result?.status === 'completed' &&
        userEvent.tool_use_result.agentType != null
      )
    })
    .map((e) => (e as UserEvent).tool_use_result!.agentType!)
}

export function extractMetrics(events: StreamJsonEvent[]): ParsedRunMetrics {
  const durationMs = events.reduce((sum, e) => sum + ((e as ResultEvent).duration_ms ?? 0), 0)

  const inputTokens = events.reduce((sum, e) => {
    const assistantEvent = e as AssistantEvent
    const resultEvent = e as ResultEvent
    const usage = assistantEvent.message?.usage ?? resultEvent.usage
    return sum + (usage?.input_tokens ?? 0)
  }, 0)

  const outputTokens = events.reduce((sum, e) => {
    const assistantEvent = e as AssistantEvent
    const resultEvent = e as ResultEvent
    const usage = assistantEvent.message?.usage ?? resultEvent.usage
    return sum + (usage?.output_tokens ?? 0)
  }, 0)

  const isError = events.some((e) => (e as ResultEvent).is_error === true)
  const result = getResultText(events)

  return { durationMs, inputTokens, outputTokens, isError, result }
}
