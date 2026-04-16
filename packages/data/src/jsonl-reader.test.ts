import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { readJsonlFile } from './jsonl-reader.js'

function makeFakeFile(exists: boolean, content = '') {
  return {
    exists: vi.fn().mockResolvedValue(exists),
    text: vi.fn().mockResolvedValue(content),
  }
}

beforeEach(() => {
  vi.stubGlobal('Bun', { file: vi.fn().mockReturnValue(makeFakeFile(false)) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readJsonlFile', () => {
  it('returns empty array when file does not exist', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(false))
    const result = await readJsonlFile('/some/file.jsonl')
    expect(result).toEqual([])
  })

  it('parses each line as JSON and returns an array', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{"a":1}\n{"b":2}\n'))
    const result = await readJsonlFile<{ a?: number; b?: number }>('/some/file.jsonl')
    expect(result).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('ignores blank lines', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{"x":1}\n\n   \n{"y":2}\n'))
    const result = await readJsonlFile<{ x?: number; y?: number }>('/some/file.jsonl')
    expect(result).toHaveLength(2)
  })

  it('passes the file path to Bun.file', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{}'))
    await readJsonlFile('/custom/path.jsonl')
    expect((globalThis as any).Bun.file).toHaveBeenCalledWith('/custom/path.jsonl')
  })

  it('throws SyntaxError when a non-empty line is not valid JSON (EC8)', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{"a":1}\ncorrupt line\n'))
    await expect(readJsonlFile('/some/file.jsonl')).rejects.toThrow(SyntaxError)
  })
})
