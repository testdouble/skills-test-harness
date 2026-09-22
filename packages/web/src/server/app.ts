import { Hono } from 'hono'
import { getAcilHistory, getAcilRunById } from './routes/acil.js'
import { getPerTestAnalytics } from './routes/analytics.js'
import { jsonErrorHandler } from './routes/error-handler.js'
import { getScilHistory, getScilRunById } from './routes/scil.js'
import { getTestRunById, getTestRuns } from './routes/test-runs.js'

// API routes only — static client assets are added by the entry point, which embeds them at compile time.
export function createApp(dataDir: string): Hono {
  const app = new Hono()

  app.onError(jsonErrorHandler)

  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/test-runs', (c) => getTestRuns(c, dataDir))
  app.get('/api/test-runs/:runId', (c) => getTestRunById(c, dataDir))
  app.get('/api/analytics/per-test', (c) => getPerTestAnalytics(c, dataDir))
  app.get('/api/scil', (c) => getScilHistory(c, dataDir))
  app.get('/api/scil/:runId', (c) => getScilRunById(c, dataDir))
  app.get('/api/acil', (c) => getAcilHistory(c, dataDir))
  app.get('/api/acil/:runId', (c) => getAcilRunById(c, dataDir))

  return app
}
