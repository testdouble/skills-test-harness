import { describe, it, expect, vi, afterEach } from 'vitest'
import { readConfig } from './step-3-read-config.js'
import { readTestSuiteConfig, validateScaffolds } from '@testdouble/harness-data'
import { HarnessError } from '../../lib/errors.js'

vi.mock('@testdouble/harness-data', () => ({
  readTestSuiteConfig: vi.fn(),
  validateScaffolds: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(validateScaffolds).mockReset()
})

function makeConfig(names: string[]) {
  return {
    plugins: ['r-and-d'],
    tests: names.map(name => ({ name, promptFile: 'prompt.md', model: 'sonnet', expect: [] })),
  }
}

describe('readConfig', () => {
  it('returns the full config when no testFilter is provided', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue(makeConfig(['test-a', 'test-b', 'test-c']))
    const result = await readConfig('/path/config.json', '/path/suite', undefined)
    expect(result.tests).toHaveLength(3)
  })

  it('filters config.tests to only the matching test when testFilter is provided', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue(makeConfig(['test-a', 'test-b', 'test-c']))
    const result = await readConfig('/path/config.json', '/path/suite', 'test-b')
    expect(result.tests).toHaveLength(1)
    expect(result.tests[0].name).toBe('test-b')
  })

  it('throws HarnessError when testFilter matches no tests', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue(makeConfig(['test-a', 'test-b']))

    await expect(readConfig('/path/config.json', '/path/suite', 'nonexistent')).rejects.toThrow(HarnessError)
    await expect(readConfig('/path/config.json', '/path/suite', 'nonexistent')).rejects.toThrow('nonexistent')
  })

  it('throws HarnessError with the error message when readTestSuiteConfig throws (TP-001)', async () => {
    vi.mocked(readTestSuiteConfig).mockRejectedValue(new Error('Invalid JSON in config file'))

    await expect(readConfig('/path/config.json', '/path/suite', undefined)).rejects.toThrow(HarnessError)
    await expect(readConfig('/path/config.json', '/path/suite', undefined)).rejects.toThrow('Invalid JSON in config file')
  })

  it('calls validateScaffolds with testSuiteDir and config', async () => {
    const config = makeConfig(['test-a'])
    vi.mocked(readTestSuiteConfig).mockResolvedValue(config)
    await readConfig('/path/config.json', '/path/suite', undefined)
    expect(vi.mocked(validateScaffolds)).toHaveBeenCalledWith('/path/suite', config)
  })

  it('throws HarnessError when validateScaffolds throws', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue(makeConfig(['test-a']))
    vi.mocked(validateScaffolds).mockImplementation(() => { throw new Error('Scaffold directory not found: /path/scaffolds/missing') })

    await expect(readConfig('/path/config.json', '/path/suite', undefined)).rejects.toThrow(HarnessError)
    await expect(readConfig('/path/config.json', '/path/suite', undefined)).rejects.toThrow('Scaffold directory not found')
  })

  it('returns all tests when multiple tests share the same name as testFilter (TP-030)', async () => {
    vi.mocked(readTestSuiteConfig).mockResolvedValue(makeConfig(['test-a', 'test-a', 'test-b']))
    const result = await readConfig('/path/config.json', '/path/suite', 'test-a')
    expect(result.tests).toHaveLength(2)
    expect(result.tests.every(t => t.name === 'test-a')).toBe(true)
  })
})
