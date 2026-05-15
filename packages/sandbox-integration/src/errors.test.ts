import { describe, expect, it } from 'vitest'
import { SandboxError } from './errors.js'

describe('SandboxError', () => {
  it('sets name to SandboxError', () => {
    const error = new SandboxError('test error', 1)
    expect(error.name).toBe('SandboxError')
  })

  it('sets the message', () => {
    const error = new SandboxError('sandbox not found', 1)
    expect(error.message).toBe('sandbox not found')
  })

  it('stores the exit code', () => {
    const error = new SandboxError('failed', 42)
    expect(error.exitCode).toBe(42)
  })

  it('accepts null exit code', () => {
    const error = new SandboxError('unknown failure', null)
    expect(error.exitCode).toBeNull()
  })

  it('is an instance of Error', () => {
    const error = new SandboxError('test', 1)
    expect(error).toBeInstanceOf(Error)
  })
})
