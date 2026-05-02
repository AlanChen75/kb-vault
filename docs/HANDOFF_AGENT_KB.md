# Handoff Prompt — agent-kb 加「我的筆記」(Phase A)

> 從 AI100 session 移交給 agent-kb session。複製整份貼進 agent-kb 新 session 即可。

---

## Mission

在 agent-kb 加一個「我的筆記」分頁，讓學員透過 Claude MCP 寫進自己的 user_id-scoped 筆記，並能在 agent-kb 網頁上瀏覽、編輯、搜尋、刪除、匯出。這是 KB 學員漏斗 Phase A，目標是降低個人 KB 的入場門檻為 0，等學員養成習慣後再賣 Phase B 工作坊（自架 kb-vault）。

## 已決策的策略（不要再重議）

| 項目 | 決定 |
|---|---|
| 認證 | 沿用現有 cooperation-hub 中央會員，**不另外做 auth** |
| 儲存 | 新增 D1 表（推薦 reuse agent-kb 現有 D1，多一張 `user_notes` + FTS5）|
| MCP tool 命名 | **硬規則：所有個人筆記工具必須 `my_*` 前綴**，避免 Claude 誤寫公開教材 |
| UX | Claude 創建後回傳 URL `https://agent-kb.cooperation.tw/my/note/:id`，學員瀏覽器點進來看自己卡片 |
| 匯出 | 第一版就要做（zip of markdown + frontmatter），格式必須跟 kb-vault schema 對得上 |
| Phase B 路徑 | 工作坊用匯出 zip → import 到自架 kb-vault。**不要** lock-in 學員資料 |

## 漏斗 Phase A vs Phase B

- **Phase A**（這次要做）：在 agent-kb 內加多租戶個人筆記
- **Phase B**（之後 3hr 工作坊）：用 kb-vault repo 帶學員自架，包含「Deploy to Cloudflare 按鈕 + Cloudflare Access + import zip」

Phase B 已有完整 spec 在 `/Users/user/projects/kb-vault/`，本次任務不要動 kb-vault repo，但匯出格式要對齊它的 schema。

## 學員端完整 UX 流程（給設計時對照用）

```
1. 學員 Google 登入 agent-kb 網頁 → cookie sid → user_id = U1
2. 設定頁「Generate MCP token」→ mcp_xxx 對應 U1
3. 學員把 mcp_xxx 貼進 Claude.ai custom connector
4. 對 Claude 說「把這篇存進我的筆記」
   → Claude 呼叫 my_create_note
   → MCP server 用 Bearer 解析 = U1
   → INSERT INTO user_notes WHERE user_id = U1
   → 回傳 { id, url: agent-kb.cooperation.tw/my/note/:id }
5. Claude 顯示 markdown 連結給學員
6. 學員點連結 → 同瀏覽器有 cookie → 直接看到卡片
7. 也可開 agent-kb 網頁 → sidebar「我的筆記」→ 卡片牆全覽
```

## 要建的東西

### 1. D1 Schema（建議 migration 檔）

```sql
CREATE TABLE user_notes (
  id          TEXT PRIMARY KEY,           -- ulid
  user_id     TEXT NOT NULL,              -- 對應 cooperation-hub uid
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,              -- markdown
  category    TEXT,
  source      TEXT,                       -- 'manual' | 'mcp' | 'import'
  source_url  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_user_notes_user_updated ON user_notes(user_id, updated_at DESC);

CREATE TABLE user_note_tags (
  note_id TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (note_id, tag),
  FOREIGN KEY (note_id) REFERENCES user_notes(id) ON DELETE CASCADE
);

-- FTS5 全文搜尋
CREATE VIRTUAL TABLE user_notes_fts USING fts5(
  title, content,
  category UNINDEXED, user_id UNINDEXED,
  content='user_notes', content_rowid='rowid',
  tokenize='unicode61'
);
-- triggers (insert/update/delete) 同 kb-vault schema.sql 寫法
```

> 完整 schema 對照：`/Users/user/projects/kb-vault/server/schema.sql`

### 2. MCP Tools（全部 `my_*` 前綴）

| Tool | 功能 |
|---|---|
| `my_create_note` | 建立個人筆記，回傳 `{ id, url }` |
| `my_update_note` | 更新 |
| `my_get_note` | 讀取（含 frontmatter）|
| `my_search_notes` | FTS5 全文搜尋 |
| `my_list_recent` | 最近編輯列表 |
| `my_kb_stats` | 個人統計（總數、分類分布）|
| `my_delete_note` | 刪除 |

> 業務邏輯參考：`/Users/user/projects/kb-vault/server/src/lib/notes.ts`（D1 CRUD + FTS5）

**重要**：tool description 第一行就要寫「**這是建立你個人筆記的工具，不是公開教材**」讓 Claude 不會搞混。

### 3. UI「我的筆記」分頁

agent-kb sidebar 加區塊：

