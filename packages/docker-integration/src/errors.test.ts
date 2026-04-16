import { describe, it, expect } from 'vitest'
import { DockerError } from './errors.js'

describe('DockerError', () => {
  it('sets name to DockerError', () => {
    const error = new DockerError('test error', 1)
    expect(error.name).toBe('DockerError')
  })

  it('sets the message', () => {
    const error = new DockerError('sandbox not found', 1)
    expect(error.message).toBe('sandbox not found')
  })

  it('stores the exit code', () => {
    const error = new DockerError('failed', 42)
    expect(error.exitCode).toBe(42)
  })

  it('accepts null exit code', () => {
    const error = new DockerError('unknown failure', null)
    expect(error.exitCode).toBeNull()
  })

  it('is an instance of Error', () => {
    const error = new DockerError('test', 1)
    expect(error).toBeInstanceOf(Error)
  })
})
