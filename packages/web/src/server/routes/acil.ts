import { InvalidRunIdError, queryAcilHistory, queryAcilRunDetails } from '@testdouble/skillwalker-data'
import type { Context } from 'hono'

export async function getAcilHistory(c: Context, dataDir: string): Promise<Response> {
  const runs = await queryAcilHistory(dataDir)
  return c.json({ runs })
}

export async function getAcilRunById(c: Context, dataDir: string): Promise<Response> {
  const runId = c.req.param('runId') ?? ''
  try {
    const { summary, iterations } = await queryAcilRunDetails(dataDir, runId)
    return c.json({ summary, iterations })
  } catch (err) {
    if (err instanceof InvalidRunIdError || (err instanceof Error && err.message.startsWith('ACIL run not found:'))) {
      return c.json({ error: 'Not found' }, 404)
    }
    throw err
  }
}
