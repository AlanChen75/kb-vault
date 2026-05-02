import { Hono } from 'hono'
import type { Env, Variables } from '../types'

const graph = new Hono<{ Bindings: Env; Variables: Variables }>()

graph.get('/', async (c) => {
  const user = c.get('user')

  const nodes = await c.env.DB.prepare(
    `SELECT id, title AS label, category FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500`
  )
    .bind(user.id)
    .all<{ id: string; label: string; category: string | null }>()

  const ids = nodes.results.map((n) => n.id)
  if (!ids.length) return c.json({ nodes: [], edges: [] })

  const placeholders = ids.map(() => '?').join(',')
  const edges = await c.env.DB.prepare(
    `SELECT from_id AS [from], to_id AS [to], link_type AS type
     FROM links WHERE from_id IN (${placeholders}) AND to_id IN (${placeholders})`
  )
    .bind(...ids, ...ids)
    .all()

  return c.json({ nodes: nodes.results, edges: edges.results })
})

export default graph
