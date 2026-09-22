import { describe, expect, it } from 'vitest'
import { resolvePaths } from './step-1-resolve-paths.js'

describe('resolvePaths', () => {
  it('returns evalDir computed from testsDir and eval', () => {
    const result = resolvePaths('my-eval', '/mock/tests')
    expect(result).toEqual({ evalDir: '/mock/tests/evals/my-eval' })
  })
})
