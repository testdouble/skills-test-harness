import path from 'node:path'
import { Hono } from 'hono'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import indexCss from '../../dist/client/index.css' with { type: 'file' }
// Embedded client files — resolved to $bunfs paths when compiled as a standalone executable
import _indexHtml from '../../dist/client/index.html' with { type: 'file' }
import indexJs from '../../dist/client/index.js' with { type: 'file' }
import { getAcilHistory, getAcilRunById } from './routes/acil'
import { getPerTestAnalytics } from './routes/analytics'
import { getScilHistory, getScilRunById } from './routes/scil'
import { getTestRunById, getTestRuns } from './routes/test-runs'

// default port
const DEFAULT_PORT = 3099

// bun-types types HTML file embeds as HTMLBundle, but { type: "file" } returns a string path at runtime
const indexHtml = _indexHtml as unknown as string

const argv = await yargs(hideBin(Bun.argv))
  .scriptName('harness-web')
  .option('port', {
    type: 'number',
    description: 'Port to listen on',
    default: DEFAULT_PORT,
  })
  .option('data-dir', {
    type: 'string',
    description: 'Path to analytics data directory',
    default: path.resolve(process.cwd(), 'analytics'),
  })
  .strict()
  .showHelpOnFail(true)
  .parse()

const port = argv.port
const dataDir = argv['data-dir']

const app = new Hono()

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.get('/api/test-runs', (c) => getTestRuns(c, dataDir))
app.get('/api/test-runs/:runId', (c) => getTestRunById(c, dataDir))
app.get('/api/analytics/per-test', (c) => getPerTestAnalytics(c, dataDir))
app.get('/api/scil', (c) => getScilHistory(c, dataDir))
app.get('/api/scil/:runId', (c) => getScilRunById(c, dataDir))
app.get('/api/acil', (c) => getAcilHistory(c, dataDir))
app.get('/api/acil/:runId', (c) => getAcilRunById(c, dataDir))

// Serve embedded static assets
app.get('/index.js', () => new Response(Bun.file(indexJs)))
app.get('/index.css', () => new Response(Bun.file(indexCss)))

// SPA fallback — serve index.html for all unmatched paths
app.get('/*', () => new Response(Bun.file(indexHtml)))

Bun.serve({ fetch: app.fetch, port })
console.log(`harness-web listening on port ${port}`)
