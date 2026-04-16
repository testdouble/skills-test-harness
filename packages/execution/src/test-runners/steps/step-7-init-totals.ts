export function initTotals(): { totalDurationMs: number, totalInputTokens: number, totalOutputTokens: number, failures: number } {
  return { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
}
