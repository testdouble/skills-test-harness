import { describe, it, expect } from 'vitest'
import { HarnessError, ConfigNotFoundError, RunNotFoundError } from './errors.js'

describe('HarnessError', () => {
  it('is an instance of Error', () => {
    const err = new HarnessError('something broke')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name set to HarnessError', () => {
    const err = new HarnessError('something broke')
    expect(err.name).toBe('HarnessError')
  })

  it('preserves the message', () => {
    const err = new HarnessError('something broke')
    expect(err.message).toBe('something broke')
  })
})

describe('ConfigNotFoundError', () => {
  it('is an instance of HarnessError', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err).toBeInstanceOf(HarnessError)
  })

  it('has name set to ConfigNotFoundError', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err.name).toBe('ConfigNotFoundError')
  })

  it('includes the config path in the message', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err.message).toContain('/some/path/tests.json')
  })
})

describe('RunNotFoundError', () => {
  it('is an instance of HarnessError', () => {
    const err = new RunNotFoundError('/output/run-1')
    expect(err).toBeInstanceOf(HarnessError)
  })

  it('has name set to RunNotFoundError', () => {
    const err = new RunNotFoundError('/output/run-1')
    expect(err.name).toBe('RunNotFoundError')
  })

  it('includes the run directory in the message', () => {
    const err = new RunNotFoundError('/output/run-1')
    expect(err.message).toContain('/output/run-1')
  })
})
