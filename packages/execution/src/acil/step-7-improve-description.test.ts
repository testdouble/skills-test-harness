import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@testdouble/harness-data', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    parseStreamJsonLines: vi.fn().mockReturnValue([]),
    getResultText: vi.fn().mockReturnValue('improved description that is long enough to pass validation'),
  }
})
vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}))

import { parseStreamJsonLines, getResultText } from '@testdouble/harness-data'
import { runClaude } from '@testdouble/claude-integration'
import { improveDescription } from './step-7-improve-description.js'
import type { ImproveDescriptionOptions } from './step-7-improve-description.js'

function makeOpts(overrides: Partial<ImproveDescriptionOptions> = {}): ImproveDescriptionOptions {
  return {
    agentName: 'gap-analyzer',
    currentDescription: 'current desc',
    agentBody: 'Agent body content',
    trainResults: [],
    iterations: [],
    holdout: 0,
    phase: 'explore',
    model: 'opus',
    debug: false,
    ...overrides,
  }
}

const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

beforeEach(() => {
  vi.clearAllMocks()
  stderrSpy.mockClear()
  vi.mocked(parseStreamJsonLines).mockReturnValue([])
  vi.mocked(getResultText).mockReturnValue('improved description that is long enough to pass validation')
  vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
})

describe('improveDescription (ACIL)', () => {
  // TP-001 (T1): happy path returns trimmed text
  it('returns trimmed result text from Claude output', async () => {
    vi.mocked(getResultText).mockReturnValue('  improved description that is long enough  ')
    const result = await improveDescription(makeOpts())
    expect(result).toBe('improved description that is long enough')
  })

  // TP-002 (T2): returns null for null/empty/whitespace result
  it('returns null when getResultText returns null', async () => {
    vi.mocked(getResultText).mockReturnValue(null)
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when getResultText returns empty string', async () => {
    vi.mocked(getResultText).mockReturnValue('')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null for whitespace-only result text', async () => {
    vi.mocked(getResultText).mockReturnValue('   \n\t  ')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  // TP-003 (T3/EC4): returns null for API error patterns and short text
  it('returns null when result starts with "Credit balance"', async () => {
    vi.mocked(getResultText).mockReturnValue('Credit balance is too low to continue')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when result starts with "Rate limit"', async () => {
    vi.mocked(getResultText).mockReturnValue('Rate limit exceeded, please try again later')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when result starts with "Unauthorized"', async () => {
    vi.mocked(getResultText).mockReturnValue('Unauthorized access to the API endpoint')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when result starts with "Internal server error"', async () => {
    vi.mocked(getResultText).mockReturnValue('Internal server error: something went wrong')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('returns null when result is shorter than 20 characters', async () => {
    vi.mocked(getResultText).mockReturnValue('Error occurred')
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  // TP-004 (T4/EC3): truncation and length boundaries
  it('accepts text exactly 20 characters long', async () => { // EC3 boundary
    const text = 'x'.repeat(20)
    vi.mocked(getResultText).mockReturnValue(text)
    expect(await improveDescription(makeOpts())).toBe(text)
  })

  it('rejects text that is 19 characters long', async () => { // EC3 boundary
    vi.mocked(getResultText).mockReturnValue('x'.repeat(19))
    expect(await improveDescription(makeOpts())).toBeNull()
  })

  it('truncates result to 1024 characters when exceeding limit', async () => {
    vi.mocked(getResultText).mockReturnValue('x'.repeat(1500))
    const result = await improveDescription(makeOpts())
    expect(result).toHaveLength(1024)
  })

  it('returns full text when exactly at 1024 characters', async () => {
    const text = 'y'.repeat(1024)
    vi.mocked(getResultText).mockReturnValue(text)
    const result = await improveDescription(makeOpts())
    expect(result).toBe(text)
  })

  // TP-005 (T5/T6): forwards model/debug, includes stderr hint
  it('forwards model to runClaude', async () => {
    await improveDescription(makeOpts({ model: 'sonnet' }))
    expect(vi.mocked(runClaude).mock.calls[0][0].model).toBe('sonnet')
  })

  it('forwards debug flag to runClaude', async () => {
    await improveDescription(makeOpts({ debug: true }))
    expect(vi.mocked(runClaude).mock.calls[0][0].debug).toBe(true)
  })

  it('includes stderr hint in warning when stderr is non-empty', async () => {
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: 'connection timeout' })
    vi.mocked(getResultText).mockReturnValue(null)

    await improveDescription(makeOpts())

    const warningCall = stderrSpy.mock.calls.find(c => String(c[0]).includes('Warning'))
    expect(warningCall).toBeDefined()
    expect(String(warningCall![0])).toContain('(stderr: connection timeout)')
  })

  it('omits stderr hint when stderr is empty', async () => {
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    vi.mocked(getResultText).mockReturnValue(null)

    await improveDescription(makeOpts())

    const warningCall = stderrSpy.mock.calls.find(c => String(c[0]).includes('Warning'))
    expect(warningCall).toBeDefined()
    expect(String(warningCall![0])).not.toContain('(stderr:')
  })

  it('accepts a valid description that mentions errors in context', async () => {
    const desc = 'Review code for error handling patterns, security vulnerabilities, and performance issues in the current codebase.'
    vi.mocked(getResultText).mockReturnValue(desc)
    expect(await improveDescription(makeOpts())).toBe(desc)
  })
})
