# Free Second Brain

> **Open-source Second Brain for the LLM age. Bring your own Claude.**
>
> 第一個 agent-native 的個人知識庫。Tiago Forte 教你蓋 Second Brain，但你還是要自己整理。**Free Second Brain** 接上 Claude（任何訂閱層級）後，body 自己長大 — skills 累積、cards 變密、memory 沉澱。
>
> 100% Cloudflare Free Tier，月費 **US$0**，開源 MIT，可移植到任何 Edge runtime。
>
> _Codename: kb-vault_

---

## 為什麼這不只是又一個 KM

| 維度 | Obsidian / Notion / Roam | Free Second Brain |
|---|---|---|
| 卡片 / 連結 / 搜尋 / 圖譜 | ✅（成熟）| ✅（基本但夠用）|
| 同步 / 備份 | ✅ | ✅（Notion + GitHub）|
| **AI 一級公民** | ❌（要 plugin / 自寫 API）| ✅（**MCP 內建**）|
| **Skill 累積**（agentskills.io 標準）| ❌ | ✅ |
| **Memory 跨 session** | ❌ | ✅ |
| **Agent 自我成長** | ❌ | ✅ |
| **跨 LLM client**（Claude / Cursor / Codex / Gemini）| ❌ | ✅ |
| 開源 / 自架 / 月費 $0 | 部分 | 全部 |

**戰場不一樣**：傳統 PKM 是給「人」用的，AI 是後加的二級公民。Free Second Brain **一開始就為 AI agent 而生**，給人和 AI 共用。

---

## 設計哲學：Body + Brain 解耦

```
[Brain — 你接的 LLM]
       Claude.ai / Cursor / Codex / Zed
       ↑↓ 透過 MCP 標準介面
[Body — Free Second Brain（這個 repo）]
  ├─ cards/         # Markdown 卡片，知識庫
  ├─ skills/        # 流程 / 經驗，agentskills.io 格式
  ├─ memory/        # 跨 session 偏好沉澱
  ├─ MCP server     # 給 LLM 操作的標準介面
  ├─ RSS auto-collect
  ├─ Notion sync / GitHub backup
  └─ Web UI（你也能用）
```

- **Body 永遠免費 + 開源 + 可移植**（Cloudflare → Vercel → 自架）
- **Brain 你自己選 / 自由升級**（Claude 升 Opus 5 → 你的 body 自動變強）
- **Body 跨 brain 切換不丟資產**：你的 skills、cards、memory 永遠在你手上

---

## ✨ Features

| | |
|---|---|
| 📝 **Cards** | Markdown 卡片，含分類、標籤、雙向連結 |
| 🔍 **Full-text search** | D1 FTS5 全文搜尋 |
| 🌐 **Graph view** | 卡片關係圖譜（互動式） |
| 📡 **RSS auto-collect** | 訂閱 Google News 關鍵字，每日自動入庫 |
| 🤖 **MCP server** | Stateless HTTP JSON-RPC，任何 MCP client 直接讀寫 |
| 🧠 **Skill auto-suggest** | 偵測「卡住 → 解決」的工作流，提示存成 skill（roadmap）|
| 🔄 **Notion sync** | 選配，把卡片同步到 Notion DB |
| 📦 **GitHub backup** | 選配，定期 push 成 markdown repo（git history 免費版本控制）|
| 🔒 **GitHub OAuth + Magic Link** | 登入彈性 |
| 💰 **$0/month** | 100% Cloudflare Free Tier 可承載單人用量 |

---

## Architecture

