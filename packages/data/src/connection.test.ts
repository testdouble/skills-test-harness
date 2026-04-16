import { beforeEach, describe, expect, it } from 'vitest'
import { _cacheSize, _resetCache, withConnection } from './connection.js'

beforeEach(() => {
  _resetCache()
})

describe('withConnection', () => {
  it('executes the callback and returns its result', async () => {
    const result = await withConnection(':memory:', async (conn) => {
      const rows = (await conn.runAndReadAll('SELECT 42 AS val')).getRowObjects()
      return (rows[0] as { val: number }).val
    })
    expect(result).toBe(42)
  })

  it('reuses the same instance for repeated calls with the same dataDir', async () => {
    await withConnection('dir-a', async (conn) => {
      await conn.runAndReadAll('SELECT 1')
    })
    await withConnection('dir-a', async (conn) => {
      await conn.runAndReadAll('SELECT 2')
    })
    expect(_cacheSize()).toBe(1)
  })

  it('creates separate instances for different dataDirs', async () => {
    await withConnection('dir-a', async (conn) => {
      await conn.runAndReadAll('SELECT 1')
    })
    await withConnection('dir-b', async (conn) => {
      await conn.runAndReadAll('SELECT 1')
    })
    expect(_cacheSize()).toBe(2)
  })

  it('propagates errors from the callback', async () => {
    await expect(
      withConnection(':memory:', async () => {
        throw new Error('callback error')
      }),
    ).rejects.toThrow('callback error')
  })
})
