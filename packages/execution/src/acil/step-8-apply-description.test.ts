import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@testdouble/harness-data', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual }
})

import { readFile, writeFile } from 'node:fs/promises'
import { HarnessError } from '../lib/errors.js'
import { applyDescription } from './step-8-apply-description.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('applyDescription (ACIL)', () => {
  // TP-006 (T7): replaces description in agent frontmatter
  it('replaces a quoted description in agent frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: gap-analyzer\ndescription: "old agent description"\nmodel: opus\n---\n\nAgent body content',
    )

    await applyDescription('/repo/r-and-d/agents/gap-analyzer.md', 'new agent description')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "new agent description"')
    expect(written).not.toContain('old agent description')
  })

  it('preserves other frontmatter fields', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: gap-analyzer\ndescription: "old"\nmodel: opus\n---\n\nBody')

    await applyDescription('/agent.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('name: gap-analyzer')
    expect(written).toContain('model: opus')
  })

  // TP-007 (T8): throws on no frontmatter
  it('throws HarnessError when no frontmatter found', async () => {
    vi.mocked(readFile).mockResolvedValue('No frontmatter here, just text')

    await expect(applyDescription('/agent.md', 'new')).rejects.toThrow(HarnessError)
  })

  it('throws HarnessError with file path in message when no frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue('No frontmatter')

    await expect(applyDescription('/repo/agents/gap-analyzer.md', 'new')).rejects.toThrow(/gap-analyzer\.md/)
  })

  // TP-008 (T9): throws on no description field in frontmatter
  it('throws HarnessError when frontmatter has no description field', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: gap-analyzer\nmodel: opus\n---\n\nBody')

    await expect(applyDescription('/agent.md', 'new')).rejects.toThrow(HarnessError)
  })

  it('throws HarnessError with file path when description field missing', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: my-agent\n---\n\nBody')

    await expect(applyDescription('/repo/agents/my-agent.md', 'new')).rejects.toThrow(/my-agent\.md/)
  })

  // TP-009 (T10/T11): preserves body and uses correct path
  it('preserves body content after frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: gap-analyzer\ndescription: "old"\n---\n\n# Agent Instructions\n\nDo the analysis.',
    )

    await applyDescription('/agent.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('# Agent Instructions')
    expect(written).toContain('Do the analysis.')
  })

  it('reads from and writes to the correct file path', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/repo/r-and-d/agents/gap-analyzer.md', 'new')

    expect(vi.mocked(readFile)).toHaveBeenCalledWith('/repo/r-and-d/agents/gap-analyzer.md', 'utf-8')
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      '/repo/r-and-d/agents/gap-analyzer.md',
      expect.any(String),
      'utf-8',
    )
  })

  it('handles CRLF line endings in frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue('---\r\ndescription: "old"\r\n---\r\n\r\nBody')

    await applyDescription('/agent.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "new"')
    expect(written).not.toContain('old')
  })

  it('maintains proper frontmatter delimiters', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/agent.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toMatch(/^---\n/)
    expect(written).toMatch(/\n---\n/)
  })
})
