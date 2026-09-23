#!/usr/bin/env bun
// Prepends a release-notes draft to CHANGELOG.md in the repository root,
// creating the file if needed. Existing release sections are copied through
// untouched, and the result is verified byte for byte before it is written.
// Usage: bun prepend-notes.ts <draft-file> <X.Y.Z>
import { existsSync } from 'node:fs'
import path from 'node:path'

const [draftPath, version] = process.argv.slice(2)
if (!draftPath || !version) {
  console.error('usage: bun prepend-notes.ts <draft-file> <X.Y.Z>')
  process.exit(1)
}

const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim()
const changelogPath = path.join(root, 'CHANGELOG.md')
const HEADER = '# Changelog\n\nAll notable changes to Skillwalker are listed here, newest release first.\n'

const existing = existsSync(changelogPath) ? await Bun.file(changelogPath).text() : HEADER
if (existing.split('\n').some((line) => line.startsWith(`## v${version} `))) {
  console.error(`CHANGELOG.md already has a section for v${version}. Old release notes are never changed.`)
  process.exit(1)
}

// Everything from the first release heading on is old release notes
const firstRelease = existing.search(/^## /m)
const header = firstRelease === -1 ? existing : existing.slice(0, firstRelease)
const oldNotes = firstRelease === -1 ? '' : existing.slice(firstRelease)

const draft = `${(await Bun.file(draftPath).text()).trim()}\n`
const updated = `${header.trimEnd()}\n\n${draft}${oldNotes ? `\n${oldNotes}` : ''}`

if (!updated.endsWith(oldNotes) || !updated.startsWith(header.trimEnd())) {
  console.error('Refusing to write: the old release notes would not be preserved exactly.')
  process.exit(1)
}

await Bun.write(changelogPath, updated)
console.log(`prepended v${version} to ${changelogPath}`)
