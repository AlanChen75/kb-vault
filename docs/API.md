# API Reference

Base URL：`https://kb-vault-api.<your-subdomain>.workers.dev`

---

## Auth

UI 路徑用 cookie session（`sid`）。MCP 路徑用 Bearer token。

### `GET /auth/google`
觸發 Google OAuth 流程。Worker 產生 state 寫進 KV，redirect 到 Google。

### `GET /auth/google/cb?code=...&state=...`
OAuth 回呼。驗證 state、換 token、取 userinfo、檢查 email 白名單、寫 session、redirect `/`.

### `POST /auth/logout`
清除 session cookie + KV session。

### `GET /api/me`
回傳當前登入使用者資訊。

```json
{ "email": "alan@x.com", "name": "Alan", "picture": "..." }
```

---

## Notes

### `GET /api/notes`
列表，支援分頁與過濾。

Query params:
- `category` — 限定分類
- `tag` — 限定標籤
- `q` — 模糊搜尋標題（精確搜尋用 `/api/search`）
- `sort` — `updated` | `created` | `title`（default: `updated`）
- `page` — 頁碼（default: 1）
- `limit` — 每頁數量（default: 20, max: 100）

Response:
```json
{
  "items": [
    { "id": "01HX...", "title": "...", "category": "tech", "tags": ["ai"], "updated_at": 1714... }
  ],
  "total": 380,
  "page": 1,
  "limit": 20
}
```

### `POST /api/notes`
建立新卡片。

Body:
```json
{
  "title": "...",
  "content": "# Markdown 內容",
  "category": "tech",
  "tags": ["ai", "llm"],
  "links": []
}
```

Response：完整 note 物件。

### `GET /api/notes/:id`
取單張卡片。Response 含 `links_in`（誰連到我）和 `links_out`（我連到誰）。

### `PUT /api/notes/:id`
更新卡片。Body 同 POST。

### `DELETE /api/notes/:id`
刪除（連同 tags、links 級聯刪除）。

---

## Search

### `GET /api/search?q=keyword&category=tech&limit=10`
D1 FTS5 全文搜尋。回傳含 snippet 的結果。

```json
{
  "items": [
    {
      "id": "01HX...",
      "title": "RAG 入門",
      "snippet": "...<mark>RAG</mark> 是一種...",
      "score": 1.2
    }
  ]
}
```

---

## Graph

### `GET /api/graph?depth=2&start=:id`
回傳卡片關係圖。`start` 可省略（取最近 N 張卡片）。

```json
{
  "nodes": [
    { "id": "01HX...", "label": "RAG 入門", "category": "tech", "size": 5 }
  ],
  "edges": [
    { "from": "01HX...", "to": "01HY...", "type": "wiki" }
  ]
}
```

---

## RSS

### `GET /api/rss/feeds`
列出訂閱來源。

### `POST /api/rss/feeds`
新增訂閱。Body：
```json
{
  "url": "https://news.google.com/rss/search?q=AI+agent&hl=zh-TW&gl=TW&ceid=TW:zh",
  "title": "AI Agent 新聞",
  "category": "news"
}
```

### `DELETE /api/rss/feeds/:id`
取消訂閱。

### `GET /api/rss/items?feed_id=&unread=true&limit=50`
列出抓回的 RSS 項目。

### `POST /api/rss/items/:id/save`
把 RSS 項目轉成卡片。Body：
```json
{
  "category": "news",
  "tags": ["ai"],
  "summarize": true
}
```
若 `summarize: true` 且環境變數有 `AI_BINDING`，會用 Workers AI 產生摘要當 content。

---

## Sync

### `POST /api/sync/notion`
手動觸發把所有未同步的卡片推到 Notion DB。需先在 settings 設好 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`。

Response：
```json
{ "synced": 12, "failed": 0, "skipped": 5 }
```

### `POST /api/sync/notion/auto`
設定每次新建/更新卡片時自動推 Notion。Body：
```json
{ "enabled": true }
```

### `POST /api/sync/github`
手動觸發把所有卡片 push 成 markdown 檔到指定 GitHub repo。需設 `GITHUB_TOKEN`、`GITHUB_REPO`。

---

## MCP Token Management

### `GET /api/tokens`
列出所有已產生的 MCP token（不包含原始值，只顯示 metadata）。

### `POST /api/tokens`
產生新 token。Body：`{ "label": "Claude Desktop" }`。

Response（**只回傳一次原始值**，存好）：
```json
{
  "id": "01HX...",
  "label": "Claude Desktop",
  "token": "mcp_aBcD...",
  "created_at": 1714...
}
```

### `DELETE /api/tokens/:id`
撤銷 token。

---

## MCP

### `POST /mcp`
Stateless JSON-RPC endpoint for Claude.ai。詳見 [MCP.md](MCP.md)。

Headers：`Authorization: Bearer mcp_xxx`

---

## Error Format

```json
{
  "error": {
    "code": "validation_failed",
    "message": "title 必填",
    "details": { "field": "title" }
  }
}
```

HTTP status codes：
- `200` 成功
- `400` 輸入驗證失敗
- `401` 未認證
- `403` 沒權限
- `404` 找不到
- `409` 衝突（重複建立）
- `429` Rate limit
- `500` 內部錯誤
