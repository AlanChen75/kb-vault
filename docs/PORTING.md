# Porting from kb-mcp to kb-vault

> **重點**：kb-mcp 的儲存模型是 **GitHub repo（檔案路徑為主鍵）**，kb-vault 改成 **D1（ulid 為主鍵）**。所以**業務邏輯大部分要重寫**，只有「格式」「外部 API client」「prompt 字串」可以直接搬。

## 三類分法

### ✅ 直接移植（已完成）

| kb-mcp 來源 | kb-vault 目的地 | 說明 |
|---|---|---|
| `src/note-formatter.ts` | `server/src/lib/note-format.ts` | `generateNotePath` / `generateRawPath` / `parseFrontmatter` / `NOTE_FORMAT_DESCRIPTION`（中文 prompt 格式範本） |
| `src/github-api.ts` | `server/src/lib/github-backup.ts` | GitHub Contents API 操作（read/list/upsert/delete），改為**選配 backup adapter** |
| `src/index.ts`（11 個 tool 描述） | `server/src/mcp/tools.ts` | tool name + 中文 description + zod schema |

### ⚠️ 部分重用（已完成）

| kb-mcp 設計 | kb-vault 改法 |
|---|---|
| McpAgent SDK + Durable Object | 拔掉，改 stateless HTTP JSON-RPC 自寫 dispatcher（`src/mcp/handler.ts`） |
| GitHub OAuth + token-as-env-prop | 拔掉，改 Google OAuth + cookie session + 獨立 MCP Bearer token |
| 11 tool 全部呼叫 GitHub API | 改呼叫 `lib/notes.ts`（D1 操作）。GitHub 退化為**單向 backup sync**，不是讀寫主路徑 |
| `KB_REPO` 寫死 `AlanChen75/knowledge-base` | 改 env `GITHUB_REPO`，每使用者可自訂 |

### ❌ 全新撰寫（已完成）

| kb-vault 新模組 | 為什麼不能搬 |
|---|---|
| `server/src/lib/notes.ts`（D1 CRUD + FTS5 search） | kb-mcp 沒有 D1 概念，搜尋是用 GitHub Search API |
| `server/src/api/*.ts`（REST endpoints） | kb-mcp 沒有 REST API，只有 MCP |
| `server/src/auth/google.ts`（Google OAuth） | kb-mcp 用 GitHub OAuth |
| `server/src/auth/session.ts`（cookie + Bearer 雙軌驗證） | kb-mcp 沒有 SPA UI，沒有 session |
| `server/src/cron/rss-fetch.ts`（RSS 自動抓取） | kb-mcp 沒有 RSS 功能 |
| `server/src/api/tokens.ts`（MCP token 管理） | kb-mcp 用 OAuth 直接給 token，無管理 UI |
| `ui/*`（React SPA） | kb-mcp 沒有 UI |

## 實作完成度（2026-05-02 commit 後）

| 模組 | 狀態 |
|---|---|
| Spec docs (5 篇) | ✅ 完成 |
| D1 schema | ✅ 完成 |
| Worker 入口 + Hono routing | ✅ 完成 |
| Google OAuth flow | ✅ 完成 |
| Session middleware | ✅ 完成 |
| MCP token 管理（產生/列表/撤銷） | ✅ 完成（撤銷 KV 清除為 known limitation）|
| **MCP Stateless handler** | ✅ 完成 |
| **MCP tools 7 個業務邏輯** | ✅ 完成（create/update/get/search/list_recent/kb_stats/fetch_url）|
| **REST: notes CRUD** | ✅ 完成 |
| **REST: search FTS5** | ✅ 完成 |
| REST: graph | ✅ 基本完成 |
| REST: rss feeds + items | ✅ 基本完成 |
| RSS Cron handler | ✅ 完成 |
| GitHub backup sync | ✅ 完成（push 路徑，含 sync_log 增量）|
| Notion sync | ⏸️ TODO |
| RSS item → Note 轉換 | ⏸️ TODO（API endpoint skeleton 已留）|
| UI 全部頁面 | ⏸️ TODO（router skeleton 已留）|

## 開始試跑（需要先實作 UI 才能用 OAuth；MCP 部分已可獨立測）

```bash
cd server
npm install
npx wrangler login
npx wrangler d1 create kb-vault                         # 拿 ID 回填 wrangler.jsonc
npx wrangler d1 execute kb-vault --file=schema.sql --remote
npx wrangler kv namespace create SESSIONS               # 拿 ID 回填
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET                  # openssl rand -hex 32
npx wrangler secret put ALLOWED_EMAILS                  # alan@x.com
npx wrangler deploy
```

部署後 `/health` 應該回 `{ ok: true }`。剩下流程 see `docs/DEPLOYMENT.md`。

## 拒絕移植 / 不再做的東西

| kb-mcp 有的 | 為什麼 kb-vault 不要 |
|---|---|
| `openspec_propose` / `openspec_apply` 模板工具 | 這兩個只是回傳大模板字串，沒實際邏輯，留在 Claude.ai 對話 prompt 即可，不必當 MCP tool |
| `read_repo_file` / `list_repo_files`（讀任意 GitHub repo） | 跟 KB 主軸無關，是 kb-mcp 順手做的功能。要的話放選配 plugin |
| McpAgent SDK 強塞的 instructions（記憶系統 prompt） | 那是 kb-mcp 為了 GitHub-as-storage 補的記憶機制，kb-vault 用 SPA + D1 不需要 |
| `raw/` 備份檔自動寫入 | kb-vault 在 D1 有完整內容紀錄 + sync_log，不需要再寫一份 raw |

## 建議下一步（從這裡接著做）

1. **試跑 MCP**：deploy server，產一個 token，curl 戳 `/mcp` 用 `tools/list` 看 7 個工具列出來
2. **補 Notion sync**：照 `lib/github-backup.ts` 模式建一個 `lib/notion-sync.ts`
3. **補 RSS item→note 轉換**：`api/rss.ts` 的 POST `/items/:id/save` 把 RSS item 內容改寫成 markdown 後丟進 createNote
4. **寫 UI**：先做 `/`（卡片 grid）和 `/note/:id`（detail），其他延後
5. **deploy demo**：綁網域，公開出來
