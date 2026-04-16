import fs from 'node:fs'
import path from 'node:path'

export function currentDir(meta: ImportMeta): string {
  return (meta as any).dir ?? (meta as any).dirname ?? path.dirname(new URL(meta.url).pathname)
}

export function resolveRelativePath(meta: ImportMeta, sourcePath: string, compiledPath: string): string {
  const dir = currentDir(meta)

  const resolved = dir.includes('$bunfs')
    ? path.resolve(path.dirname(process.execPath), compiledPath)
    : path.resolve(dir, sourcePath)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Resolved path does not exist: ${resolved} (compiled: ${dir.includes('$bunfs')}, dir: ${dir})`)
  }

  return resolved
}
