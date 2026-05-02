import { Hono } from 'hono'
import { z } from 'zod'
import { ulid } from 'ulid'
import type { Env, Variables } from '../types'
import { createNote } from '../lib/notes'

const rss = new Hono<{ Bindings: Env; Variables: Variables }>()

const feedSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  category: z.string().optional(),
})

const saveSchema = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summarize: z.boolean().optional(),
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
  const user = c.get('user')
  const itemId = c.req.param('id')
  const body = saveSchema.parse(await c.req.json().catch(() => ({})))

  // Fetch item, ensuring it belongs to a feed owned by this user
  const item = await c.env.DB.prepare(
    `SELECT i.id, i.title, i.link, i.summary, i.published_at, i.saved_to_note_id, f.category AS feed_category
     FROM rss_items i
     JOIN rss_feeds f ON i.feed_id = f.id
     WHERE i.id = ? AND f.user_id = ?`
  )
    .bind(itemId, user.id)
    .first<{
      id: string
      title: string | null
      link: string | null
      summary: string | null
      published_at: number | null
      saved_to_note_id: string | null
      feed_category: string | null
    }>()

  if (!item) return c.json({ error: 'not_found' }, 404)
  if (item.saved_to_note_id) {
    return c.json({ error: 'already_saved', note_id: item.saved_to_note_id }, 409)
  }

  // Optional summarization via Workers AI
  let summary = item.summary ?? ''
  if (body.summarize && c.env.AI && summary) {
    try {
      const ai = c.env.AI as { run: (model: string, input: unknown) => Promise<{ response?: string }> }
      const r = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: '你是新聞摘要助手。用繁體中文輸出 3-5 句摘要，不要換行多次。' },
          { role: 'user', content: `標題：${item.title ?? ''}\n\n內容：${summary}` },
        ],
      })
      if (r.response) summary = r.response.trim()
    } catch (e) {
      console.warn('[rss save] AI summarize failed:', e)
    }
  }

  // Build markdown
  const dateStr = item.published_at
    ? new Date(item.published_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const md = [
    `# ${item.title ?? '(untitled)'}`,
    '',
    '## 📌 摘要',
    summary || '_(尚無摘要)_',
    '',
    item.link ? `## 🔗 原文\n${item.link}` : '',
    '',
    '## 📝 我的註解',
    '_(尚未填寫)_',
    '',
    '## ℹ️ 原文資訊',
    item.link ? `- **來源**：${item.link}` : '',
    `- **發布日期**：${dateStr}`,
    '- **收錄方式**：RSS 自動抓取',
  ]
    .filter(Boolean)
    .join('\n')

  const note = await createNote(c.env.DB, user.id, {
    title: item.title ?? '(untitled)',
    content: md,
    category: body.category ?? item.feed_category ?? 'news',
    tags: body.tags,
    source: 'rss',
    source_url: item.link ?? undefined,
  })

  await c.env.DB.prepare('UPDATE rss_items SET saved_to_note_id = ? WHERE id = ?')
    .bind(note.id, itemId)
    .run()

  return c.json({ id: note.id, url: `${c.env.APP_URL}/note/${note.id}` }, 201)
})

export default rss
