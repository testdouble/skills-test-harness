import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateRunId } from './step-4-generate-run-id.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('generateRunId', () => {
  it('produces a timestamp string in YYYYMMDDTHHmmss format', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T09:05:07'))
    expect(generateRunId()).toBe('20250315T090507')
  })

  it('zero-pads single-digit month, day, hour, minute, and second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-02T03:04:05'))
    expect(generateRunId()).toBe('20250102T030405')
  })

  it('formats correctly with double-digit month, day, hour, minute, and second (TP-027)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-31T23:59:59'))
    expect(generateRunId()).toBe('20251231T235959')
  })

  it('produces identical IDs for two calls within the same second (TP-028)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T09:05:07'))
    const id1 = generateRunId()
    const id2 = generateRunId()
    expect(id1).toBe(id2)
  })
})
