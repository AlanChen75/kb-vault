/**
 * MCP tool definitions and dispatcher.
 *
 * Each tool is a thin wrapper around the same business logic
 * used by the REST API (lib/notes.ts, lib/rss.ts).
 */

import { z } from 'zod'
import type { Env, User } from '../types'
// import { createNote, getNote, listRecent, searchNotes, ... } from '../lib/notes'
// import { listRssItems, saveRssToNote, subscribeRss } from '../lib/rss'

export const tools = [
  {
    name: 'create_note',
    description: '建立新卡片到 kb-vault。支援 markdown content + 分類 + 標籤。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '卡片標題（30 字內建議）' },
        content: { type: 'string', description: 'Markdown 內容' },
        category: { type: 'string', description: '分類路徑，如 tech、tech/ai-ml' },
        tags: { type: 'array', items: { type: 'string' } },
        source_url: { type: 'string', description: '原始來源 URL（選填）' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_note',
    description: '更新既有卡片。',
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
    description: '讀取卡片完整內容含雙向連結。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'search_notes',
    description: '全文搜尋（D1 FTS5）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 30, default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_recent',
    description: '列出最近編輯的卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10 },
        category: { type: 'string' },
      },
    },
  },
  {
    name: 'kb_stats',
    description: '知識庫統計（總數、分類分布、近期活動）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'subscribe_rss',
    description: '新增 RSS 訂閱。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        category: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'list_rss_items',
    description: '列出 RSS 收件匣項目。',
    inputSchema: {
      type: 'object',
      properties: {
        unread: { type: 'boolean', default: true },
        limit: { type: 'number', default: 30 },
      },
    },
  },
  {
    name: 'save_rss_to_note',
    description: '把 RSS 項目轉成卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        rss_item_id: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['rss_item_id'],
    },
  },
  {
    name: 'fetch_url',
    description: '抓取網頁內容轉純文字。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        max_length: { type: 'number', default: 30000 },
      },
      required: ['url'],
    },
  },
] as const

const schemas: Record<string, z.ZodTypeAny> = {
  create_note: z.object({
    title: z.string().min(1),
    content: z.string(),
    category: z.string().optional(),
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
  subscribe_rss: z.object({
    url: z.string().url(),
    title: z.string().optional(),
    category: z.string().optional(),
  }),
  list_rss_items: z.object({
    unread: z.boolean().default(true),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  save_rss_to_note: z.object({
    rss_item_id: z.string(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
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
  if (!schema) {
    return text(`Unknown tool: ${name}`, true)
  }

  const args = schema.parse(rawArgs)

  // TODO: implement business logic. Skeleton only.
  switch (name) {
    case 'create_note':
      // const note = await createNote(env.DB, user.id, args)
      // return text(JSON.stringify({ id: note.id, url: `${env.APP_URL}/note/${note.id}` }))
      return text('TODO: implement create_note in lib/notes.ts')

    case 'search_notes':
      // const items = await searchNotes(env.DB, user.id, args)
      // return text(JSON.stringify(items, null, 2))
      return text('TODO: implement search_notes in lib/notes.ts')

    // ... other tools

    default:
      return text(`Tool ${name} not yet implemented`, true)
  }
}

function text(s: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: s }], isError }
}