```
📚 公開教材（既有）
📝 我的筆記（新）
  ├─ 全部 / 分類 / 標籤
  ├─ 搜尋
  ├─ 圖譜（選配）
  └─ 設定（MCP token、匯出）
```

頁面：
- `/my` 卡片牆
- `/my/note/:id` 詳情（view + edit + delete）
- `/my/search`
- `/my/settings`

> UI 設計可直接抄 `/Users/user/projects/kb-vault/ui/src/pages/`（React + Vite，已經做完）。如果 agent-kb 用別的 framework，照樣的版型移植。

### 4. 匯出 zip（凍結格式，給 Phase B 用）

`POST /api/my/export` → 回傳 zip：

```
my-notes-20260502.zip
├─ tech/2026-04-20-rag.md       # frontmatter + markdown
├─ business/2026-04-22-pricing.md
└─ index.json                    # { id, path, tags, ... } 中介資料
```

每個 .md 含 YAML frontmatter（kb-vault `lib/note-format.ts` 同款）：

```yaml
---
title: "..."
date: 2026-04-20
category: tech
tags: [ai, rag]
kb_vault_id: 01HX...        # 給 Phase B import 用
---
```

### 5. MCP token 管理

跟 cooperation-hub 既有 token 機制整合（你應該已經有，加一個 scope/feature flag 即可）。

## 動手前要先跟用戶確認的 4 件事

依照用戶 CLAUDE.md「新功能開發必問規格」原則，動手前**必須問清**：

1. **D1 reuse 還是新建？**
   - agent-kb 目前有 D1 嗎？沒有就要新建
   - 有的話直接加 `user_notes` 表進去就好
2. **UI 框架對齊**
   - agent-kb 的 UI 是什麼 stack？要 reuse kb-vault 的 React 元件還是另寫？
3. **Tool 名稱衝突檢查**
   - 列出 agent-kb 現有 12 個 MCP tool 的名稱，確認 `my_*` 不會衝突
4. **匯出範圍**
   - 第一版只匯出 markdown，還是要連 tags/links 中介資料一起？（建議連同 index.json 全部匯出，Phase B 重建索引才完整）

## Acceptance Criteria（自驗收）

Phase A 算完成 = 滿足以下：

- [ ] 學員用 Google 登入 agent-kb 後，sidebar 看到「我的筆記」
- [ ] 在 Claude 對話呼叫 `my_create_note` → 回傳 URL → 點進去能看到卡片
- [ ] 在 agent-kb 網頁手動建卡片 / 編輯 / 刪除 都正常
- [ ] 全文搜尋只找得到自己的筆記，找不到別人的
- [ ] 公開教材的 12 個工具完全不受影響（regression test）
- [ ] 匯出 zip 下載得到，內容是 markdown + frontmatter + index.json
- [ ] 兩個學員帳號交叉測試 user_id 隔離（A 看不到 B 的筆記）
- [ ] typecheck + dry-build 通過
- [ ] 部署 staging 自己跑一輪端到端

## 參考資料（同機器其他位置）

| 路徑 | 內容 |
|---|---|
| `/Users/user/projects/kb-vault/server/schema.sql` | D1 schema 完整範本（可抄）|
| `/Users/user/projects/kb-vault/server/src/lib/notes.ts` | D1 CRUD + FTS5 業務邏輯（可抄）|
| `/Users/user/projects/kb-vault/server/src/mcp/handler.ts` | Stateless MCP handler（agent-kb 應該已有類似的）|
| `/Users/user/projects/kb-vault/server/src/mcp/tools.ts` | tool 定義 + zod schema（命名前綴需改 `my_`）|
| `/Users/user/projects/kb-vault/ui/src/pages/Home.tsx` 等 | UI 7 頁範例 |
| `~/.claude/projects/-Users-user-Desktop-AI100-/memory/project_kb-funnel-strategy.md` | 完整漏斗策略 |

> 若不在 AI100 namespace，這份 memory 抓不到。你只要記得：**Phase A = agent-kb 加我的筆記，Phase B = 工作坊用 kb-vault 自架**。

## 不要做的事

- ❌ 不要動 kb-vault repo（這次只改 agent-kb）
- ❌ 不要重做 auth（沿用 cooperation-hub）
- ❌ 不要把個人筆記跟公開教材塞同一個 KV/同一張表
- ❌ 不要省略 `my_` 前綴（Claude 會搞混）
- ❌ 不要 lock-in 資料格式（匯出格式必須跟 kb-vault schema 對齊）
- ❌ 不要在沒問用戶上面那 4 件事就開始 coding

---

**現在請先做：**
1. 讀 agent-kb 程式碼了解現況（D1 有沒有、UI stack 是什麼、現有 MCP tools 列表）
2. 把上面 4 個問題一次問完用戶
3. 拿到答案後寫一份精簡實作計畫（檔案結構 + 修改清單），給用戶確認
4. 確認後再 coding
