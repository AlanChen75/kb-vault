# MCP Tools

kb-vault 提供 **Stateless HTTP JSON-RPC** MCP server，讓 Claude.ai 可以直接讀寫你的知識庫。

---

## Connect from Claude.ai

1. 在 kb-vault UI `/settings` 產生 MCP Token（會顯示 `mcp_xxx`，**只顯示一次**）
2. 在 Claude.ai → Settings → Connectors → Add custom connector：
   - Name: `kb-vault`
   - URL: `https://kb-vault-api.<your-subdomain>.workers.dev/mcp`
   - Auth: `Bearer mcp_xxx`
3. Claude.ai 自動 list tools，可在對話直接用

---

## Protocol

Stateless HTTP，每個請求獨立。標準 JSON-RPC 2.0。

```
POST /mcp HTTP/1.1
Authorization: Bearer mcp_xxx
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

支援 methods：
- `initialize`
- `tools/list`
- `tools/call`
- `prompts/list`（選配）
- `prompts/get`（選配）

不支援（這是 stateless 的取捨）：
- `notifications/*`（沒 SSE）
- `resources/subscribe`

---

## Tools

### `create_note`
建立新卡片。

```json
{
  "title": "RAG 入門",
  "content": "# RAG\n\nRetrieval-Augmented Generation...",
  "category": "tech",
  "tags": ["ai", "rag"],
  "source_url": "https://example.com/article"
}
```

Returns：`{ "id": "01HX...", "url": "https://kb-vault.../note/01HX..." }`

### `update_note`
更新既有卡片。

```json
{
  "id": "01HX...",
  "content": "新內容...",
  "tags": ["ai", "rag", "llm"]
}
```

### `get_note`
讀單張卡片完整內容。

```json
{ "id": "01HX..." }
```

Returns：`{ "id", "title", "content", "category", "tags", "links_in", "links_out", "created_at", "updated_at" }`

### `search_notes`
全文搜尋。

```json
{
  "query": "RAG 向量",
  "category": "tech",
  "limit": 10
}
```

Returns：`{ "items": [{ "id", "title", "snippet", "score" }] }`

### `list_recent`
最近編輯的卡片。

```json
{ "limit": 10, "category": "tech" }
```

### `kb_stats`
知識庫統計。

```json
{}
```

Returns：
```json
{
  "total_notes": 380,
  "by_category": { "tech": 145, "business": 91, ... },
  "total_tags": 234,
  "recent_activity": { "today": 3, "this_week": 12 }
}
```

### `subscribe_rss`
新增 RSS 訂閱。

```json
{
  "url": "https://news.google.com/rss/search?q=AI+agent&hl=zh-TW&gl=TW&ceid=TW:zh",
  "title": "AI Agent 新聞",
  "category": "news"
}
```

### `list_rss_items`
列出 RSS 抓回項目。

```json
{ "unread": true, "limit": 30 }
```

### `save_rss_to_note`
把 RSS 項目轉成卡片。

```json
{
  "rss_item_id": "01HX...",
  "category": "news",
  "tags": ["ai"]
}
```

### `fetch_url`
抓網頁內容（純文字）。

```json
{ "url": "https://example.com/article", "max_length": 30000 }
```

### `sync_to_notion`
手動觸發推 Notion 同步。

```json
{ "note_ids": ["01HX...", "01HY..."] }
```
若 `note_ids` 省略，推所有未同步的。

---

## Prompts（選配）

### `weekly_review`
每週回顧 prompt 模板：列出本週新增卡片、找關聯、建議延伸閱讀。

### `card_to_thread`
把卡片內容轉成 Twitter/Threads 推文串。

---

## Why stateless?

對比官方 `@cloudflare/agents` 的 McpAgent（要 Durable Objects）：

| 維度 | McpAgent (DO) | kb-vault (stateless) |
|---|---|---|
| Session 狀態 | DO 自動維持 | 每 request 重驗 token |
| SSE / streaming | 支援 | 不支援（用 JSON 回傳）|
| 連線重啟 | 自動 reconnect | 無連線概念 |
| 部署平台 | Cloudflare only | 任何 HTTP runtime |
| 運維複雜度 | 中 | 低 |
| 適合場景 | 多人即時 / 長對話 | 工具呼叫型 KB |

KB 的 tool 多是「呼叫一次拿結果」，不需要 streaming 或 long-lived session，stateless 完全夠用。

---

## Implementation Note

詳細實作見 `server/src/mcp/handler.ts`。骨架：

```typescript
import { Hono } from 'hono'
import type { McpRequest, McpResponse } from './types'

const mcp = new Hono()

mcp.post('/', async (c) => {
  // 1. 驗 Bearer token
  const auth = c.req.header('authorization')
  const user = await verifyMcpToken(c.env.SESSIONS, auth)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  // 2. parse JSON-RPC
  const body: McpRequest = await c.req.json()

  // 3. dispatch method
  switch (body.method) {
    case 'initialize':
      return c.json(initializeResponse(body.id))
    case 'tools/list':
      return c.json(toolsListResponse(body.id))
    case 'tools/call':
      return c.json(await callTool(body, user, c.env))
    default:
      return c.json({
        jsonrpc: '2.0', id: body.id,
        error: { code: -32601, message: 'Method not found' }
      })
  }
})

export default mcp
```
