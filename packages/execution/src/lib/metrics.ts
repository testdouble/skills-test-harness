import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'

export type { RunTotals }

export function accumulateTotals(totals: RunTotals, metrics: ParsedRunMetrics): RunTotals {
  return {
    totalDurationMs: totals.totalDurationMs + metrics.durationMs,
    totalInputTokens: totals.totalInputTokens + metrics.inputTokens,
    totalOutputTokens: totals.totalOutputTokens + metrics.outputTokens,
    failures: totals.failures,
  }
}
