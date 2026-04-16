import { describe, it, expect } from 'vitest'
import { ClaudeError } from './errors.js'

describe('ClaudeError', () => {
  it('sets name to ClaudeError', () => {
    const error = new ClaudeError('test error', 1)
    expect(error.name).toBe('ClaudeError')
  })

  it('sets the message', () => {
    const error = new ClaudeError('claude failed', 1)
    expect(error.message).toBe('claude failed')
  })

  it('stores the exit code', () => {
    const error = new ClaudeError('failed', 42)
    expect(error.exitCode).toBe(42)
  })

  it('accepts null exit code', () => {
    const error = new ClaudeError('unknown failure', null)
    expect(error.exitCode).toBeNull()
  })

  it('is an instance of Error', () => {
    const error = new ClaudeError('test', 1)
    expect(error).toBeInstanceOf(Error)
  })
})
