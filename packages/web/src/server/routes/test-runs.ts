import type { Context } from 'hono'
import { queryTestRunSummaries, queryTestRunDetails } from '@testdouble/harness-data'

export async function getTestRuns(c: Context, dataDir: string): Promise<Response> {
  const runs = await queryTestRunSummaries(dataDir)
  return c.json({ runs })
}

export async function getTestRunById(c: Context, dataDir: string): Promise<Response> {
  const runId = c.req.param('runId') ?? ''
  try {
    const { summary, expectations, llmJudgeGroups, outputFiles } = await queryTestRunDetails(dataDir, runId)
    return c.json({ summary, expectations, llmJudgeGroups, outputFiles })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Test run not found:')) {
      return c.json({ error: 'Not found' }, 404)
    }
    throw err
  }
}
