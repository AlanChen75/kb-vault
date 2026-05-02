/// <reference types="vite/client" />

/**
 * Tiny fetch wrapper for kb-vault API.
 * Sends cookies for session, auto-redirects to /login on 401.
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  if (res.status === 401) {
    if (location.pathname !== '/login') location.href = '/login'
    throw new Error('unauthenticated')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  apiUrl: API_URL,
}

// ─── Types ───
export type User = { id: string; email: string; name: string | null; picture: string | null }

export type NoteSummary = {
  id: string
  title: string
  category: string | null
  updated_at: number
}

export type Note = NoteSummary & {
  content: string
  source: string | null
  source_url: string | null
  created_at: number
  tags: string[]
  links_in: string[]
  links_out: string[]
}

export type SearchHit = NoteSummary & { snippet: string }

export type GraphData = {
  nodes: Array<{ id: string; label: string; category: string | null }>
  edges: Array<{ from: string; to: string; type: string | null }>
}

export type RssFeed = {
  id: string
  url: string
  title: string | null
  category: string | null
  active: number
  last_fetched_at: number | null
}

export type RssItem = {
  id: string
  feed_id: string
  feed_title: string | null
  feed_category: string | null
  title: string | null
  link: string | null
  summary: string | null
  published_at: number | null
  saved_to_note_id: string | null
}

export type McpToken = {
  id: string
  label: string | null
  created_at: number
  last_used_at: number | null
}

export type KbStats = {
  total_notes: number
  by_category: Record<string, number>
  total_tags: number
  recent_activity: { today: number; this_week: number }
}
