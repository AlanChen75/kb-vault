/**
 * Notes business logic — D1 backed.
 *
 * NEW for kb-vault. Not ported from kb-mcp because kb-mcp uses GitHub Contents API
 * (file path as primary key). kb-vault uses D1 with ulid as primary key + FTS5 search.
 *
 * All functions take a user_id to enforce tenant isolation.
 */

import { ulid } from 'ulid'
import type { D1Database } from '@cloudflare/workers-types'

export type CreateNoteInput = {
  title: string
  content: string
  category?: string
  tags?: string[]
  source?: string // "manual" | "rss" | "mcp" | "import"
  source_url?: string
}

export type UpdateNoteInput = Partial<CreateNoteInput>

export type NoteRow = {
  id: string
  user_id: string
  title: string
  content: string
  category: string | null
  source: string | null
  source_url: string | null
  created_at: number
  updated_at: number
}

export async function createNote(
  db: D1Database,
  userId: string,
  input: CreateNoteInput
): Promise<NoteRow> {
  const id = ulid()
  const now = Date.now()
  const source = input.source ?? 'manual'

  await db
    .prepare(
      `INSERT INTO notes (id, user_id, title, content, category, source, source_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      userId,
      input.title,
      input.content,
      input.category ?? null,
      source,
      input.source_url ?? null,
      now,
      now
    )
    .run()

  if (input.tags?.length) {
    await db.batch(
      input.tags.map((t) =>
        db.prepare('INSERT OR IGNORE INTO tags(note_id, tag) VALUES (?, ?)').bind(id, t)
      )
    )
  }

  return {
    id,
    user_id: userId,
    title: input.title,
    content: input.content,
    category: input.category ?? null,
    source,
    source_url: input.source_url ?? null,
    created_at: now,
    updated_at: now,
  }
}

export async function getNote(
  db: D1Database,
  userId: string,
  id: string
): Promise<(NoteRow & { tags: string[]; links_in: string[]; links_out: string[] }) | null> {
  const row = await db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<NoteRow>()
  if (!row) return null

  const tags = await db.prepare('SELECT tag FROM tags WHERE note_id = ?').bind(id).all<{ tag: string }>()
  const out = await db.prepare('SELECT to_id FROM links WHERE from_id = ?').bind(id).all<{ to_id: string }>()
  const into = await db.prepare('SELECT from_id FROM links WHERE to_id = ?').bind(id).all<{ from_id: string }>()

  return {
    ...row,
    tags: tags.results.map((r) => r.tag),
    links_out: out.results.map((r) => r.to_id),
    links_in: into.results.map((r) => r.from_id),
  }
}

export async function updateNote(
  db: D1Database,
  userId: string,
  id: string,
  patch: UpdateNoteInput
): Promise<NoteRow | null> {
  const existing = await db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<NoteRow>()
  if (!existing) return null

  const now = Date.now()
  const next: NoteRow = {
    ...existing,
    title: patch.title ?? existing.title,
    content: patch.content ?? existing.content,
    category: patch.category ?? existing.category,
    source_url: patch.source_url ?? existing.source_url,
    updated_at: now,
  }

  await db
    .prepare(
      `UPDATE notes SET title=?, content=?, category=?, source_url=?, updated_at=?
       WHERE id=? AND user_id=?`
    )
    .bind(next.title, next.content, next.category, next.source_url, now, id, userId)
    .run()

  if (patch.tags !== undefined) {
    await db.prepare('DELETE FROM tags WHERE note_id = ?').bind(id).run()
    if (patch.tags.length) {
      await db.batch(
        patch.tags.map((t) =>
          db.prepare('INSERT OR IGNORE INTO tags(note_id, tag) VALUES (?, ?)').bind(id, t)
        )
      )
    }
  }

  return next
}

export async function deleteNote(db: D1Database, userId: string, id: string): Promise<boolean> {
  const r = await db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run()
  return (r.meta?.changes ?? 0) > 0
}

export async function listRecent(
  db: D1Database,
  userId: string,
  opts: { limit?: number; category?: string } = {}
): Promise<Array<Pick<NoteRow, 'id' | 'title' | 'category' | 'updated_at'>>> {
  const limit = Math.min(opts.limit ?? 10, 50)
  let sql = 'SELECT id, title, category, updated_at FROM notes WHERE user_id = ?'
  const params: unknown[] = [userId]
  if (opts.category) {
    sql += ' AND category LIKE ?'
    params.push(opts.category + '%')
  }
  sql += ' ORDER BY updated_at DESC LIMIT ?'
  params.push(limit)

  const r = await db.prepare(sql).bind(...params).all<Pick<NoteRow, 'id' | 'title' | 'category' | 'updated_at'>>()
  return r.results
}

export type SearchHit = {
  id: string
  title: string
  category: string | null
  updated_at: number
  snippet: string
}

export async function searchNotes(
  db: D1Database,
  userId: string,
  opts: { query: string; category?: string; limit?: number }
): Promise<SearchHit[]> {
  const limit = Math.min(opts.limit ?? 10, 30)
  const ftsQuery = opts.query.split(/\s+/).filter(Boolean).join(' OR ')

  let sql = `
    SELECT n.id, n.title, n.category, n.updated_at,
           snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
    FROM notes_fts
    JOIN notes n ON n.rowid = notes_fts.rowid
    WHERE notes_fts MATCH ? AND notes_fts.user_id = ?`
  const params: unknown[] = [ftsQuery, userId]
  if (opts.category) {
    sql += ' AND n.category LIKE ?'
    params.push(opts.category + '%')
  }
  sql += ' ORDER BY rank LIMIT ?'
  params.push(limit)

  const r = await db.prepare(sql).bind(...params).all<SearchHit>()
  return r.results
}

export type KbStats = {
  total_notes: number
  by_category: Record<string, number>
  total_tags: number
  recent_activity: { today: number; this_week: number }
}

export async function getStats(db: D1Database, userId: string): Promise<KbStats> {
  const total = await db
    .prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>()

  const byCat = await db
    .prepare(
      `SELECT COALESCE(category, '(uncategorized)') as cat, COUNT(*) as c
       FROM notes WHERE user_id = ? GROUP BY cat`
    )
    .bind(userId)
    .all<{ cat: string; c: number }>()

  const tagCount = await db
    .prepare(
      `SELECT COUNT(DISTINCT tag) as c FROM tags
       WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)`
    )
    .bind(userId)
    .first<{ c: number }>()

  const dayMs = 86400000
  const now = Date.now()
  const today = await db
    .prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND updated_at >= ?')
    .bind(userId, now - dayMs)
    .first<{ c: number }>()
  const week = await db
    .prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND updated_at >= ?')
    .bind(userId, now - 7 * dayMs)
    .first<{ c: number }>()

  return {
    total_notes: total?.c ?? 0,
    by_category: Object.fromEntries(byCat.results.map((r) => [r.cat, r.c])),
    total_tags: tagCount?.c ?? 0,
    recent_activity: { today: today?.c ?? 0, this_week: week?.c ?? 0 },
  }
}
