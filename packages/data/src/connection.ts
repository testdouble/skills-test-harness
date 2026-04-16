import { DuckDBInstance } from '@duckdb/node-api'

const instanceCache = new Map<string, DuckDBInstance>()

async function getInstance(dataDir: string): Promise<DuckDBInstance> {
  let instance = instanceCache.get(dataDir)
  if (!instance) {
    instance = await DuckDBInstance.create(':memory:')
    instanceCache.set(dataDir, instance)
  }
  return instance
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withConnection<T>(dataDir: string, fn: (conn: any) => Promise<T>): Promise<T> {
  const instance = await getInstance(dataDir)
  const conn = await instance.connect()
  try {
    return await fn(conn)
  } finally {
    conn.closeSync()
  }
}

/** Visible for testing only — clears the instance cache. */
export function _resetCache(): void {
  instanceCache.clear()
}

/** Visible for testing only — returns the number of cached instances. */
export function _cacheSize(): number {
  return instanceCache.size
}
