import { Hono } from 'hono'
import type { Env, Variables } from '../types'

const search = new Hono<{ Bindings: Env; Variables: Variables }>()

search.get('/', async (c) => {
  const user = c.get('user')
  const q = c.req.query('q')
  const category = c.req.query('category')
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 30)

  if (!q) return c.json({ error: 'missing_q' }, 400)

  const ftsQuery = q.split(/\s+/).filter(Boolean).join(' OR ')

  let sql = `
    SELECT n.id, n.title, n.category, n.updated_at,
           snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
    FROM notes_fts
    JOIN notes n ON n.rowid = notes_fts.rowid
    WHERE notes_fts MATCH ? AND notes_fts.user_id = ?`
  const params: unknown[] = [ftsQuery, user.id]

  if (category) {
    sql += ' AND n.category LIKE ?'
    params.push(category + '%')
  }
  sql += ' ORDER BY rank LIMIT ?'
  params.push(limit)

  const { results } = await c.env.DB.prepare(sql)
    .bind(...params)
    .all()
  return c.json({ items: results })
})

export default search
