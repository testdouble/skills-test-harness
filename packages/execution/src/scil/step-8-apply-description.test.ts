import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

import { readFile, writeFile } from 'node:fs/promises'
import { HarnessError } from '../lib/errors.js'
import { applyDescription } from './step-8-apply-description.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('applyDescription', () => {
  it('replaces a single-line quoted description', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: "my-skill"\ndescription: "old description"\n---\n\nBody text')

    await applyDescription('/skill/SKILL.md', 'new description')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "new description"')
    expect(written).not.toContain('old description')
  })

  it('replaces a single-line unquoted description', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: my-skill\ndescription: old description here\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'new description')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "new description"')
    expect(written).not.toContain('old description here')
  })

  it('replaces a multi-line block scalar description', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: my-skill\ndescription: >\n  This is a long\n  multi-line description\nallowed-tools: Read\n---\n\nBody',
    )

    await applyDescription('/skill/SKILL.md', 'replaced')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "replaced"')
    expect(written).not.toContain('multi-line description')
  })

  it('preserves the body after frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\n# Step 1\n\nDo the thing.')

    await applyDescription('/skill/SKILL.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('# Step 1')
    expect(written).toContain('Do the thing.')
  })

  it('preserves other frontmatter fields', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: "my-skill"\ndescription: "old"\nallowed-tools: Read, Grep\n---\n\nBody',
    )

    await applyDescription('/skill/SKILL.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('name: "my-skill"')
    expect(written).toContain('allowed-tools: Read, Grep')
  })

  it('throws when no frontmatter is found', async () => {
    vi.mocked(readFile).mockResolvedValue('No frontmatter here')

    await expect(applyDescription('/skill/SKILL.md', 'new')).rejects.toThrow(HarnessError)
  })

  it('reads from and writes to the correct file path', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/some/path/SKILL.md', 'new')

    expect(vi.mocked(readFile)).toHaveBeenCalledWith('/some/path/SKILL.md', 'utf-8')
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith('/some/path/SKILL.md', expect.any(String), 'utf-8')
  })

  it('wraps the new description in quotes', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: unquoted old\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'new desc')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toMatch(/description: "new desc"/)
  })

  it('handles block scalar with pipe indicator', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: my-skill\ndescription: |\n  Line one\n  Line two\nallowed-tools: Read\n---\n\nBody',
    )

    await applyDescription('/skill/SKILL.md', 'replaced')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "replaced"')
    expect(written).not.toContain('Line one')
  })

  it('maintains proper frontmatter delimiters', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'new')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toMatch(/^---\n/)
    expect(written).toMatch(/\n---\n/)
  })

  it('escapes double quotes in the description', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'Use for "important" tasks')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "Use for \\"important\\" tasks"')
  })

  it('handles dollar signs in description without regex substitution', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'Costs $100 or $& more')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('Costs $100 or $& more')
  })

  it('escapes backslashes in the description', async () => {
    vi.mocked(readFile).mockResolvedValue('---\ndescription: "old"\n---\n\nBody')

    await applyDescription('/skill/SKILL.md', 'path\\to\\thing')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "path\\\\to\\\\thing"')
  })

  it('throws when frontmatter has no description field', async () => {
    vi.mocked(readFile).mockResolvedValue('---\nname: "my-skill"\nallowed-tools: Read\n---\n\nBody')

    await expect(applyDescription('/skill/SKILL.md', 'new')).rejects.toThrow(HarnessError)
  })

  it('handles block scalar with chomping indicator >-', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: my-skill\ndescription: >-\n  Line one\n  Line two\nallowed-tools: Read\n---\n\nBody',
    )

    await applyDescription('/skill/SKILL.md', 'replaced')

    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('description: "replaced"')
    expect(written).not.toContain('Line one')
  })
})
