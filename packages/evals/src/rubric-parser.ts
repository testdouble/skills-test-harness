export interface RubricSection {
  type: 'transcript' | 'file'
  filePath?: string
  criteria: string[]
}

const FILE_HEADER_RE = /^## File:\s*(.+)$/

export function parseRubricSections(markdown: string): RubricSection[] {
  const lines = markdown.split('\n')
  const sections: RubricSection[] = []
  let current: RubricSection = { type: 'transcript', criteria: [] }

  for (const line of lines) {
    const fileMatch = line.match(FILE_HEADER_RE)
    if (fileMatch) {
      // Push previous section if it has criteria
      if (current.criteria.length > 0) {
        sections.push(current)
      }
      current = { type: 'file', filePath: fileMatch[1].trim(), criteria: [] }
      continue
    }

    // Any other heading is a subsection within the current context — skip it
    // Collect criteria lines
    const trimmed = line.trimStart()
    if (trimmed.startsWith('- ')) {
      const criterion = trimmed.slice(2).trim()
      if (criterion.length > 0) {
        current.criteria.push(criterion)
      }
    }
  }

  // Push the last section
  if (current.criteria.length > 0) {
    sections.push(current)
  }

  return sections
}

/** Backward-compatible wrapper: flattens all sections into a single criteria list. */
export function parseRubricCriteria(markdown: string): string[] {
  return parseRubricSections(markdown).flatMap(s => s.criteria)
}
