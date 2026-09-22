import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorMessage, fetchJson } from './fetch-json.js'

function stubFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJson', () => {
  it('returns the parsed body for an OK response', async () => {
    stubFetch(new Response(JSON.stringify({ runs: [] }), { status: 200 }))

    await expect(fetchJson('/api/scil')).resolves.toEqual({ runs: [] })
  })

  it('requests the given URL', async () => {
    stubFetch(new Response('{}', { status: 200 }))

    await fetchJson('/api/scil')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/scil')
  })

  it("throws the server's error message for a non-OK JSON response", async () => {
    stubFetch(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))

    await expect(fetchJson('/api/scil/bad')).rejects.toThrow('Not found')
  })

  it('throws the status text for a non-OK plain-text response', async () => {
    stubFetch(new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }))

    await expect(fetchJson('/api/scil')).rejects.toThrow('Internal Server Error')
  })

  it('throws the HTTP status when there is no status text or JSON error', async () => {
    stubFetch(new Response('oops', { status: 502 }))

    await expect(fetchJson('/api/scil')).rejects.toThrow('HTTP 502')
  })
})

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('Not found'))).toBe('Not found')
  })

  it('stringifies a non-Error value', () => {
    expect(errorMessage('boom')).toBe('boom')
  })
})
