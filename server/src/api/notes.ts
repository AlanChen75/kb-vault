/**
 * Notes CRUD endpoints.
 *
 * Skeleton only — implement business logic in lib/notes.ts and import here.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { ulid } from 'ulid'
import type { Env, Variables } from '../types'

const notes = new Hono<{ Bindings: Env; Variables: Variables }>()

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_url: z.string().url().optional(),
})

notes.get('/', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, category, source, source_url, created_at, updated_at
     FROM notes WHERE user_id = ?
     ORDER BY updated_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all()
  return c.json({ items: results })
})

notes.post('/', async (c) => {
  const user = c.get('user')
  const body = createSchema.parse(await c.req.json())
  const id = ulid()
  const now = Date.now()

  await c.env.DB.prepare(
    `INSERT INTO notes (id, user_id, title, content, category, source, source_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)`
  )
    .bind(
      id,
      user.id,
      body.title,
      body.content,
      body.category ?? null,
      body.source_url ?? null,
      now,
      now
    )
    .run()

  if (body.tags?.length) {
    const stmts = body.tags.map((t) =>
      c.env.DB.prepare('INSERT OR IGNORE INTO tags(note_id, tag) VALUES (?, ?)').bind(id, t)
    )
    await c.env.DB.batch(stmts)
  }

  return c.json({ id, url: `${c.env.APP_URL}/note/${id}` }, 201)
})

notes.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first()
  if (!note) return c.json({ error: 'not_found' }, 404)

  const tags = await c.env.DB.prepare('SELECT tag FROM tags WHERE note_id = ?')
    .bind(id)
    .all<{ tag: string }>()
  const linksOut = await c.env.DB.prepare('SELECT to_id FROM links WHERE from_id = ?')
    .bind(id)
    .all<{ to_id: string }>()
  const linksIn = await c.env.DB.prepare('SELECT from_id FROM links WHERE to_id = ?')
    .bind(id)
    .all<{ from_id: string }>()

  return c.json({
    ...note,
    tags: tags.results.map((r) => r.tag),
    links_out: linksOut.results.map((r) => r.to_id),
    links_in: linksIn.results.map((r) => r.from_id),
  })
})

// PUT and DELETE skeleton
notes.put('/:id', async (c) => c.json({ error: 'not_implemented' }, 501))
notes.delete('/:id', async (c) => c.json({ error: 'not_implemented' }, 501))

export default notes
