/**
 * MCP tool definitions and dispatcher.
 *
 * Tool descriptions ported from kb-mcp (2026-05-02).
 * Business logic delegates to lib/notes.ts (D1-backed) — new for kb-vault.
 */

import { z } from 'zod'
import type { Env, User } from '../types'
import {
  createNote,
  getNote,
  listRecent,
  searchNotes,
  getStats,
  updateNote as updateNoteLib,
} from '../lib/notes'
import { CREATE_NOTE_DESCRIPTION, NOTE_FORMAT_TEMPLATE } from '../lib/note-format'

export const tools = [
  {
    name: 'create_note',
    description: CREATE_NOTE_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '筆記標題（30 字內）' },
        content: { type: 'string', description: NOTE_FORMAT_TEMPLATE },
        category: { type: 'string', description: '分類路徑，如 tech/ai-ml' },
        tags: { type: 'array', items: { type: 'string' } },
        source_url: { type: 'string' },
      },
      required: ['title', 'content', 'category'],
    },
  },
  {
    name: 'update_note',
    description: '更新筆記 / 改寫筆記 / 修改筆記 / update note / edit note / modify note。更新 kb-vault 中既有的筆記。先用 get_note 讀現有內容，修改後用此工具更新。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_note',
    description: '讀取筆記 / 取得筆記 / 開啟筆記 / read note / get note / fetch note / open note。讀取 kb-vault 中筆記的完整內容（含 frontmatter、雙向連結）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'search_notes',
    description: '搜尋筆記 / 找筆記 / 查筆記 / search notes / find notes / query notes。在 kb-vault 中用 D1 FTS5 全文搜尋筆記，可限定分類。回傳含 snippet。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜尋關鍵字' },
        category: { type: 'string', description: '限定分類路徑，如 tech' },
        limit: { type: 'number', minimum: 1, maximum: 30, default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_recent',
    description: '列出最近筆記 / 最近新增 / 最近修改 / list recent notes / recent activity / latest notes。列出 kb-vault 中最近新增或修改的筆記，可限定分類。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 30, default: 10 },
        category: { type: 'string' },
      },
    },
  },
  {
    name: 'kb_stats',
    description: '知識庫統計 / 筆記數量 / 分類分布 / kb stats / knowledge base statistics / note count。查看 kb-vault 統計：總筆記數、各分類數量、近期活動。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fetch_url',
    description:
      '抓取網頁 / 讀取 URL / 讀文章 / fetch url / scrape page / read webpage / get article。抓取任意 URL 的網頁內容轉純文字。用於讀取使用者貼的連結、文章。社群媒體因需登入，可能無法抓取完整內容。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_length: { type: 'number', minimum: 1000, maximum: 100000, default: 30000 },
      },
      required: ['url'],
    },
  },
] as const

const schemas: Record<string, z.ZodTypeAny> = {
  create_note: z.object({
    title: z.string().min(1).max(200),
    content: z.string(),
    category: z.string(),
    tags: z.array(z.string()).optional(),
    source_url: z.string().url().optional(),
  }),
  update_note: z.object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  get_note: z.object({ id: z.string() }),
  search_notes: z.object({
    query: z.string().min(1),
    category: z.string().optional(),
    limit: z.number().int().min(1).max(30).default(10),
  }),
  list_recent: z.object({
    limit: z.number().int().min(1).max(30).default(10),
    category: z.string().optional(),
  }),
  kb_stats: z.object({}),
  fetch_url: z.object({
    url: z.string().url(),
    max_length: z.number().int().min(1000).max(100000).default(30000),
  }),
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export async function callTool(
  name: string,
  rawArgs: Record<string, unknown>,
  user: User,
  env: Env
): Promise<ToolResult> {
  const schema = schemas[name]
  if (!schema) return text(`Unknown tool: ${name}`, true)
  const args = schema.parse(rawArgs)

  switch (name) {
    case 'create_note': {
      const note = await createNote(env.DB, user.id, {
        ...(args as z.infer<typeof schemas.create_note>),
        source: 'mcp',
      })
      return json({
        status: 'created',
        id: note.id,
        url: `${env.APP_URL}/note/${note.id}`,
      })
    }
    case 'update_note': {
      const a = args as z.infer<typeof schemas.update_note>
      const r = await updateNoteLib(env.DB, user.id, a.id, a)
      if (!r) return text(`Note not found: ${a.id}`, true)
      return json({ status: 'updated', id: r.id })
    }
    case 'get_note': {
      const a = args as z.infer<typeof schemas.get_note>
      const r = await getNote(env.DB, user.id, a.id)
      if (!r) return text(`Note not found: ${a.id}`, true)
      return json(r)
    }
    case 'search_notes': {
      const r = await searchNotes(env.DB, user.id, args as z.infer<typeof schemas.search_notes>)
      return json({ items: r })
    }
    case 'list_recent': {
      const r = await listRecent(env.DB, user.id, args as z.infer<typeof schemas.list_recent>)
      return json({ items: r })
    }
    case 'kb_stats': {
      const r = await getStats(env.DB, user.id)
      return json(r)
    }
    case 'fetch_url': {
      const a = args as z.infer<typeof schemas.fetch_url>
      const r = await fetchUrlAsText(a.url, a.max_length)
      return json(r)
    }
    default:
      return text(`Tool ${name} not implemented`, true)
  }
}

function text(s: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: s }], isError }
}

function json(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] }
}

async function fetchUrlAsText(url: string, maxLength: number): Promise<{
  url: string
  content_length: number
  content: string
}> {
  const u = new URL(url)
  const trackingParams = [
    'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'mc_cid', 'mc_eid', 'ref', '_hsenc', '_hsmi',
  ]
  for (const p of trackingParams) u.searchParams.delete(p)

  const r = await fetch(u.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; kb-vault/0.1)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`Failed to fetch: HTTP ${r.status} ${r.statusText}`)

  const ct = r.headers.get('content-type') ?? ''
  let body: string
  if (ct.includes('application/json')) {
    body = JSON.stringify(await r.json(), null, 2)
  } else {
    const html = await r.text()
    body = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (body.length > maxLength) body = body.slice(0, maxLength) + '\n\n...(truncated)'

  return { url: u.toString(), content_length: body.length, content: body }
}
