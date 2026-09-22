import { queryPerTest } from '@testdouble/skillwalker-data'
import type { Context } from 'hono'

export async function getPerTestAnalytics(c: Context, dataDir: string): Promise<Response> {
  let rows = await queryPerTest(dataDir)
  const evalName = c.req.query('eval')
  if (evalName) {
    rows = rows.filter((r) => r.eval === evalName)
  }
  return c.json({ rows })
}
