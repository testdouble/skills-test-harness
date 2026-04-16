import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildTestCaseId,
  resolvePromptPath,
  validateScaffolds,
} from './config.js'
import type { TestSuiteConfig } from './types.js'
import { vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'node:fs'
const mockExistsSync = existsSync as ReturnType<typeof vi.fn>

describe('buildTestCaseId', () => {
  it('combines suite and test name with a dash', () => {
    expect(buildTestCaseId('my-suite', 'basic test')).toBe('my-suite-basic-test')
  })

  it('replaces spaces with dashes', () => {
    expect(buildTestCaseId('suite', 'hello world test')).toBe('suite-hello-world-test')
  })

  it('strips special characters', () => {
    expect(buildTestCaseId('suite', 'test: do something!')).toBe('suite-test-do-something')
  })

  it('preserves hyphens and alphanumerics', () => {
    expect(buildTestCaseId('suite', 'valid-name-123')).toBe('suite-valid-name-123')
  })

  it('handles empty test name', () => {
    expect(buildTestCaseId('suite', '')).toBe('suite-')
  })

  it('produces identical IDs for names that differ only in stripped characters (EC10)', () => {
    const id1 = buildTestCaseId('suite', 'test: foo')
    const id2 = buildTestCaseId('suite', 'test foo')
    // Both normalize to "suite-test-foo" — a silent collision risk
    expect(id1).toBe(id2)
  })

  it('strips non-ASCII characters from test names (EC23)', () => {
    const result = buildTestCaseId('suite', 'café test')
    // Accented characters are stripped by [^a-zA-Z0-9-] regex
    expect(result).toBe('suite-caf-test')
  })
})

describe('resolvePromptPath', () => {
  it('joins testSuiteDir with prompts/ and the promptFile', () => {
    const result = resolvePromptPath('/test-suites/my-suite', 'my-prompt.md')
    expect(result).toBe('/test-suites/my-suite/prompts/my-prompt.md')
  })
})

function makeConfig(tests: Array<{ name: string; scaffold?: string }>): TestSuiteConfig {
  return {
    plugins: ['r-and-d'],
    tests: tests.map(t => ({
      name: t.name,
      promptFile: 'prompt.md',
      model: 'sonnet',
      ...(t.scaffold ? { scaffold: t.scaffold } : {}),
      expect: [],
    })),
  }
}

describe('validateScaffolds', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
  })

  it('throws when scaffold directory does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const config = makeConfig([{ name: 'test-a', scaffold: 'ruby-project' }])
    expect(() => validateScaffolds('/suite', config)).toThrow('Scaffold directory not found')
    expect(() => validateScaffolds('/suite', config)).toThrow('ruby-project')
    expect(() => validateScaffolds('/suite', config)).toThrow('test-a')
  })

  it('passes when scaffold directory exists', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([{ name: 'test-a', scaffold: 'ruby-project' }])
    expect(() => validateScaffolds('/suite', config)).not.toThrow()
  })

  it('skips tests without scaffold field', () => {
    const config = makeConfig([{ name: 'test-a' }, { name: 'test-b' }])
    validateScaffolds('/suite', config)
    expect(mockExistsSync).not.toHaveBeenCalled()
  })

  it('checks all tests with scaffolds', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([
      { name: 'test-a', scaffold: 'ruby-project' },
      { name: 'test-b' },
      { name: 'test-c', scaffold: 'node-project' },
    ])
    validateScaffolds('/suite', config)
    expect(mockExistsSync).toHaveBeenCalledTimes(2)
  })

  it('constructs correct scaffold path from testSuiteDir and scaffold name', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([{ name: 'test-a', scaffold: 'my-scaffold' }])
    validateScaffolds('/my/suite', config)
    expect(mockExistsSync).toHaveBeenCalledWith('/my/suite/scaffolds/my-scaffold')
  })
})
