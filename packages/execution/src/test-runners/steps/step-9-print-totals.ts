export function printTotals(totalDurationMs: number, totalInputTokens: number, totalOutputTokens: number, testRunId: string): void {
  console.log(`${testRunId} totals`)
  console.log(`  - duration: ${(totalDurationMs / 1000).toFixed(1)}s`)
  console.log(`  - input tokens: ${totalInputTokens}`)
  console.log(`  - output tokens: ${totalOutputTokens}`)
  console.log()
}
