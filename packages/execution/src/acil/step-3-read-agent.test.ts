import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))
vi.mock('@testdouble/harness-data', () => ({
  parseDescription: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
import { parseDescription } from '@testdouble/harness-data'
import { readAgent } from './step-3-read-agent.js'
import { HarnessError } from '../lib/errors.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readAgent', () => {
  it('parses agent .md with name, description, and body', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: gap-analyzer\ndescription: "Analyzes gaps"\n---\nAgent body content here'
    )
    vi.mocked(parseDescription).mockReturnValue('Analyzes gaps')

    const result = await readAgent('/repo/r-and-d/agents/gap-analyzer.md')

    expect(result.name).toBe('gap-analyzer')
    expect(result.description).toBe('Analyzes gaps')
    expect(result.body).toBe('Agent body content here')
  })

  it('returns empty name when no name field in frontmatter', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\ndescription: "No name agent"\n---\nBody'
    )
    vi.mocked(parseDescription).mockReturnValue('No name agent')

    const result = await readAgent('/path/to/agent.md')

    expect(result.name).toBe('')
    expect(result.description).toBe('No name agent')
  })

  it('throws HarnessError when no frontmatter found', async () => {
    vi.mocked(readFile).mockResolvedValue('No frontmatter here')

    await expect(readAgent('/path/to/agent.md'))
      .rejects.toThrow(HarnessError)
  })

  it('trims leading whitespace from body', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: test\ndescription: "test"\n---\n\n  Body with leading space'
    )
    vi.mocked(parseDescription).mockReturnValue('test')

    const result = await readAgent('/path/to/agent.md')

    expect(result.body).toBe('Body with leading space')
  })

  it('parses frontmatter with CRLF line endings', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\r\nname: gap-analyzer\r\ndescription: "Analyzes gaps"\r\n---\r\nAgent body content here'
    )
    vi.mocked(parseDescription).mockReturnValue('Analyzes gaps')

    const result = await readAgent('/repo/r-and-d/agents/gap-analyzer.md')

    expect(result.name).toBe('gap-analyzer')
    expect(result.description).toBe('Analyzes gaps')
    expect(result.body).toBe('Agent body content here')
  })

  it('handles quoted name values', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '---\nname: "quoted-name"\ndescription: "desc"\n---\nBody'
    )
    vi.mocked(parseDescription).mockReturnValue('desc')

    const result = await readAgent('/path/to/agent.md')

    expect(result.name).toBe('quoted-name')
  })
})
