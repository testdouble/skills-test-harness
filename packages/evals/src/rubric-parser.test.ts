import { describe, it, expect } from 'vitest'
import { parseRubricSections, parseRubricCriteria } from './rubric-parser.js'

describe('parseRubricSections', () => {
  it('parses transcript-only rubric (existing format)', () => {
    const markdown = `## Rubric: quality check

### Presence — things the output must contain
- The agent reports the file path
- The agent completes without errors

### Depth
- The analysis explains remediation steps
`
    const sections = parseRubricSections(markdown)
    expect(sections).toHaveLength(1)
    expect(sections[0].type).toBe('transcript')
    expect(sections[0].filePath).toBeUndefined()
    expect(sections[0].criteria).toEqual([
      'The agent reports the file path',
      'The agent completes without errors',
      'The analysis explains remediation steps',
    ])
  })

  it('parses file-only rubric', () => {
    const markdown = `## File: docs/gap-analysis.md
### Presence
- The analysis identifies missing password hashing
- The analysis references specific file paths
`
    const sections = parseRubricSections(markdown)
    expect(sections).toHaveLength(1)
    expect(sections[0].type).toBe('file')
    expect(sections[0].filePath).toBe('docs/gap-analysis.md')
    expect(sections[0].criteria).toEqual([
      'The analysis identifies missing password hashing',
      'The analysis references specific file paths',
    ])
  })

  it('parses mixed rubric with transcript and file sections', () => {
    const markdown = `## Rubric: gap-analyzer quality

### Presence — things the output must contain
- The agent reports the file path where the analysis was written
- The agent completes without errors

## File: docs/gap-analysis.md
### Presence
- The analysis identifies that Rails lacks password hashing
- The analysis references specific file paths

### Depth
- The analysis explains how to remediate each gap
`
    const sections = parseRubricSections(markdown)
    expect(sections).toHaveLength(2)

    expect(sections[0].type).toBe('transcript')
    expect(sections[0].criteria).toEqual([
      'The agent reports the file path where the analysis was written',
      'The agent completes without errors',
    ])

    expect(sections[1].type).toBe('file')
    expect(sections[1].filePath).toBe('docs/gap-analysis.md')
    expect(sections[1].criteria).toEqual([
      'The analysis identifies that Rails lacks password hashing',
      'The analysis references specific file paths',
      'The analysis explains how to remediate each gap',
    ])
  })

  it('parses multiple file sections', () => {
    const markdown = `## File: docs/mission-brief.md
- Contains client name and engagement objectives

## File: docs/lead-working-brief.md
- Contains technical approach

## File: docs/engagement-plan.md
- Contains staffing recommendations
`
    const sections = parseRubricSections(markdown)
    expect(sections).toHaveLength(3)

    expect(sections[0]).toEqual({
      type: 'file',
      filePath: 'docs/mission-brief.md',
      criteria: ['Contains client name and engagement objectives'],
    })
    expect(sections[1]).toEqual({
      type: 'file',
      filePath: 'docs/lead-working-brief.md',
      criteria: ['Contains technical approach'],
    })
    expect(sections[2]).toEqual({
      type: 'file',
      filePath: 'docs/engagement-plan.md',
      criteria: ['Contains staffing recommendations'],
    })
  })

  it('returns empty array for rubric with no criteria', () => {
    const markdown = `## Rubric: empty

### Presence
(no bullets here)
`
    const sections = parseRubricSections(markdown)
    expect(sections).toEqual([])
  })

  it('skips empty bullet lines', () => {
    const markdown = `## Rubric: test
- valid criterion
-
- another valid criterion
`
    const sections = parseRubricSections(markdown)
    expect(sections).toHaveLength(1)
    expect(sections[0].criteria).toEqual([
      'valid criterion',
      'another valid criterion',
    ])
  })
})

describe('parseRubricCriteria (backward-compatible wrapper)', () => {
  it('flattens all sections into a single criteria list', () => {
    const markdown = `## Rubric: quality
- transcript criterion one

## File: docs/output.md
- file criterion one
- file criterion two
`
    const criteria = parseRubricCriteria(markdown)
    expect(criteria).toEqual([
      'transcript criterion one',
      'file criterion one',
      'file criterion two',
    ])
  })

  it('returns empty array for empty rubric', () => {
    expect(parseRubricCriteria('no bullets here')).toEqual([])
  })
})
