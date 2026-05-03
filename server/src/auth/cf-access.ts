/**
 * Cloudflare Access middleware.
 *
 * When the Worker sits behind Cloudflare Access (configured in CF dashboard →
 * Zero Trust → Access → Applications), every authenticated request carries:
 *   Cf-Access-Authenticated-User-Email
 *   Cf-Access-Jwt-Assertion
 *
 * CF Access enforces login + identity provider + policy *before* the request
 * reaches us, so we trust the email header. To bypass CF Access, the request
 * must travel through the public hostname — which is impossible since CF
 * Access wraps the hostname.
 *
 * Replaces the Google OAuth + session cookie path. No SESSION_SECRET, no
 * Google Cloud Console setup needed.
 */

import type { MiddlewareHandler } from 'hono'
import { ulid } from 'ulid'
import type { Env, User, Variables } from '../types'

export const cfAccessMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: Variables
}> = async (c, next) => {
  const email = c.req.header('cf-access-authenticated-user-email')

  if (!email) {
    return c.json(
      {
        error: 'unauthenticated',
        hint:
          'This API is gated by Cloudflare Access. Configure it in CF Dashboard → Zero Trust → Access → Applications, with this Worker hostname as the application domain.',
      },
      401
    )
  }

  const now = Date.now()
  let user = await c.env.DB.prepare(
    'SELECT id, email, name, picture FROM users WHERE email = ?'
  )
    .bind(email)
    .first<User>()

  if (!user) {
    const id = ulid()
    const name = c.req.header('cf-access-authenticated-user-name') ?? null
    await c.env.DB.prepare(
      'INSERT INTO users(id, email, name, picture, created_at, last_seen_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(id, email, name, null, now, now)
      .run()
    user = { id, email, name, picture: null }
  } else {
    await c.env.DB.prepare('UPDATE users SET last_seen_at=? WHERE id=?')
      .bind(now, user.id)
      .run()
  }

  c.set('user', user)
  await next()
}
