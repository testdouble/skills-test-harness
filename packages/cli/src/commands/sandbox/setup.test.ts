import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/sandbox-integration', () => ({
  createSandbox: vi.fn(),
}))

import { createSandbox } from '@testdouble/sandbox-integration'
import { command, describe as commandDescribe, handler } from './setup.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createSandbox).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sandbox setup command exports', () => {
  it('exports the correct command string', () => {
    expect(command).toBe('setup')
  })

  it('exports a non-empty describe string', () => {
    expect(typeof commandDescribe).toBe('string')
    expect(commandDescribe.length).toBeGreaterThan(0)
  })
})

describe('sandbox setup handler', () => {
  it('calls createSandbox with the resolved repo-root', async () => {
    await handler({ 'repo-root': '/repo/root' })
    expect(vi.mocked(createSandbox)).toHaveBeenCalledWith('/repo/root')
  })
})
