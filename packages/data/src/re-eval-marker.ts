import path from 'node:path'
import { readFile, writeFile, unlink } from 'node:fs/promises'

const MARKER_FILE = '.re-evaluated-runs.json'

function markerPath(outputDir: string): string {
  return path.join(outputDir, MARKER_FILE)
}

export async function getReEvaluatedRuns(outputDir: string): Promise<string[]> {
  try {
    const content = await readFile(markerPath(outputDir), 'utf8')
    return JSON.parse(content) as string[]
  } catch {
    return []
  }
}

export async function markAsReEvaluated(outputDir: string, runId: string): Promise<void> {
  const existing = await getReEvaluatedRuns(outputDir)
  if (!existing.includes(runId)) {
    existing.push(runId)
    await writeFile(markerPath(outputDir), JSON.stringify(existing), 'utf8')
  }
}

export async function clearReEvaluatedRuns(outputDir: string, runIds: string[]): Promise<void> {
  if (runIds.length === 0) return
  const existing = await getReEvaluatedRuns(outputDir)
  const remaining = existing.filter(id => !runIds.includes(id))
  if (remaining.length === 0) {
    try {
      await unlink(markerPath(outputDir))
    } catch {
      // file may already be gone
    }
  } else {
    await writeFile(markerPath(outputDir), JSON.stringify(remaining), 'utf8')
  }
}
