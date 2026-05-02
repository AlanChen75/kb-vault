/**
 * Session middleware (cookie-based) and MCP token verification (Bearer).
 *
 * Sessions are stored in KV with 30-day TTL.
 * MCP tokens are stored in KV (no TTL) and indexed in D1 mcp_tokens table.
 */

import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Env, User, Variables } from '../types'

export const sessionMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const sid = getCookie(c, 'sid')
    if (!sid) return c.json({ error: 'unauthenticated' }, 401)

    const json = await c.env.SESSIONS.get(`session:${sid}`)
    if (!json) return c.json({ error: 'unauthenticated' }, 401)

    const user: User = JSON.parse(json)
    c.set('user', user)
    await next()
  }

export async function verifyMcpToken(env: Env, token: string): Promise<User | null> {
  if (!token || !token.startsWith('mcp_')) return null

  const json = await env.SESSIONS.get(`mcp_token:${token}`)
  if (!json) return null

  return JSON.parse(json) as User
}

export async function createSession(env: Env, user: User): Promise<string> {
  const sid = crypto.randomUUID()
  await env.SESSIONS.put(`session:${sid}`, JSON.stringify(user), {
    expirationTtl: 60 * 60 * 24 * 30, // 30 days
  })
  return sid
}

export async function destroySession(env: Env, sid: string): Promise<void> {
  await env.SESSIONS.delete(`session:${sid}`)
}
