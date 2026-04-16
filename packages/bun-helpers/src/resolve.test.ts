import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

function makeMeta(overrides: Partial<{ dir: string; dirname: string; url: string }>): ImportMeta {
  return {
    url: overrides.url ?? '',
    dir: overrides.dir,
    dirname: overrides.dirname,
  } as unknown as ImportMeta
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bun-helpers-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('currentDir', () => {
  it('returns import.meta.dir when available (Bun source)', async () => {
    const { currentDir } = await import('./resolve.js')
    const result = currentDir(makeMeta({ dir: '/some/source/dir' }))
    expect(result).toBe('/some/source/dir')
  })

  it('falls back to import.meta.dirname when dir is undefined (Vitest/Node)', async () => {
    const { currentDir } = await import('./resolve.js')
    const result = currentDir(makeMeta({ dirname: '/some/node/dir' }))
    expect(result).toBe('/some/node/dir')
  })

  it('falls back to import.meta.url when dir and dirname are undefined', async () => {
    const { currentDir } = await import('./resolve.js')
    const result = currentDir(makeMeta({ url: 'file:///some/url/dir/file.ts' }))
    expect(result).toBe('/some/url/dir')
  })

  it('prefers dir over dirname', async () => {
    const { currentDir } = await import('./resolve.js')
    const result = currentDir(makeMeta({ dir: '/bun/dir', dirname: '/node/dir' }))
    expect(result).toBe('/bun/dir')
  })

  it('prefers dirname over url', async () => {
    const { currentDir } = await import('./resolve.js')
    const result = currentDir(makeMeta({ dirname: '/node/dir', url: 'file:///url/dir/file.ts' }))
    expect(result).toBe('/node/dir')
  })
})

describe('resolveRelativePath', () => {
  it('resolves sourcePath relative to currentDir in source mode', async () => {
    const targetFile = path.join(tmpDir, 'target.sh')
    fs.writeFileSync(targetFile, '#!/bin/sh\n')

    const { resolveRelativePath } = await import('./resolve.js')
    const subDir = path.join(tmpDir, 'sub')
    fs.mkdirSync(subDir)

    const result = resolveRelativePath(
      makeMeta({ dir: subDir }),
      '../target.sh',
      'irrelevant/path.sh'
    )
    expect(result).toBe(targetFile)
  })

  it('resolves compiledPath relative to process.execPath directory when dir includes $bunfs', async () => {
    const targetFile = path.join(tmpDir, 'packages', 'pkg', 'target.sh')
    fs.mkdirSync(path.join(tmpDir, 'packages', 'pkg'), { recursive: true })
    fs.writeFileSync(targetFile, '#!/bin/sh\n')

    const originalExecPath = process.execPath
    Object.defineProperty(process, 'execPath', { value: path.join(tmpDir, 'harness'), writable: true, configurable: true })

    try {
      const { resolveRelativePath } = await import('./resolve.js')
      const result = resolveRelativePath(
        makeMeta({ dir: '/$bunfs/root' }),
        '../irrelevant.sh',
        'packages/pkg/target.sh'
      )
      expect(result).toBe(targetFile)
    } finally {
      Object.defineProperty(process, 'execPath', { value: originalExecPath, writable: true, configurable: true })
    }
  })

  it('throws when resolved path does not exist in source mode', async () => {
    const { resolveRelativePath } = await import('./resolve.js')
    expect(() =>
      resolveRelativePath(
        makeMeta({ dir: tmpDir }),
        'nonexistent-file.sh',
        'irrelevant/path.sh'
      )
    ).toThrow(/Resolved path does not exist/)
  })

  it('throws when resolved path does not exist in compiled mode', async () => {
    const originalExecPath = process.execPath
    Object.defineProperty(process, 'execPath', { value: path.join(tmpDir, 'harness'), writable: true, configurable: true })

    try {
      const { resolveRelativePath } = await import('./resolve.js')
      expect(() =>
        resolveRelativePath(
          makeMeta({ dir: '/$bunfs/root' }),
          '../irrelevant.sh',
          'nonexistent/path.sh'
        )
      ).toThrow(/Resolved path does not exist/)
    } finally {
      Object.defineProperty(process, 'execPath', { value: originalExecPath, writable: true, configurable: true })
    }
  })
})
