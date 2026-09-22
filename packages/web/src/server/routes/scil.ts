import { InvalidRunIdError, queryScilHistory, queryScilRunDetails } from '@testdouble/skillwalker-data'
import type { Context } from 'hono'

export async function getScilHistory(c: Context, dataDir: string): Promise<Response> {
  const runs = await queryScilHistory(dataDir)
  return c.json({ runs })
}

export async function getScilRunById(c: Context, dataDir: string): Promise<Response> {
  const runId = c.req.param('runId') ?? ''
  try {
    const { summary, iterations } = await queryScilRunDetails(dataDir, runId)
    return c.json({ summary, iterations })
  } catch (err) {
    if (err instanceof InvalidRunIdError || (err instanceof Error && err.message.startsWith('SCIL run not found:'))) {
      return c.json({ error: 'Not found' }, 404)
    }
    throw err
  }
}
