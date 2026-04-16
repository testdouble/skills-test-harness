import { describe, it, expect, vi, afterEach } from 'vitest'
import { exitWithResult } from './step-10-exit.js'

const callExitWithResult = exitWithResult as unknown as (n: number) => void

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exitWithResult', () => {
  it('exits with code 0 when failures is 0', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    callExitWithResult(0)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('exits with code 1 when failures is greater than 0', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    callExitWithResult(3)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 0 when failures is negative (TP-020)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    callExitWithResult(-1)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
