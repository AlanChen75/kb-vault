import type { D1Database, KVNamespace, R2Bucket, Ai } from '@cloudflare/workers-types'

export type Env = {
  DB: D1Database
  SESSIONS: KVNamespace
  ATTACHMENTS?: R2Bucket
  AI?: Ai

  // Vars
  APP_URL: string
  API_URL: string

  // Secrets
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ALLOWED_EMAILS: string

  // Optional secrets
  NOTION_TOKEN?: string
  NOTION_DATABASE_ID?: string
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string
}

export type User = {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export type Variables = {
  user: User
}

export type Note = {
  id: string
  user_id: string
  title: string
  content: string
  category: string | null
  source: string | null
  source_url: string | null
  tags: string[]
  links_in: string[]
  links_out: string[]
  created_at: number
  updated_at: number
}

export type RssFeed = {
  id: string
  user_id: string
  url: string
  title: string | null
  category: string | null
  active: boolean
  last_fetched_at: number | null
}

export type RssItem = {
  id: string
  feed_id: string
  guid: string
  title: string | null
  link: string | null
  summary: string | null
  published_at: number | null
  fetched_at: number
  saved_to_note_id: string | null
}

// JSON-RPC 2.0 (MCP)
export type McpRequest = {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: Record<string, unknown>
}

export type McpResponse = {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}
