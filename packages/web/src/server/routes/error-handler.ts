import type { Context } from 'hono'

// Hono's default handler answers with plain text, which the client cannot parse as JSON.
export function jsonErrorHandler(err: Error, c: Context): Response {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
}
