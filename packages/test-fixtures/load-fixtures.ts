import { cp } from 'node:fs/promises'
import path from 'node:path'
import { currentDir } from '@testdouble/bun-helpers'

const FIXTURES_DIR = currentDir(import.meta)

export async function loadFixtures(fixtureName: string, tmpOutputDir: string): Promise<void> {
  const src = path.join(FIXTURES_DIR, fixtureName)
  await cp(src, tmpOutputDir, { recursive: true })
}
