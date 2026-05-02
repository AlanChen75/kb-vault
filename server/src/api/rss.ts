import { Hono } from 'hono'
import { z } from 'zod'
import { ulid } from 'ulid'
import type { Env, Variables } from '../types'

const rss = new Hono<{ Bindings: Env; Variables: Variables }>()

const feedSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  category: z.string().optional(),
})

rss.get('/feeds', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM rss_feeds WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(user.id)
    .all()
  return c.json({ items: results })
})

rss.post('/feeds', async (c) => {
  const user = c.get('user')
  const body = feedSchema.parse(await c.req.json())
  const id = ulid()
  const now = Date.now()

  await c.env.DB.prepare(
    `INSERT INTO rss_feeds (id, user_id, url, title, category, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  )
    .bind(id, user.id, body.url, body.title ?? null, body.category ?? null, now)
    .run()

  return c.json({ id }, 201)
})

rss.delete('/feeds/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM rss_feeds WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run()
  return c.json({ ok: true })
})

rss.get('/items', async (c) => {
  const user = c.get('user')
  const unread = c.req.query('unread') === 'true'
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)

  let sql = `
    SELECT i.*, f.title AS feed_title, f.category AS feed_category
    FROM rss_items i
    JOIN rss_feeds f ON i.feed_id = f.id
    WHERE f.user_id = ?`
  const params: unknown[] = [user.id]

  if (unread) sql += ' AND i.saved_to_note_id IS NULL'
  sql += ' ORDER BY i.published_at DESC LIMIT ?'
  params.push(limit)

  const { results } = await c.env.DB.prepare(sql)
    .bind(...params)
    .all()
  return c.json({ items: results })
})

rss.post('/items/:id/save', async (c) => {
  // Skeleton: convert RSS item to a note.
  return c.json({ error: 'not_implemented' }, 501)
})

export default rss
