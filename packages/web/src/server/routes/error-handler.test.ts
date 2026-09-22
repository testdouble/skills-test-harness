import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonErrorHandler } from './error-handler.js'

function makeMockContext() {
  const jsonMock = vi.fn((data: unknown, status?: number) => ({ data, status }))
  return { c: { json: jsonMock } as any, jsonMock }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('jsonErrorHandler', () => {
  it('responds with a JSON 500 error', () => {
    const { c, jsonMock } = makeMockContext()

    jsonErrorHandler(new Error('boom'), c)

    expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' }, 500)
  })

  it('logs the original error', () => {
    const { c } = makeMockContext()
    const err = new Error('boom')

    jsonErrorHandler(err, c)

    expect(console.error).toHaveBeenCalledWith(err)
  })
})
