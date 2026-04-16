import { describe, it, expect, vi, afterEach } from 'vitest'
import { printTotals } from './step-9-print-totals.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('printTotals', () => {
  it('logs the test run ID heading', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printTotals(1500, 200, 100, 'run-abc')
    const calls = logSpy.mock.calls.map(([s]) => s)
    expect(calls).toContain('run-abc totals')
  })

  it('formats duration as seconds with one decimal place', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printTotals(1500, 200, 100, 'run-abc')
    const calls = logSpy.mock.calls.map(([s]) => s).join('\n')
    expect(calls).toContain('1.5s')
  })

  it('logs input and output token counts', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printTotals(1500, 200, 100, 'run-abc')
    const calls = logSpy.mock.calls.map(([s]) => s).join('\n')
    expect(calls).toContain('200')
    expect(calls).toContain('100')
  })
})
