import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigNotFoundError } from '../../lib/errors.js'
import { validateConfig } from './step-2-validate-config.js'

function makeBunFile(exists: boolean) {
  return { exists: vi.fn().mockResolvedValue(exists) }
}

beforeEach(() => {
  vi.stubGlobal('Bun', { file: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('validateConfig', () => {
  it('returns configFilePath when tests.json exists', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true))
    const result = await validateConfig('/some/dir')
    expect(result).toEqual({ configFilePath: '/some/dir/tests.json' })
  })

  it('throws ConfigNotFoundError when tests.json does not exist', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(false))

    await expect(validateConfig('/missing/dir')).rejects.toThrow(ConfigNotFoundError)
    await expect(validateConfig('/missing/dir')).rejects.toThrow('/missing/dir')
  })
})
