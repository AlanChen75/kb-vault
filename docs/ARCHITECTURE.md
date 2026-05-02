# Architecture

## Overview

kb-vault 是一個 stateless Cloudflare Worker，同時提供：
1. **REST API**（給 SPA UI 用）
2. **HTTP MCP endpoint**（給 Claude.ai 用，stateless JSON-RPC 模式）
3. **Cron handler**（每日抓 RSS）

所有狀態存於 **D1**（筆記、RSS 項目、連結）+ **KV**（session、OAuth state）+ 選配 **R2**（附件）。**沒有 Durable Objects**。

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        使用者瀏覽器                                │
└──────────────┬──────────────────────────────────────┬───────────┘
               │ HTTPS                                │
               ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│  Cloudflare Pages        │          │   Claude.ai              │
│  (SPA, 靜態託管)          │          │   (MCP Connector)        │
│  ─────────────────────── │          │                          │
│  React + Vite            │          │   POST /mcp              │
│  /, /note/:id, /graph,   │          │   Bearer Token Auth      │
│  /search, /rss, /settings│          │                          │
└──────────────┬───────────┘          └──────────────┬───────────┘
               │ fetch /api/*                        │
               │ (cookie session)                    │ (Bearer)
               └─────────────────┬───────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│             Cloudflare Worker（Hono router, stateless）           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Routes:                                                 │   │
│  │  ├── /auth/google         GET   start OAuth              │   │
│  │  ├── /auth/google/cb      GET   OAuth callback           │   │
│  │  ├── /auth/logout         POST  clear session            │   │
│  │  ├── /api/me              GET   current user             │   │
│  │  ├── /api/notes           GET/POST                       │   │
│  │  ├── /api/notes/:id       GET/PUT/DELETE                 │   │
│  │  ├── /api/search?q=       GET   FTS5 search              │   │
│  │  ├── /api/graph?depth=    GET   graph nodes+edges        │   │
│  │  ├── /api/rss/feeds       GET/POST/DELETE                │   │
│  │  ├── /api/rss/items       GET                            │   │
│  │  ├── /api/rss/items/:id/save POST                        │   │
│  │  ├── /api/sync/notion     POST  manual trigger           │   │
│  │  ├── /api/sync/github     POST  manual trigger           │   │
│  │  ├── /api/tokens          GET/POST  manage MCP tokens    │   │
│  │  └── /mcp                 POST  Stateless MCP JSON-RPC   │   │
│  │                                                           │   │
│  │  scheduled():  daily RSS fetch (Cron Trigger)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└────┬─────────────────┬─────────────────┬─────────────────┬──────┘
     ▼                 ▼                 ▼                 ▼
  ┌─────┐          ┌──────────┐      ┌──────┐         ┌──────┐
  │  KV │          │    D1    │      │  R2  │         │  AI  │
  │─────│          │──────────│      │──────│         │──────│
  │ ses │          │ notes    │      │ 附件 │         │摘要  │
  │ oa  │          │ tags     │      │ 圖片 │         │embed │
  │ rl  │          │ links    │      │(選配)│         │(選配)│
  │ tok │          │ rss_*    │      │      │         │      │
  │     │          │ FTS5     │      │      │         │      │
  └─────┘          └──────────┘      └──────┘         └──────┘
                        │
                        │ (選配往外推)
                        ▼
                ┌──────────────┐    ┌──────────────────┐
                │  Notion API  │    │  GitHub API      │
                │  (sync 副本)  │    │  (push md 備份) │
                └──────────────┘    └──────────────────┘
```

---

## Component Details

### 1. Cloudflare Pages（UI）

- **技術**：React 18 + Vite + TypeScript
- **路由**（client-side）：
  - `/` — 卡片牆（grid + filter）
  - `/note/:id` — 單張卡片詳情（含雙向連結）
  - `/graph` — 圖譜（vis-network 或 cytoscape.js）
  - `/search` — 搜尋頁
  - `/rss` — RSS 訂閱管理 + 收件匣
  - `/settings` — Notion sync、MCP token、白名單管理
  - `/login` — Google OAuth 入口
- **Auth**：依賴 Worker 設的 session cookie
- **打包**：`npm run build` → `dist/` → `wrangler pages deploy`

### 2. Cloudflare Worker（API + MCP）

- **技術**：Hono v4 + TypeScript
- **特性**：完全 stateless，每個 request 獨立
- **依賴**（最小）：
  ```
  hono           # 路由
  @modelcontextprotocol/sdk  # MCP types
  zod            # 輸入驗證
  ulid           # ID 生成
  jose           # JWT
  ```

#### Auth flow

```
Browser ──GET /auth/google──→ Worker
                                │
Worker ──redirect──→ accounts.google.com
                              │
User 同意 ──redirect──→ Worker /auth/google/cb?code=...
                                │
Worker ──POST── tokens api ──→ Google
                                │
Worker 驗 email in ALLOWED_EMAILS
                                │
Worker 寫 KV: session:{sid} = {email, name, picture}
                                │
Worker ──Set-Cookie sid=...──→ Browser
                                │
Browser ──redirect /──→ UI 進入登入態
```

#### Session 機制

- KV key: `session:{sid}`（sid 是 ulid）
- KV value: `{email, name, picture, createdAt}` JSON
- TTL: 30 天（`expirationTtl: 2592000`）
- Cookie: `sid={sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
- Worker middleware：每個 `/api/*` 從 cookie 讀 sid → KV 拿 user → 注入 context

#### MCP Token 機制（給 Claude.ai 用）

UI 設定頁可以「產生 MCP Token」：
- 隨機產 32-byte token：`mcp_<base64url>`
- 存 KV: `mcp_token:{token}` = `{email, createdAt, label}` JSON（無 TTL）
- 用戶在 Claude.ai 設定 connector 時填這個 token 為 Bearer

Worker 收到 `/mcp` 請求：
- 驗 `Authorization: Bearer mcp_xxx`
- 從 KV 取 user → 執行 MCP method

撤銷：UI 列表選 token 點刪除 → KV delete。

### 3. D1 Database

[Schema 詳見 `server/schema.sql`]

關鍵表：
- `users` — 註冊使用者
- `notes` — 卡片主體（title, content markdown, category, source, user_id）
- `tags` — note ↔ tag 多對多
- `links` — note ↔ note 雙向連結（給圖譜用）
- `rss_feeds` — 訂閱來源
- `rss_items` — 抓回的項目
- `notes_fts` — FTS5 虛擬表
- `sync_log` — 推 Notion / GitHub 紀錄
- `mcp_tokens` — MCP token metadata（內容 hash 存 KV）

### 4. KV Namespace

| Key Pattern | Value | TTL | 用途 |
|---|---|---|---|
| `session:{sid}` | user JSON | 30d | UI 登入 session |
| `oauth:state:{state}` | `{redirect}` | 10m | OAuth state 驗證 |
| `mcp_token:{token}` | user JSON | none | MCP Bearer token |
| `ratelimit:{ip}:{date}` | counter | 24h | 每日請求數限流 |

### 5. Cron Trigger

`wrangler.jsonc`:
```jsonc
{
  "triggers": {
    "crons": ["0 1,5,10 * * *"]    // UTC 每日 09:00 / 13:00 / 18:00 台北
  }
}
```

`scheduled()` handler：
```
1. SELECT * FROM rss_feeds WHERE active=1
2. for each feed:
   a. fetch URL, parse RSS XML
   b. for each <item>:
      - INSERT OR IGNORE INTO rss_items (UNIQUE GUID)
   c. UPDATE last_fetched_at
3. （選配）對新項目呼叫 Workers AI 摘要
```

### 6. R2（選配）

只在使用者上傳圖片附件時使用。免費 10GB。

---

## Data Flow

### 從 UI 建立卡片
```
User 在 /note/new 表單 ──POST /api/notes─→ Worker
                                              │ verify session cookie
                                              │ zod validate body
                                              │ INSERT notes + tags + links
                                              │ UPDATE notes_fts
                                              ↓
                                          回傳 note JSON
                                              ↓
UI 更新狀態，redirect /note/:id
```

### 從 Claude.ai 建立卡片（MCP）
```
Claude.ai ──POST /mcp {method:"tools/call", name:"create_note", ...}─→ Worker
                                                                          │ verify Bearer token
                                                                          │ dispatch to mcp/handler
                                                                          │ run create_note tool
                                                                          │ INSERT notes + ...
                                                                          ↓
                                                                      JSON-RPC response
```

### RSS 自動抓取（Cron）
```
01:00 UTC ──→ Worker.scheduled()
              │ SELECT active feeds
              │ fetch each feed URL
              │ parseRSS(xml) → items
              │ INSERT OR IGNORE rss_items
              │ (optional) Workers AI summarize
              ↓
            UI /rss 頁可看到新項目，點「收進筆記」轉成 note
```

---

## Security Model

| 攻擊面 | 對策 |
|---|---|
| 未授權存取 | Google OAuth + email 白名單（env: `ALLOWED_EMAILS`） |
| Session 劫持 | HttpOnly + Secure + SameSite=Lax cookie |
| CSRF | SameSite=Lax + 寫操作要求 `Origin` header 比對 |
| MCP token 外洩 | 撤銷單一 token，不影響其他 |
| SQL injection | D1 參數化 query（prepare/bind） |
| XSS | UI 用 React 預設 escape，Markdown render 用 DOMPurify |
| Rate abuse | KV counter per IP per day（門檻 1000）|
| 外部 RSS 惡意內容 | RSS parser 不執行 JS，內容當純文字儲存 |
| Secret 外洩 | 全走 wrangler secret，不寫進 .env / git |

**資料主權**：所有資料在使用者自己的 Cloudflare 帳號，沒有第三方代管。

---

## Why no Durable Objects?

| 問題 | 答案 |
|---|---|
| DO 不是免費嗎？| SQLite-backed DO 在 Free Tier 有額度（100K req/day），個人用沒成本 |
| 那為何不用？| 1️⃣ 個人 KB 不需要多人即時協作功能 / 2️⃣ DO 綁 Cloudflare 特定 SDK，移植性差 / 3️⃣ stateless 比 stateful 簡單可靠（沒 session 失效問題） |
| 什麼時候真的需要？| 多人即時協作（白板、聊天）、強一致狀態（投票、票券）、AI Agent 個人化記憶。kb-vault 都不需要 |

如果未來要加「多人協作編輯卡片」之類功能，再個別加 DO（局部優化），不要把整套架構綁定。

---

## Free Tier 估算（單人用）

| 服務 | 限制 | 估算用量 | 使用率 |
|---|---|---|---|
| Workers | 100K req/day | 500 req/day | 0.5% |
| D1 storage | 5GB | 1 萬筆 ~50MB | 1% |
| D1 reads | 5M/day | 10K | 0.2% |
| D1 writes | 100K/day | 100 | 0.1% |
| KV | 1GB / 100K reads/day / 1K writes/day | <1MB / 1K reads / 50 writes | <0.1% |
| Pages | 無限站、500 builds/月 | 1 站、~30 builds/月 | 6% |
| Cron | 無限制 | 3 次/天 | n/a |
| R2（選配） | 10GB | 0-1GB | 0-10% |
| Workers AI（選配） | 10K neurons/day | 50 摘要 | 5% |

**月費：US$0**

---

## Portability

雖然 spec 為 Cloudflare 撰寫，刻意維持元件可換：

| Cloudflare 元件 | 等價選項 |
|---|---|
| Workers + Hono | Vercel Edge Functions / Fly.io / Bun + Hono |
| D1 (SQLite) | libSQL / Turso / 自架 SQLite |
| KV | Upstash Redis / Vercel KV |
| Pages | Vercel / Netlify / 自架 Nginx |
| Cron Triggers | Vercel Cron / GitHub Actions cron |
| R2 | S3 / Backblaze B2 |
| Workers AI（選配）| OpenAI / Gemini API |

把 `lib/db.ts`, `lib/kv.ts` 換 driver 即可換主機。
