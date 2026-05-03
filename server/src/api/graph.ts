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

  // 1. Explicit links (from links table)
  const linkRes = await c.env.DB.prepare(
    `SELECT from_id AS [from], to_id AS [to], link_type AS type
     FROM links WHERE from_id IN (${placeholders}) AND to_id IN (${placeholders})`
  )
    .bind(...ids, ...ids)
    .all<{ from: string; to: string; type: string }>()

  // 2. Implicit edges: notes sharing >=1 tag
  // Query pairs of (note_id, note_id) with at least one common tag, scoped to current user.
  const tagEdges = await c.env.DB.prepare(
    `SELECT t1.note_id AS [from], t2.note_id AS [to], COUNT(*) AS weight
     FROM tags t1
     JOIN tags t2 ON t1.tag = t2.tag AND t1.note_id < t2.note_id
     WHERE t1.note_id IN (${placeholders}) AND t2.note_id IN (${placeholders})
     GROUP BY t1.note_id, t2.note_id
     HAVING weight >= 1
     LIMIT 1000`
  )
    .bind(...ids, ...ids)
    .all<{ from: string; to: string; weight: number }>()

  const explicitEdges = linkRes.results.map((e) => ({ ...e, source: 'link' as const }))
  const implicitEdges = tagEdges.results.map((e) => ({
    from: e.from,
    to: e.to,
    type: 'tag-share',
    source: 'tag' as const,
    weight: e.weight,
  }))

  return c.json({
    nodes: nodes.results,
    edges: [...explicitEdges, ...implicitEdges],
  })
})

export default graph
