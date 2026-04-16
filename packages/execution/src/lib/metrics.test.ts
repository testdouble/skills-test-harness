import { describe, it, expect } from 'vitest'
import { accumulateTotals } from './metrics.js'
import type { RunTotals } from '@testdouble/harness-data'

describe('accumulateTotals', () => {
  it('returns a new object with accumulated metrics', () => {
    const totals: RunTotals = { totalDurationMs: 100, totalInputTokens: 50, totalOutputTokens: 25, failures: 0 }
    const metrics = { durationMs: 200, inputTokens: 75, outputTokens: 30, isError: false, result: null }
    const result = accumulateTotals(totals, metrics)
    expect(result.totalDurationMs).toBe(300)
    expect(result.totalInputTokens).toBe(125)
    expect(result.totalOutputTokens).toBe(55)
  })

  it('returns a new object rather than mutating the original', () => {
    const totals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
    const metrics = { durationMs: 10, inputTokens: 5, outputTokens: 3, isError: false, result: null }
    const result = accumulateTotals(totals, metrics)
    expect(result).not.toBe(totals)
    expect(totals.totalDurationMs).toBe(0) // original unchanged
    expect(result.totalDurationMs).toBe(10)
  })

  it('does not modify the failures field', () => {
    const totals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 7 }
    const metrics = { durationMs: 10, inputTokens: 5, outputTokens: 3, isError: false, result: null }
    const result = accumulateTotals(totals, metrics)
    expect(result.failures).toBe(7)
  })

  it('accumulates correctly across multiple calls', () => {
    const initial: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
    const first = accumulateTotals(initial, { durationMs: 100, inputTokens: 10, outputTokens: 5, isError: false, result: null })
    const second = accumulateTotals(first, { durationMs: 200, inputTokens: 20, outputTokens: 10, isError: false, result: null })
    expect(second.totalDurationMs).toBe(300)
    expect(second.totalInputTokens).toBe(30)
    expect(second.totalOutputTokens).toBe(15)
  })
})
