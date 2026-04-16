import { queryScilHistory, queryScilRunDetails } from '@testdouble/harness-data'
import type { Context } from 'hono'

export async function getScilHistory(c: Context, dataDir: string): Promise<Response> {
  try {
    const runs = await queryScilHistory(dataDir)
    return c.json({ runs })
  } catch (err) {
    if (err instanceof Error && err.message.includes('No such file or directory')) {
      return c.json({ runs: [] })
    }
    throw err
  }
}

export async function getScilRunById(c: Context, dataDir: string): Promise<Response> {
  const runId = c.req.param('runId') ?? ''
  try {
    const { summary, iterations } = await queryScilRunDetails(dataDir, runId)
    return c.json({ summary, iterations })
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.startsWith('SCIL run not found:') || err.message.includes('No such file or directory'))
    ) {
      return c.json({ error: 'Not found' }, 404)
    }
    throw err
  }
}
