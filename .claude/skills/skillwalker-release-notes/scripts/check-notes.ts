#!/usr/bin/env bun
// Checks a release-notes draft against the required format. Prints every
// problem found and exits 1, or prints "ok" and exits 0.
// Usage: bun check-notes.ts <draft-file> <X.Y.Z>

const [draftPath, version] = process.argv.slice(2)
if (!draftPath || !version) {
  console.error('usage: bun check-notes.ts <draft-file> <X.Y.Z>')
  process.exit(1)
}

const CATEGORIES = ['New Features', 'Enhancements', 'Bug Fixes', 'Breaking Changes']
const NONE = '- None in this release.'
const problems: string[] = []

const lines = (await Bun.file(draftPath).text()).replace(/\s+$/, '').split('\n')

const heading = new RegExp(`^## v${version.replaceAll('.', '\\.')} - \\d{4}-\\d{2}-\\d{2}$`)
if (!heading.test(lines[0] ?? '')) {
  problems.push(`line 1 must be "## v${version} - YYYY-MM-DD", found "${lines[0] ?? ''}"`)
}

// The summary is every line between the version heading and the first category heading
const firstCategory = lines.findIndex((line) => line.startsWith('### '))
const summary = lines
  .slice(1, firstCategory === -1 ? lines.length : firstCategory)
  .join(' ')
  .trim()
const sentences = summary.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 0)
if (sentences.length < 3 || sentences.length > 5) {
  problems.push(`summary must be 3 to 5 sentences, found ${sentences.length}`)
}
for (const sentence of sentences) {
  const words = sentence.split(/\s+/).length
  if (words < 10 || words > 15) {
    problems.push(`summary sentence has ${words} words (needs 10 to 15): "${sentence}"`)
  }
}

const categoryHeadings = lines.filter((line) => line.startsWith('### ')).map((line) => line.slice(4))
if (categoryHeadings.join('|') !== CATEGORIES.join('|')) {
  problems.push(`category headings must be exactly, in order: ${CATEGORIES.join(', ')}; found: ${categoryHeadings.join(', ')}`)
}

// Walk each category's body: plain bullets, then #### groups of two or more bullets, or the single None line
let category = ''
let items: string[] = []
let group = ''
let groupBullets = 0
let sawGroup = false

function closeGroup() {
  if (group && groupBullets < 2) problems.push(`${category} > "${group}" has ${groupBullets} bullet; a group needs 2 or more`)
  group = ''
  groupBullets = 0
}

function closeCategory() {
  if (!category) return
  closeGroup()
  if (items.length === 0) problems.push(`${category} is empty; write "${NONE}"`)
  if (items.includes(NONE) && items.length > 1) problems.push(`${category} mixes "${NONE}" with other entries`)
}

for (const [index, line] of lines.entries()) {
  if (index < Math.max(firstCategory, 0) || line.trim() === '') continue
  if (line.startsWith('### ')) {
    closeCategory()
    category = line.slice(4)
    items = []
    sawGroup = false
  } else if (line.startsWith('#### ')) {
    closeGroup()
    group = line.slice(5)
    sawGroup = true
    items.push(line)
  } else if (line === NONE) {
    items.push(line)
  } else if (/^- \S.* - \S/.test(line)) {
    if (group) groupBullets++
    else if (sawGroup) problems.push(`${category}: ungrouped bullet after a group; move it above the first group: "${line}"`)
    items.push(line)
  } else {
    problems.push(`line ${index + 1} is not a heading or a "- {thing that changed} - {summary}" bullet: "${line}"`)
  }
}
closeCategory()

if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log('ok')
