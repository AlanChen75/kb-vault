/**
 * Magic-link auth — zero IdP setup, zero OAuth app registration.
 *
 * Flow:
 *   POST /auth/magic/request  { email }
 *     → generate single-use token, store in KV (TTL 10min)
 *     → email link via Resend
 *   GET  /auth/magic/verify?token=xxx
 *     → validate, single-use consume, upsert user, set 30-day session cookie
 *     → redirect to APP_URL
 *
 * Why this path: students who self-host don't have to register a Google/GitHub
 * OAuth app. Just need a Resend free-tier API key (3-min signup) for email send.
 */

import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import { ulid } from 'ulid'
import type { Env } from '../types'
import { createSession } from './session'

const auth = new Hono<{ Bindings: Env }>()

const requestSchema = z.object({ email: z.string().email() })

auth.post('/request', async (c) => {
  if (!c.env.RESEND_API_KEY) {
    return c.json(
      {
        error: 'magic_link_not_configured',
        hint:
          'Server-side RESEND_API_KEY missing. Either set it (signup at https://resend.com, copy key) or use GitHub OAuth.',
      },
      503
    )
  }

  const body = requestSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: 'invalid_email' }, 400)

  const email = body.data.email.toLowerCase().trim()

  // Whitelist gate (don't send mail to randoms)
  const allowed = c.env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase())
  if (!allowed.includes(email)) {
    return c.json({ error: 'email_not_allowed' }, 403)
  }

  // Generate single-use token
  const token = randomToken(32)
  await c.env.SESSIONS.put(
    `magic:token:${token}`,
    JSON.stringify({ email, createdAt: Date.now() }),
    { expirationTtl: 60 * 10 } // 10 minutes
  )

  const link = `${c.env.API_URL}/auth/magic/verify?token=${token}`
  const fromAddress = c.env.MAGIC_FROM_EMAIL ?? 'kb-vault <onboarding@resend.dev>'

  const sent = await sendEmailViaResend(c.env.RESEND_API_KEY, {
    from: fromAddress,
    to: email,
    subject: 'Sign in to kb-vault',
    html: emailHtml(link, c.env.APP_URL),
    text: emailText(link),
  })

  if (!sent.ok) {
    return c.json({ error: 'email_send_failed', detail: sent.detail }, 502)
  }

  return c.json({ ok: true, message: 'Check your email for the sign-in link.' })
})

auth.get('/verify', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'missing_token' }, 400)

  const json = await c.env.SESSIONS.get(`magic:token:${token}`)
  if (!json) {
    return c.html(
      errorPage('連結已失效', '這個登入連結已過期或已被使用。請回到登入頁重新申請。', c.env.APP_URL),
      { status: 400 }
    )
  }

  // Single-use: delete immediately
  await c.env.SESSIONS.delete(`magic:token:${token}`)

  const { email } = JSON.parse(json) as { email: string }

  // Upsert user
  const now = Date.now()
  const existing = await c.env.DB.prepare('SELECT id, name, picture FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; name: string | null; picture: string | null }>()

  let userId: string
  let name: string | null
  let picture: string | null

  if (existing) {
    userId = existing.id
    name = existing.name
    picture = existing.picture
    await c.env.DB.prepare('UPDATE users SET last_seen_at=? WHERE id=?').bind(now, userId).run()
  } else {
    userId = ulid()
    name = email.split('@')[0]
    picture = null
    await c.env.DB.prepare(
      'INSERT INTO users(id,email,name,picture,created_at,last_seen_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(userId, email, name, picture, now, now)
      .run()
  }

  const sid = await createSession(c.env, { id: userId, email, name, picture })
  setCookie(c, 'sid', sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  return c.redirect(c.env.APP_URL)
})

// ─── helpers ──────────────────────────────────────────────────────────

function randomToken(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sendEmailViaResend(
  apiKey: string,
  msg: { from: string; to: string; subject: string; html: string; text: string }
): Promise<{ ok: boolean; detail?: string }> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(msg),
  })
  if (!r.ok) {
    const detail = await r.text()
    return { ok: false, detail: detail.slice(0, 300) }
  }
  return { ok: true }
}

function emailHtml(link: string, appUrl: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937;">
  <h2 style="margin:0 0 16px;">📚 Sign in to kb-vault</h2>
  <p>Click the button below to sign in. The link expires in 10 minutes and works only once.</p>
  <p style="margin:24px 0;">
    <a href="${link}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in to kb-vault</a>
  </p>
  <p style="color:#6b7280;font-size:13px;">If the button doesn't work, paste this URL into your browser:</p>
  <p style="color:#6b7280;font-size:13px;word-break:break-all;">${link}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:12px;">If you didn't request this, ignore this email. Someone may have typed your email by mistake.</p>
  <p style="color:#9ca3af;font-size:12px;">${appUrl}</p>
</body></html>`
}

function emailText(link: string): string {
  return `Sign in to kb-vault

Click this link (expires in 10 minutes, single-use):

${link}

If you didn't request this, ignore this email.`
}

function errorPage(title: string, message: string, appUrl: string): string {
  return `<!doctype html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;">
  <h1>${title}</h1>
  <p style="color:#6b7280;">${message}</p>
  <p><a href="${appUrl}/login" style="color:#3b82f6;">回登入頁</a></p>
</body></html>`
}

export default auth
