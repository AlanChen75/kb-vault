# kb-vault

> Free, open-source personal knowledge base on Cloudflare. Web UI + MCP server + RSS auto-collection. **No Durable Objects required.**

免費的個人知識庫，部署在 Cloudflare Free Tier。卡片式 Web UI、Stateless MCP Server 串 Claude.ai、自動爬 Google News RSS、可選擇同步 Notion。整套不依賴 Durable Objects，月費 **US$0**，可移植到任何 Edge runtime（Vercel / Fly.io / 自架）。

---

## ✨ Features

| | |
|---|---|
| 📝 **Cards** | Markdown 卡片，含分類、標籤、雙向連結 |
| 🔍 **Full-text search** | D1 FTS5 全文搜尋 |
| 🌐 **Graph view** | 卡片關係圖譜（互動式） |
| 📡 **RSS auto-collect** | 訂閱 Google News 關鍵字，每日自動入庫 |
| 🤖 **MCP server** | Stateless HTTP JSON-RPC，從 Claude.ai 直接讀寫 |
| 🔄 **Notion sync** | 選配，把卡片同步到 Notion DB |
| 📦 **GitHub backup** | 選配，定期 push 成 markdown repo（git history 免費版本控制）|
| 🔒 **Google OAuth** | 白名單 email 登入 |
| 💰 **$0/month** | 100% Cloudflare Free Tier 可承載單人用量 |

---

## Architecture

```
                ┌──── Cloudflare Pages（SPA UI）
                │     React + Vite，卡片牆 / 圖譜 / 搜尋 / RSS / 設定
                │
   使用者 ────┤
                │
                └──── Cloudflare Worker（Hono, stateless）
                       ├─ /auth/google*    Google OAuth 流程
                       ├─ /api/notes/*     卡片 CRUD
                       ├─ /api/search      D1 FTS5 全文搜尋
                       ├─ /api/graph       卡片關係圖譜
                       ├─ /api/rss/*       RSS 訂閱與項目管理
                       ├─ /api/sync/*      Notion / GitHub 同步
                       ├─ /mcp             Stateless MCP JSON-RPC
                       └─ scheduled()      Cron：每日抓 RSS
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
            D1            KV              R2 (選配)
            筆記、tag、    session、       附件、圖片
            連結、RSS      OAuth state     大檔
            FTS5 索引     
              ↓
          (選配往外推)
              ├─ Notion API
              └─ GitHub API（push 成 md）
```

完整架構：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Stack

| Layer | Tech | Why |
|---|---|---|
| UI | React + Vite + Cloudflare Pages | 快、免費託管、無限站 |
| API | Hono + Cloudflare Worker | Stateless、Edge-native、極輕量 |
| Storage | Cloudflare D1（SQLite + FTS5）| 免費 5GB，全文搜尋內建 |
| Session | Cloudflare KV | 快查、免費 1GB |
| Auth | Google OAuth | 普及、無需 GitHub 帳號 |
| MCP | Stateless HTTP JSON-RPC | 不依賴特定 SDK，可移植 |
| Cron | Workers Cron Triggers | 內建免費 |
| AI（選配）| Workers AI | 摘要、向量化，10K neurons/day 免費 |

**沒用 Durable Objects。** 為什麼？見 [docs/ARCHITECTURE.md#why-no-durable-objects](docs/ARCHITECTURE.md#why-no-durable-objects)。

---

## Quick Start

```bash
git clone https://github.com/AlanChen75/kb-vault.git
cd kb-vault
# 部署 Worker + D1
cd server && cp .env.example .dev.vars
npx wrangler d1 create kb-vault                    # 拿到 database_id 填回 wrangler.jsonc
npx wrangler d1 execute kb-vault --file=schema.sql --remote
npx wrangler kv namespace create SESSIONS          # 拿到 id 填回 wrangler.jsonc
npx wrangler deploy
# 部署 UI
cd ../ui && npm install && npm run build
npx wrangler pages deploy dist --project-name kb-vault
```

完整步驟：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Use it from Claude.ai

部署完成後，在 Claude.ai → Connectors → Add custom connector：

```
Name: kb-vault
URL: https://kb-vault-api.<your-subdomain>.workers.dev/mcp
```

之後在 Claude 對話直接說「把這個存進 kb-vault」、「搜尋 kb-vault 中關於 X 的筆記」即可。

MCP tools 規格：[docs/MCP.md](docs/MCP.md)

---

## Why no Durable Objects?

DO 是 Cloudflare 強項，但適用於**多人即時協作**（白板、聊天、遊戲）。對個人單人 KB 是過度工程，而且綁 Cloudflare 特定 SDK 會傷害移植性。

kb-vault 用 stateless Worker + D1 + KV，整套可以無痛搬到：
- Vercel Edge Functions
- Fly.io
- Hono on Bun / Deno
- 自架 Node.js

需要 DO 的場景（例如 ClassClaw 課堂互動、多人辯論工作坊）建議另寫專案，不混在 KB 裡。

---

## Status

- [x] Spec 完成（README、ARCHITECTURE、API、MCP、DEPLOYMENT）
- [x] D1 schema 設計
- [x] Worker 骨架（Hono router）
- [ ] Server 完整實作
- [ ] UI SPA 完整實作
- [ ] Demo 站部署
- [ ] GitHub public repo

---

## License

MIT — see [LICENSE](LICENSE)