```
                ┌──── Cloudflare Pages（SPA UI）
                │     React + Tailwind + Vite
                │     卡片牆 / 圖譜 / 搜尋 / RSS / 設定 / MCP token 管理
                │
   使用者 ────┤
       ↓        │
   LLM ────────┤
   (MCP client)│
                │
                └──── Cloudflare Worker（Hono, stateless）
                       ├─ /auth/*          GitHub OAuth + Magic Link
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
| UI | React + Tailwind + Vite + Cloudflare Pages | 快、免費託管、跨裝置 RWD |
| API | Hono + Cloudflare Worker | Stateless、Edge-native、極輕量 |
| Storage | Cloudflare D1（SQLite + FTS5）| 免費 5GB，全文搜尋內建 |
| Session | Cloudflare KV | 快查、免費 1GB |
| Auth | GitHub OAuth + Magic Link | 雙軌彈性，UI 自動偵測啟用哪些 |
| MCP | Stateless HTTP JSON-RPC（雙路徑：Bearer + ?token=）| 跨 client 相容（Claude.ai web 必經 query token）|
| Cron | Workers Cron Triggers | 內建免費 |

**沒用 Durable Objects。** 個人 KB 不需要，且 DO 綁 Cloudflare SDK 會傷移植性。完整理由見 [docs/ARCHITECTURE.md#why-no-durable-objects](docs/ARCHITECTURE.md#why-no-durable-objects)。

---

## Quick Start — Fork 你自己的 Second Brain

```bash
git clone https://github.com/AlanChen75/kb-vault.git my-second-brain
cd my-second-brain

# 1. 部署 Worker + D1
cd server && cp .dev.vars.example .dev.vars   # 填 OAuth keys
npx wrangler d1 create kb-vault                # 拿到 database_id 填回 wrangler.jsonc
npx wrangler d1 execute kb-vault --file=schema.sql --remote
npx wrangler kv namespace create SESSIONS      # 拿到 id 填回 wrangler.jsonc
npx wrangler deploy

# 2. 部署 UI
cd ../ui && npm install && npm run build
npx wrangler pages deploy dist --project-name my-second-brain
```

完整步驟：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 接 LLM 用（核心使用方式）

部署完成後，在 Claude.ai / Cursor / Codex / 任何 MCP client → Add custom connector：

```
Name: my-second-brain
URL:  https://your-worker.workers.dev/mcp?token=<your-mcp-token>
```

之後跟 Claude 講話：

> 「把這個 Hacker News 文章存成卡片，分類 tech，連結到上週那篇關於 RAG 的卡片」
>
> 「找我所有提到 transformer 的卡片，整理成 3 個 trend 寫成週報」
>
> 「這個 RSS 訂閱新進來的 50 篇論文，按主題分類後幫我看哪 3 篇值得讀」

Claude 透過 MCP 直接操作你的 Second Brain。**你下指令，body 替你做事**。

MCP tools 規格：[docs/MCP.md](docs/MCP.md)

---

## 學員 Onboarding 階梯

| 階段 | 你做什麼 | 收穫 |
|---|---|---|
| **A. Fork** | clone repo + 部署 + 接 Claude | 5 分鐘啟動一個 agent body |
| **B. 養 body** | 真實做任務，遇到「卡住 → 解決」就存成 skill | body 越用越像你 |
| **C. 看範例** | 參考老師的 [agent-kb skills 區](https://agent-kb.cooperation.tw)，學寫高品質 skill | 學會方法論 |
| **D. 製造** | 學 IDE + git + wrangler，把點子做成完整 project | 從消費者變創造者 |

---

## Status

- [x] Worker 完整實作（auth + REST + MCP + RSS cron + Notion/GitHub sync）
- [x] UI 7 頁 + RWD（Tailwind + Sidebar + Topbar drawer）
- [x] 架構驗證：Claude **免費帳號** 加 custom MCP connector 成功
- [x] Demo 站部署：[https://kb-vault.pages.dev](https://kb-vault.pages.dev)
- [x] GitHub public repo
- [ ] Skill auto-suggest 機制（roadmap）
- [ ] Skill UI 列表頁（roadmap）
- [ ] Phase B 工作坊講義

---

## Roadmap

| 版本 | 內容 |
|---|---|
| v1.0（current）| Body 預組裝完成（cards / search / graph / RSS / Notion / GitHub / MCP）|
| v1.1 | Skill auto-suggest（偵測「卡住 → 解決」工作流，inline 確認後寫入）|
| v1.2 | Memory schema 規範化 + 跨 session 偏好沉澱 |
| v2.0 | Marketplace？暫時否決（[詳見哲學討論](#)）|

---

## License

MIT — see [LICENSE](LICENSE)

> "All the body. Bring your own brain."
