import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@testdouble/docker-integration', () => ({
  openShell: vi.fn(),
}))

import { openShell } from '@testdouble/docker-integration'
import { handler, command, describe as commandDescribe } from './shell.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(openShell).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shell command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('shell')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('shell handler', () => {
  it('calls openShell', async () => {
    await handler()
    expect(vi.mocked(openShell)).toHaveBeenCalled()
  })
})
