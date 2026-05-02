/**
 * Google OAuth 2.0 flow.
 *
 * GET /auth/google         -> redirect to Google
 * GET /auth/google/cb      -> exchange code, verify email whitelist, set cookie
 * POST /auth/logout        -> destroy session
 */

import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import { ulid } from 'ulid'
import type { Env } from '../types'
import { createSession, destroySession } from './session'

const auth = new Hono<{ Bindings: Env }>()

auth.get('/', async (c) => {
  const state = crypto.randomUUID()
  await c.env.SESSIONS.put(`oauth:state:${state}`, '1', { expirationTtl: 600 })

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${c.env.API_URL}/auth/google/cb`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

auth.get('/cb', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code || !state) return c.json({ error: 'missing_code_or_state' }, 400)

  const stored = await c.env.SESSIONS.get(`oauth:state:${state}`)
  if (!stored) return c.json({ error: 'invalid_state' }, 400)
  await c.env.SESSIONS.delete(`oauth:state:${state}`)

  // Exchange code for token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${c.env.API_URL}/auth/google/cb`,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return c.json({ error: 'token_exchange_failed' }, 400)
  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // Get userinfo
  const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!uiRes.ok) return c.json({ error: 'userinfo_failed' }, 400)
  const ui = (await uiRes.json()) as {
    sub: string
    email: string
    name?: string
    picture?: string
  }

  // Whitelist check
  const allowed = c.env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase())
  if (!allowed.includes(ui.email.toLowerCase())) {
    return c.json({ error: 'email_not_allowed', email: ui.email }, 403)
  }

  // Upsert user
  const now = Date.now()
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(ui.email)
    .first<{ id: string }>()
  const userId = existing?.id ?? ulid()
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE users SET name=?, picture=?, last_seen_at=? WHERE id=?'
    )
      .bind(ui.name ?? null, ui.picture ?? null, now, userId)
      .run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO users(id,email,name,picture,created_at,last_seen_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(userId, ui.email, ui.name ?? null, ui.picture ?? null, now, now)
      .run()
  }

  // Create session
  const sid = await createSession(c.env, {
    id: userId,
    email: ui.email,
    name: ui.name ?? null,
    picture: ui.picture ?? null,
  })

  setCookie(c, 'sid', sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.redirect(c.env.APP_URL)
})

auth.post('/logout', async (c) => {
  const sid = getCookie(c, 'sid')
  if (sid) await destroySession(c.env, sid)
  deleteCookie(c, 'sid', { path: '/' })
  return c.json({ ok: true })
})

export default auth
