import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAllEvals, getEvalDir } from './paths.js'

describe('getEvalDir', () => {
  it('returns the path to the named eval under cwd/evals', () => {
    const result = getEvalDir('my-eval')
    expect(result).toBe(path.join(process.cwd(), 'evals', 'my-eval'))
  })

  it('uses the provided eval name in the path', () => {
    const result = getEvalDir('another-eval')
    expect(result).toContain('another-eval')
  })
})

describe('getAllEvals', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['eval-a', 'eval-b', '.DS_Store'] as any)
    vi.spyOn(fs, 'statSync').mockImplementation(
      (p) =>
        ({
          isDirectory: () => !String(p).includes('.DS_Store'),
        }) as fs.Stats,
    )
  })

  it('returns only directory entries from evals/', () => {
    const result = getAllEvals()
    expect(result).toEqual(['eval-a', 'eval-b'])
  })

  it('throws ENOENT when evals directory does not exist (EC6)', () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })
    expect(() => getAllEvals()).toThrow('ENOENT')
  })
})
