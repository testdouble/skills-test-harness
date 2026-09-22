// Fetches a JSON API response, turning any non-OK status into an Error whose
// message is the server's `error` field, or the HTTP status when the body isn't JSON.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null
    const message = typeof body?.error === 'string' ? body.error : res.statusText || `HTTP ${res.status}`
    throw new Error(message)
  }
  return (await res.json()) as T
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
