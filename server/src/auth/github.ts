/**
 * GitHub OAuth flow.
 *
 * GET /auth/github         -> redirect to GitHub
 * GET /auth/github/cb      -> exchange code, set session cookie
 * POST /auth/logout        -> destroy session
 *
 * Why GitHub instead of Google? GitHub OAuth setup is ~2 minutes
 * (vs ~10 min for Google with mandatory consent screen). Same flow shape.
 */

import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import { ulid } from 'ulid'
import type { Env } from '../types'
import { createSession, destroySession } from './session'

const auth = new Hono<{ Bindings: Env }>()

auth.get('/', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ error: 'github_oauth_not_configured' }, 503)
  }

  const state = crypto.randomUUID()
  await c.env.SESSIONS.put(`oauth:state:${state}`, '1', { expirationTtl: 600 })

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: `${c.env.API_URL}/auth/github/cb`,
    scope: 'read:user user:email',
    state,
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

auth.get('/cb', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return c.json({ error: 'github_oauth_not_configured' }, 503)
  }
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code || !state) return c.json({ error: 'missing_code_or_state' }, 400)

  const stored = await c.env.SESSIONS.get(`oauth:state:${state}`)
  if (!stored) return c.json({ error: 'invalid_state' }, 400)
  await c.env.SESSIONS.delete(`oauth:state:${state}`)

  // Exchange code -> access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      redirect_uri: `${c.env.API_URL}/auth/github/cb`,
    }),
  })
  if (!tokenRes.ok) return c.json({ error: 'token_exchange_failed' }, 400)
  const { access_token } = (await tokenRes.json()) as { access_token: string }

  const ghHeaders = {
    authorization: `Bearer ${access_token}`,
    accept: 'application/vnd.github.v3+json',
    'user-agent': 'kb-vault',
  }

  // Get user profile
  const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders })
  if (!userRes.ok) return c.json({ error: 'userinfo_failed' }, 400)
  const ghUser = (await userRes.json()) as {
    id: number
    login: string
    name: string | null
    email: string | null
    avatar_url: string | null
  }

  // Resolve verified email (might be private on profile)
  let email = ghUser.email
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: ghHeaders,
    })
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string
        primary: boolean
        verified: boolean
      }>
      email =
        emails.find((e) => e.primary && e.verified)?.email ??
        emails.find((e) => e.verified)?.email ??
        null
    }
  }
  if (!email) return c.json({ error: 'no_verified_email' }, 400)

  // Whitelist check
  const allowed = c.env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase())
  if (!allowed.includes(email.toLowerCase())) {
    return c.json({ error: 'email_not_allowed', email }, 403)
  }

  // Upsert user
  const displayName = ghUser.name ?? ghUser.login
  const now = Date.now()
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  const userId = existing?.id ?? ulid()

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE users SET name=?, picture=?, last_seen_at=? WHERE id=?'
    )
      .bind(displayName, ghUser.avatar_url, now, userId)
      .run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO users(id,email,name,picture,created_at,last_seen_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(userId, email, displayName, ghUser.avatar_url, now, now)
      .run()
  }

  // Create session
  const sid = await createSession(c.env, {
    id: userId,
    email,
    name: displayName,
    picture: ghUser.avatar_url,
  })

  setCookie(c, 'sid', sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'None', // UI on pages.dev fetches API on workers.dev = cross-site
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
