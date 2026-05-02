/**
 * Notes CRUD endpoints — thin Hono wrappers over lib/notes.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, Variables } from '../types'
import {
  createNote as createNoteLib,
  deleteNote as deleteNoteLib,
  getNote as getNoteLib,
  listRecent,
  updateNote as updateNoteLib,
} from '../lib/notes'

const notes = new Hono<{ Bindings: Env; Variables: Variables }>()

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_url: z.string().url().optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_url: z.string().url().optional(),
})

notes.get('/', async (c) => {
  const user = c.get('user')
  const limit = Number(c.req.query('limit') ?? 50)
  const category = c.req.query('category') ?? undefined
  const items = await listRecent(c.env.DB, user.id, { limit, category })
  return c.json({ items })
})

notes.post('/', async (c) => {
  const user = c.get('user')
  const body = createSchema.parse(await c.req.json())
  const note = await createNoteLib(c.env.DB, user.id, { ...body, source: 'manual' })
  return c.json({ id: note.id, url: `${c.env.APP_URL}/note/${note.id}` }, 201)
})

notes.get('/:id', async (c) => {
  const user = c.get('user')
  const note = await getNoteLib(c.env.DB, user.id, c.req.param('id'))
  if (!note) return c.json({ error: 'not_found' }, 404)
  return c.json(note)
})

notes.put('/:id', async (c) => {
  const user = c.get('user')
  const body = updateSchema.parse(await c.req.json())
  const note = await updateNoteLib(c.env.DB, user.id, c.req.param('id'), body)
  if (!note) return c.json({ error: 'not_found' }, 404)
  return c.json(note)
})

notes.delete('/:id', async (c) => {
  const user = c.get('user')
  const ok = await deleteNoteLib(c.env.DB, user.id, c.req.param('id'))
  if (!ok) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

export default notes
