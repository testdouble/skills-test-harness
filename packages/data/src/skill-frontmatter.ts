/**
 * Consolidated YAML frontmatter operations for skill and agent definition files.
 * Single canonical implementations for parsing and replacing description fields.
 */

export function parseDescription(frontmatter: string): string {
  // Single-line: description: "value" or description: value
  const singleLine = frontmatter.match(/^description:\s*"((?:[^"\\]|\\.)*)"$/m)
  if (singleLine) return singleLine[1].replace(/\\(.)/g, '$1').trim()

  // Multi-line block scalar: description: > or description: |
  const blockMatch = frontmatter.match(/^description:\s*[>|]-?\s*\n((?:[ \t]+.*(?:\n|$))*)/m)
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map(line => line.replace(/^ {2}/, ''))
      .join('\n')
      .trim()
  }

  // Plain unquoted single-line
  const plainMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (plainMatch) return plainMatch[1].trim()

  return ''
}

export function replaceDescription(frontmatter: string, newDescription: string): string {
  const escaped = newDescription.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const replacement = `description: "${escaped}"`

  // Handle multi-line block scalar (description: > or description: |)
  const blockPattern = /^description:\s*[>|]-?\s*(?:\n[ \t]+[^\n]+)+/m
  if (blockPattern.test(frontmatter)) {
    return frontmatter.replace(blockPattern, () => replacement)
  }

  // Handle single-line (quoted or unquoted)
  return frontmatter.replace(/^description:\s*.+$/m, () => replacement)
}

export function sanitizeForYaml(description: string): string {
  return description
    .replace(/\r?\n/g, ' ')
    .replace(/  +/g, ' ')
    .trim()
}
