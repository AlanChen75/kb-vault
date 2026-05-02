/**
 * MCP Token management.
 *
 * Storage strategy:
 *   D1 mcp_tokens: { id, user_id, label, kv_key, created_at, last_used_at }
 *   KV mcp_token:{kv_key} -> user JSON (lookup is O(1) on every MCP request)
 *
 * Rotation/revocation:
 *   On revoke, delete BOTH the D1 row and the KV entry by kv_key.
 *   The token plaintext (mcp_xxx) IS the kv_key suffix, so we store kv_key in D1
 *   instead of a SHA hash to enable clean revocation.
 *   (Trade-off: anyone with D1 read access could see kv_keys. Cloudflare-managed,
 *   single-tenant DB; acceptable for personal KB.)
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { ulid } from 'ulid'
import type { Env, Variables } from '../types'

const tokens = new Hono<{ Bindings: Env; Variables: Variables }>()

const createSchema = z.object({ label: z.string().max(100).optional() })

tokens.get('/', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT id, label, created_at, last_used_at FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(user.id)
    .all()
  return c.json({ items: results })
})

tokens.post('/', async (c) => {
  const user = c.get('user')
  const body = createSchema.parse(await c.req.json().catch(() => ({})))

  const raw = `mcp_${randomBase64Url(32)}`
  const kvKey = `mcp_token:${raw}`
  const id = ulid()
  const now = Date.now()

  await c.env.SESSIONS.put(kvKey, JSON.stringify(user))

  await c.env.DB.prepare(
    'INSERT INTO mcp_tokens(id, user_id, label, token_hash, created_at) VALUES (?,?,?,?,?)'
  )
    .bind(id, user.id, body.label ?? null, kvKey, now)
    .run()

  return c.json({ id, label: body.label ?? null, token: raw, created_at: now }, 201)
})

tokens.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(
    'SELECT token_hash FROM mcp_tokens WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{ token_hash: string }>()

  if (!row) return c.json({ error: 'not_found' }, 404)

  await c.env.SESSIONS.delete(row.token_hash)
  await c.env.DB.prepare('DELETE FROM mcp_tokens WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run()

  return c.json({ ok: true })
})

function randomBase64Url(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export default tokens
