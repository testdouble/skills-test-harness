import { describe, it, expect } from 'vitest'
import { parseDescription, replaceDescription, sanitizeForYaml } from './skill-frontmatter.js'

describe('parseDescription', () => {
  it('parses a quoted single-line description', () => {
    expect(parseDescription('name: "my-skill"\ndescription: "A description"')).toBe('A description')
  })

  it('parses an unquoted single-line description', () => {
    expect(parseDescription('name: "my-skill"\ndescription: Some unquoted text')).toBe('Some unquoted text')
  })

  it('parses a folded block scalar (>)', () => {
    const fm = 'name: "test"\ndescription: >\n  Line one\n  Line two\nallowed-tools: Read'
    expect(parseDescription(fm)).toBe('Line one\nLine two')
  })

  it('parses a literal block scalar (|)', () => {
    const fm = 'name: "test"\ndescription: |\n  Line one\n  Line two\nallowed-tools: Read'
    expect(parseDescription(fm)).toBe('Line one\nLine two')
  })

  it('parses block scalar with chomp indicator (>-)', () => {
    const fm = 'name: "test"\ndescription: >-\n  Stripped trailing newline\nallowed-tools: Read'
    expect(parseDescription(fm)).toBe('Stripped trailing newline')
  })

  it('returns empty string when no description field exists', () => {
    expect(parseDescription('name: "my-skill"\nallowed-tools: Read')).toBe('')
  })

  it('returns empty string for empty frontmatter', () => {
    expect(parseDescription('')).toBe('')
  })
})

describe('replaceDescription', () => {
  it('replaces a quoted single-line description', () => {
    const fm = 'name: "my-skill"\ndescription: "old description"'
    const result = replaceDescription(fm, 'new description')
    expect(result).toContain('description: "new description"')
    expect(result).not.toContain('old description')
  })

  it('replaces an unquoted single-line description', () => {
    const fm = 'name: my-skill\ndescription: old description here'
    const result = replaceDescription(fm, 'new description')
    expect(result).toContain('description: "new description"')
    expect(result).not.toContain('old description here')
  })

  it('replaces a multi-line block scalar description', () => {
    const fm = 'name: my-skill\ndescription: >\n  This is a long\n  multi-line description\nallowed-tools: Read'
    const result = replaceDescription(fm, 'replaced')
    expect(result).toContain('description: "replaced"')
    expect(result).not.toContain('multi-line description')
  })

  it('replaces block scalar with pipe indicator', () => {
    const fm = 'name: my-skill\ndescription: |\n  Line one\n  Line two\nallowed-tools: Read'
    const result = replaceDescription(fm, 'replaced')
    expect(result).toContain('description: "replaced"')
    expect(result).not.toContain('Line one')
  })

  it('escapes double quotes in the description', () => {
    const fm = 'description: "old"'
    const result = replaceDescription(fm, 'Use for "important" tasks')
    expect(result).toContain('description: "Use for \\"important\\" tasks"')
  })

  it('escapes backslashes in the description', () => {
    const fm = 'description: "old"'
    const result = replaceDescription(fm, 'path\\to\\thing')
    expect(result).toContain('description: "path\\\\to\\\\thing"')
  })

  it('handles dollar signs without regex substitution issues', () => {
    const fm = 'description: "old"'
    const result = replaceDescription(fm, 'Costs $100 or $& more')
    expect(result).toContain('Costs $100 or $& more')
  })

  it('preserves other frontmatter fields', () => {
    const fm = 'name: "my-skill"\ndescription: "old"\nallowed-tools: Read, Grep'
    const result = replaceDescription(fm, 'new')
    expect(result).toContain('name: "my-skill"')
    expect(result).toContain('allowed-tools: Read, Grep')
  })
})

describe('parseDescription — agent .md files', () => {
  const agentFrontmatter = `name: gap-analyzer
description: "Assumes gaps exist until proven otherwise. Systematically compares a current state against a desired state."
tools: Read, Glob, Grep
model: opus`

  it('extracts description from agent .md frontmatter', () => {
    const desc = parseDescription(agentFrontmatter)
    expect(desc).toBe('Assumes gaps exist until proven otherwise. Systematically compares a current state against a desired state.')
  })

  it('round-trips replaceDescription on agent frontmatter', () => {
    const newDesc = 'Compares two system representations to find gaps.'
    const updated = replaceDescription(agentFrontmatter, newDesc)
    expect(parseDescription(updated)).toBe(newDesc)
    expect(updated).toContain('name: gap-analyzer')
    expect(updated).toContain('model: opus')
  })

  it('replaceDescription escapes quotes in agent descriptions', () => {
    const newDesc = 'Use for "gap analysis" tasks'
    const updated = replaceDescription(agentFrontmatter, newDesc)
    expect(updated).toContain('description: "Use for \\"gap analysis\\" tasks"')
  })
})

describe('sanitizeForYaml — agent description edge cases', () => {
  it('collapses multi-line agent descriptions to single line', () => {
    const multiLine = 'Assumes gaps exist.\nCompares current vs desired state.\nWrites analysis to file.'
    expect(sanitizeForYaml(multiLine)).toBe('Assumes gaps exist. Compares current vs desired state. Writes analysis to file.')
  })

  it('handles colons in agent descriptions', () => {
    expect(sanitizeForYaml('Use when: comparing two systems')).toBe('Use when: comparing two systems')
  })
})

// TP-005 (EC4) — parseDescription with escaped quotes
describe('parseDescription — escaped quotes', () => {
  it('unescapes backslash-escaped quotes in description', () => {
    const fm = 'description: "Use for \\"gap\\" tasks"'
    const result = parseDescription(fm)
    expect(result).toBe('Use for "gap" tasks')
  })

  it('round-trips parseDescription through replaceDescription with quoted content', () => {
    const original = 'description: "old desc"'
    const withQuotes = 'Use for "gap analysis" tasks'
    const updated = replaceDescription(original, withQuotes)
    expect(parseDescription(updated)).toBe(withQuotes)
  })

  it('round-trips content with both backslashes and quotes', () => {
    const original = 'description: "old desc"'
    const complex = 'path\\to\\"quoted\\" thing'
    const updated = replaceDescription(original, complex)
    expect(parseDescription(updated)).toBe(complex)
  })
})

// TP-006 (EC8) — replaceDescription when no description field exists
describe('replaceDescription — missing description field', () => {
  it('returns original frontmatter unchanged when no description field exists', () => {
    const fm = 'name: my-agent\nmodel: opus'
    const result = replaceDescription(fm, 'new desc')
    expect(result).toBe(fm)
  })
})

describe('sanitizeForYaml', () => {
  it('converts newlines to spaces', () => {
    expect(sanitizeForYaml('line one\nline two')).toBe('line one line two')
  })

  it('collapses multiple spaces', () => {
    expect(sanitizeForYaml('too   many   spaces')).toBe('too many spaces')
  })

  it('trims whitespace', () => {
    expect(sanitizeForYaml('  padded  ')).toBe('padded')
  })

  it('handles combined newlines and spaces', () => {
    expect(sanitizeForYaml('line one\n  line two\n  line three')).toBe('line one line two line three')
  })

  // TP-008 (EC9) — carriage return handling
  it('strips carriage returns from Windows-style line endings', () => {
    expect(sanitizeForYaml('line one\r\nline two')).toBe('line one line two')
  })
})
