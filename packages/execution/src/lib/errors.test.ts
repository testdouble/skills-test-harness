import { describe, expect, it } from 'vitest'
import { ConfigNotFoundError, RunNotFoundError, SkillwalkerError } from './errors.js'

describe('SkillwalkerError', () => {
  it('is an instance of Error', () => {
    const err = new SkillwalkerError('something broke')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name set to SkillwalkerError', () => {
    const err = new SkillwalkerError('something broke')
    expect(err.name).toBe('SkillwalkerError')
  })

  it('preserves the message', () => {
    const err = new SkillwalkerError('something broke')
    expect(err.message).toBe('something broke')
  })
})

describe('ConfigNotFoundError', () => {
  it('is an instance of SkillwalkerError', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err).toBeInstanceOf(SkillwalkerError)
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
  it('is an instance of SkillwalkerError', () => {
    const err = new RunNotFoundError('/output/run-1')
    expect(err).toBeInstanceOf(SkillwalkerError)
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
