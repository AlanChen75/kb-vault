/**
 * Sync to external systems (Notion, GitHub).
 *
 * GitHub backup uses the ported lib/github-backup.ts adapter.
 * Notion sync is a TODO (similar shape, push markdown body as Notion blocks).
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { GithubBackup } from '../lib/github-backup'
import { generateNotePath, buildFrontmatter } from '../lib/note-format'

const sync = new Hono<{ Bindings: Env; Variables: Variables }>()

sync.post('/notion', async (c) => {
  if (!c.env.NOTION_TOKEN || !c.env.NOTION_DATABASE_ID) {
    return c.json({ error: 'notion_not_configured' }, 400)
  }
  // TODO: select notes WHERE id NOT IN sync_log(target='notion'), push via Notion API
  return c.json({ error: 'not_implemented', note: 'wire up Notion API in a follow-up' }, 501)
})

sync.post('/github', async (c) => {
  if (!c.env.GITHUB_TOKEN || !c.env.GITHUB_REPO) {
    return c.json({ error: 'github_not_configured' }, 400)
  }
  const user = c.get('user')

  const repo = new GithubBackup(c.env.GITHUB_TOKEN, c.env.GITHUB_REPO)
  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.content, n.category, n.created_at, n.updated_at
     FROM notes n
     LEFT JOIN sync_log s ON s.note_id = n.id AND s.target = 'github'
     WHERE n.user_id = ?
       AND (s.last_synced_at IS NULL OR s.last_synced_at < n.updated_at)
     ORDER BY n.updated_at ASC LIMIT 100`
  )
    .bind(user.id)
    .all<{
      id: string
      title: string
      content: string
      category: string | null
      created_at: number
      updated_at: number
    }>()

  let synced = 0
  let failed = 0

  for (const note of results) {
    try {
      const cat = note.category ?? 'inbox'
      const [head, ...rest] = cat.split('/')
      const path = generateNotePath(head, note.title, rest.join('/') || undefined)

      const tags = await c.env.DB.prepare('SELECT tag FROM tags WHERE note_id=?')
        .bind(note.id)
        .all<{ tag: string }>()

      const fm = buildFrontmatter({
        title: note.title,
        date: new Date(note.created_at).toISOString().slice(0, 10),
        category: cat,
        tags: tags.results.map((r) => r.tag),
        kb_vault_id: note.id,
      })
      const body = `${fm}\n\n${note.content}`

      const res = await repo.upsertFile(path, body, `kb-vault: ${note.title}`)

      await c.env.DB.prepare(
        `INSERT INTO sync_log (note_id, target, external_id, last_synced_at)
         VALUES (?, 'github', ?, ?)
         ON CONFLICT(note_id, target) DO UPDATE SET external_id=excluded.external_id, last_synced_at=excluded.last_synced_at`
      )
        .bind(note.id, path, Date.now())
        .run()

      synced++
      void res
    } catch (e) {
      console.error(`[sync github] note ${note.id} failed:`, e)
      failed++
    }
  }

  return c.json({ synced, failed, attempted: results.length })
})

export default sync
