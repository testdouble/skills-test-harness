import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { getTestSuiteDir, getAllTestSuites } from './paths.js'

describe('getTestSuiteDir', () => {
  it('returns the path to the named test suite under cwd/test-suites', () => {
    const result = getTestSuiteDir('my-suite')
    expect(result).toBe(path.join(process.cwd(), 'test-suites', 'my-suite'))
  })

  it('uses the provided suite name in the path', () => {
    const result = getTestSuiteDir('another-suite')
    expect(result).toContain('another-suite')
  })
})

describe('getAllTestSuites', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['suite-a', 'suite-b', '.DS_Store'] as any)
    vi.spyOn(fs, 'statSync').mockImplementation((p) => ({
      isDirectory: () => !String(p).includes('.DS_Store'),
    }) as fs.Stats)
  })

  it('returns only directory entries from test-suites/', () => {
    const result = getAllTestSuites()
    expect(result).toEqual(['suite-a', 'suite-b'])
  })

  it('throws ENOENT when test-suites directory does not exist (EC6)', () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
    expect(() => getAllTestSuites()).toThrow('ENOENT')
  })
})

