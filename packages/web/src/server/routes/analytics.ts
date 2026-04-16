import type { Context } from 'hono'
import { queryPerTest } from '@testdouble/harness-data'

export async function getPerTestAnalytics(c: Context, dataDir: string): Promise<Response> {
  let rows = await queryPerTest(dataDir)
  const suite = c.req.query('suite')
  if (suite) {
    rows = rows.filter(r => r.suite === suite)
  }
  return c.json({ rows })
}
