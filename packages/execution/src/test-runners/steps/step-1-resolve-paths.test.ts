import { describe, it, expect } from 'vitest'
import { resolvePaths } from './step-1-resolve-paths.js'

describe('resolvePaths', () => {
  it('returns testSuiteDir computed from testsDir and suite', () => {
    const result = resolvePaths('my-suite', '/mock/tests')
    expect(result).toEqual({ testSuiteDir: '/mock/tests/test-suites/my-suite' })
  })
})
