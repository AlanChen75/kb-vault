/**
 * kb-vault Worker entry — stateless Hono router.
 *
 * No Durable Objects. State lives in D1 + KV only.
 *
 * Routes:
 *   /auth/google*    Google OAuth flow
 *   /api/*           REST API for the SPA UI (cookie session)
 *   /mcp             Stateless MCP JSON-RPC (Bearer token)
 *   scheduled()      Cron: daily RSS fetch
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, Variables } from './types'

import { cfAccessMiddleware } from './auth/cf-access'

import notesRoutes from './api/notes'
import searchRoutes from './api/search'
import graphRoutes from './api/graph'
import rssRoutes from './api/rss'
import syncRoutes from './api/sync'
import tokensRoutes from './api/tokens'
import statsRoutes from './api/stats'

import mcpHandler from './mcp/handler'
import { runRssFetch } from './cron/rss-fetch'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const appUrl = c.env.APP_URL
      if (!origin) return appUrl
      if (origin === appUrl) return origin
      if (origin === 'http://localhost:5173') return origin
      return appUrl
    },
    credentials: true,
  })
)

// ─── Public ───
app.get('/', (c) => c.json({ name: 'kb-vault', version: '0.1.0' }))
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))

// ─── API (Cloudflare Access) ───
const api = new Hono<{ Bindings: Env; Variables: Variables }>()
api.use('*', cfAccessMiddleware)
api.route('/notes', notesRoutes)
api.route('/search', searchRoutes)
api.route('/graph', graphRoutes)
api.route('/rss', rssRoutes)
api.route('/sync', syncRoutes)
api.route('/tokens', tokensRoutes)
api.route('/stats', statsRoutes)
api.get('/me', (c) => c.json(c.get('user')))
app.route('/api', api)

// ─── MCP (Bearer token) ───
app.route('/mcp', mcpHandler)

// ─── 404 ───
app.notFound((c) => c.json({ error: 'not_found' }, 404))

// ─── Error handler ───
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal', message: err.message }, 500)
})

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runRssFetch(env))
  },
}
