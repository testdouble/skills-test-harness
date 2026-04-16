import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
import { HarnessError } from '../lib/errors.js'
import { readSkill } from './step-3-read-skill.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readSkill', () => {
  it('parses name and description from standard quoted frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "my-skill"
description: "A description"
---

Body text.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.name).toBe('my-skill')
    expect(result.description).toBe('A description')
    expect(result.body).toBe('Body text.')
    expect(result.frontmatterRaw).toContain('name: "my-skill"')
    expect(result.fullContent).toContain('---')
  })

  it('throws when no frontmatter is present', async () => {
    vi.mocked(readFile).mockResolvedValue('No frontmatter here.' as any)
    await expect(readSkill('/path/SKILL.md')).rejects.toThrow(HarnessError)
  })

  it('parses multi-line block scalar description (folded > style)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "investigate"
description: >
  Line one
  Line two
allowed-tools: Read
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.description).toBe('Line one\nLine two')
  })

  it('parses multi-line block scalar description (literal | style)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "investigate"
description: |
  Line one
  Line two
allowed-tools: Read
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.description).toBe('Line one\nLine two')
  })

  it('parses unquoted single-line description', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "my-skill"
description: Some unquoted text
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.description).toBe('Some unquoted text')
  })

  it('returns empty description when no description field exists', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "my-skill"
allowed-tools: Read
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.description).toBe('')
  })

  it('returns empty name when no name field exists', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
description: "A description"
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.name).toBe('')
  })

  it('trims leading whitespace from body after frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "my-skill"
description: "desc"
---



  Body text.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.body).toBe('Body text.')
  })

  it('handles block scalar with chomp indicator (>-)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---
name: "my-skill"
description: >-
  Stripped trailing newline
allowed-tools: Read
---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.description).toBe('Stripped trailing newline')
  })

  it('returns empty fields for frontmatter with no content', async () => {
    vi.mocked(readFile).mockResolvedValue(
      `---

---

Body.` as any,
    )

    const result = await readSkill('/path/SKILL.md')
    expect(result.name).toBe('')
    expect(result.description).toBe('')
    expect(result.body).toBe('Body.')
  })

  it('preserves fullContent as the original file content', async () => {
    const content = `---
name: "test"
description: "desc"
---

Body here.`
    vi.mocked(readFile).mockResolvedValue(content as any)

    const result = await readSkill('/path/SKILL.md')
    expect(result.fullContent).toBe(content)
  })
})
