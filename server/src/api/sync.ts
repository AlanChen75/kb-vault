/**
 * Sync to external systems (Notion, GitHub).
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { GithubBackup } from '../lib/github-backup'
import { NotionSync } from '../lib/notion-sync'
import { generateNotePath, buildFrontmatter } from '../lib/note-format'

const sync = new Hono<{ Bindings: Env; Variables: Variables }>()

// Status — which sync targets have secrets configured (no auth required, only booleans returned)
sync.get('/status', (c) => {
  return c.json({
    notion: Boolean(c.env.NOTION_TOKEN && c.env.NOTION_DATABASE_ID),
    github: Boolean(c.env.GITHUB_TOKEN && c.env.GITHUB_REPO),
  })
})

type NoteRow = {
  id: string
  title: string
  content: string
  category: string | null
  created_at: number
  updated_at: number
}

async function selectUnsyncedNotes(
  env: Env,
  userId: string,
  target: 'notion' | 'github',
  limit = 100
): Promise<NoteRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.title, n.content, n.category, n.created_at, n.updated_at
     FROM notes n
     LEFT JOIN sync_log s ON s.note_id = n.id AND s.target = ?
     WHERE n.user_id = ?
       AND (s.last_synced_at IS NULL OR s.last_synced_at < n.updated_at)
     ORDER BY n.updated_at ASC LIMIT ?`
  )
    .bind(target, userId, limit)
    .all<NoteRow>()
  return results
}

async function getTags(env: Env, noteId: string): Promise<string[]> {
  const r = await env.DB.prepare('SELECT tag FROM tags WHERE note_id=?')
    .bind(noteId)
    .all<{ tag: string }>()
  return r.results.map((x) => x.tag)
}

async function recordSync(
  env: Env,
  noteId: string,
  target: string,
  externalId: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sync_log (note_id, target, external_id, last_synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(note_id, target) DO UPDATE
     SET external_id=excluded.external_id, last_synced_at=excluded.last_synced_at`
  )
    .bind(noteId, target, externalId, Date.now())
    .run()
}

sync.post('/notion', async (c) => {
  if (!c.env.NOTION_TOKEN || !c.env.NOTION_DATABASE_ID) {
    return c.json({ error: 'notion_not_configured' }, 400)
  }
  const user = c.get('user')
  const notes = await selectUnsyncedNotes(c.env, user.id, 'notion')
  const notion = new NotionSync(c.env.NOTION_TOKEN, c.env.NOTION_DATABASE_ID)

  let synced = 0
  let failed = 0
  for (const note of notes) {
    try {
      const tags = await getTags(c.env, note.id)
      const pageId = await notion.upsertNote(
        {
          id: note.id,
          title: note.title,
          content: note.content,
          category: note.category,
          tags,
          updated_at: note.updated_at,
        },
        c.env.APP_URL
      )
      await recordSync(c.env, note.id, 'notion', pageId)
      synced++
    } catch (e) {
      console.error(`[sync notion] note ${note.id} failed:`, e)
      failed++
    }
  }

  return c.json({ synced, failed, attempted: notes.length })
})

sync.post('/github', async (c) => {
  if (!c.env.GITHUB_TOKEN || !c.env.GITHUB_REPO) {
    return c.json({ error: 'github_not_configured' }, 400)
  }
  const user = c.get('user')
  const repo = new GithubBackup(c.env.GITHUB_TOKEN, c.env.GITHUB_REPO)
  const notes = await selectUnsyncedNotes(c.env, user.id, 'github')

  let synced = 0
  let failed = 0
  for (const note of notes) {
    try {
      const cat = note.category ?? 'inbox'
      const [head, ...rest] = cat.split('/')
      const path = generateNotePath(head, note.title, rest.join('/') || undefined)

      const tags = await getTags(c.env, note.id)
      const fm = buildFrontmatter({
        title: note.title,
        date: new Date(note.created_at).toISOString().slice(0, 10),
        category: cat,
        tags,
        kb_vault_id: note.id,
      })
      const body = `${fm}\n\n${note.content}`

      await repo.upsertFile(path, body, `kb-vault: ${note.title}`)
      await recordSync(c.env, note.id, 'github', path)
      synced++
    } catch (e) {
      console.error(`[sync github] note ${note.id} failed:`, e)
      failed++
    }
  }

  return c.json({ synced, failed, attempted: notes.length })
})

export default sync
