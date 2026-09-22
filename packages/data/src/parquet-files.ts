import { existsSync } from 'node:fs'

export function parquetFile(dataDir: string, name: string): string {
  return `${dataDir}/${name}.parquet`
}

// Parquet files are written independently by updateAllParquet, so any of them
// may be absent — no data yet, or a table with no source JSONL.
export function hasParquet(dataDir: string, name: string): boolean {
  return existsSync(parquetFile(dataDir, name))
}
