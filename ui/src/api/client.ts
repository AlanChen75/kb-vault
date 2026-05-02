/**
 * Tiny fetch wrapper for kb-vault API.
 * Sends cookies for session, auto-redirects to /login on 401.
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('unauthenticated')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}
