import { describe, it, expect } from 'vitest'
import { initTotals } from './step-7-init-totals.js'

describe('initTotals', () => {
  it('returns a zeroed totals object', () => {
    expect(initTotals()).toEqual({
      totalDurationMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      failures: 0,
    })
  })
})
