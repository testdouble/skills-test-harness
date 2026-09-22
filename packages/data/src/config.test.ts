import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestCaseId, resolvePromptPath, validateScaffolds } from './config.js'
import type { EvalConfig } from './types.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'node:fs'

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>

describe('buildTestCaseId', () => {
  it('combines eval and test name with a dash', () => {
    expect(buildTestCaseId('my-eval', 'basic test')).toBe('my-eval-basic-test')
  })

  it('replaces spaces with dashes', () => {
    expect(buildTestCaseId('eval', 'hello world test')).toBe('eval-hello-world-test')
  })

  it('strips special characters', () => {
    expect(buildTestCaseId('eval', 'test: do something!')).toBe('eval-test-do-something')
  })

  it('preserves hyphens and alphanumerics', () => {
    expect(buildTestCaseId('eval', 'valid-name-123')).toBe('eval-valid-name-123')
  })

  it('handles empty test name', () => {
    expect(buildTestCaseId('eval', '')).toBe('eval-')
  })

  it('produces identical IDs for names that differ only in stripped characters (EC10)', () => {
    const id1 = buildTestCaseId('eval', 'test: foo')
    const id2 = buildTestCaseId('eval', 'test foo')
    // Both normalize to "eval-test-foo" — a silent collision risk
    expect(id1).toBe(id2)
  })

  it('strips non-ASCII characters from test names (EC23)', () => {
    const result = buildTestCaseId('eval', 'café test')
    // Accented characters are stripped by [^a-zA-Z0-9-] regex
    expect(result).toBe('eval-caf-test')
  })
})

describe('resolvePromptPath', () => {
  it('joins evalDir with prompts/ and the promptFile', () => {
    const result = resolvePromptPath('/evals/my-eval', 'my-prompt.md')
    expect(result).toBe('/evals/my-eval/prompts/my-prompt.md')
  })
})

function makeConfig(tests: Array<{ name: string; scaffold?: string }>): EvalConfig {
  return {
    plugins: ['r-and-d'],
    tests: tests.map((t) => ({
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
    expect(() => validateScaffolds('/eval', config)).toThrow('Scaffold directory not found')
    expect(() => validateScaffolds('/eval', config)).toThrow('ruby-project')
    expect(() => validateScaffolds('/eval', config)).toThrow('test-a')
  })

  it('passes when scaffold directory exists', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([{ name: 'test-a', scaffold: 'ruby-project' }])
    expect(() => validateScaffolds('/eval', config)).not.toThrow()
  })

  it('skips tests without scaffold field', () => {
    const config = makeConfig([{ name: 'test-a' }, { name: 'test-b' }])
    validateScaffolds('/eval', config)
    expect(mockExistsSync).not.toHaveBeenCalled()
  })

  it('checks all tests with scaffolds', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([
      { name: 'test-a', scaffold: 'ruby-project' },
      { name: 'test-b' },
      { name: 'test-c', scaffold: 'node-project' },
    ])
    validateScaffolds('/eval', config)
    expect(mockExistsSync).toHaveBeenCalledTimes(2)
  })

  it('constructs correct scaffold path from evalDir and scaffold name', () => {
    mockExistsSync.mockReturnValue(true)
    const config = makeConfig([{ name: 'test-a', scaffold: 'my-scaffold' }])
    validateScaffolds('/my/eval', config)
    expect(mockExistsSync).toHaveBeenCalledWith('/my/eval/scaffolds/my-scaffold')
  })
})
