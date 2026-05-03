# Deployment

整套部署到 Cloudflare 的步驟。預估時間 30 分鐘（第一次）。

---

## 前置需求

- Cloudflare 帳號（Free 即可）
- GitHub 帳號（拿 OAuth credentials）
- Node.js 20+
- `npm install -g wrangler`

---

## 給 IDE AI 用的快速版（建議）

如果你用 Claude Code / Cursor / Codex CLI 跑這個 deploy，把這段貼給它即可，AI 會逐步問你要 token：

> 我要把 `kb-vault` 部署到我的 Cloudflare 帳號，依 docs/DEPLOYMENT.md 走完整 Step 1-3。
> 過程中如果你需要 token / ID（GitHub OAuth、Notion、GitHub PAT 等），主動跟我要，並告訴我去哪取。
> 設完一個 secret 就跑下一步。每個 step 做完跟我確認。

下面是給人讀的完整版。

---

## Step 1：GitHub OAuth credentials

1. 開 https://github.com/settings/developers → New OAuth App
2. **Homepage URL**: `https://<your-pages>.pages.dev`（部署後改）
3. **Authorization callback URL**: `https://kb-vault-api.<your-subdomain>.workers.dev/auth/github/callback`
4. 拿 `Client ID`，按 **Generate a new client secret** 拿 `Client Secret`
5. （選配）設一個 magic link 用的 email service token — 參考 [AUTH_OPTIONS.md](AUTH_OPTIONS.md)

---

## Step 2：部署 Worker + D1 + KV

```bash
git clone https://github.com/AlanChen75/kb-vault.git
cd kb-vault/server
npm install
npx wrangler login
```

### 建 D1
```bash
npx wrangler d1 create kb-vault
# 輸出會顯示 database_id，複製
```
把 `database_id` 填進 `wrangler.jsonc` 的 `d1_databases` 區塊。

```bash
npx wrangler d1 execute kb-vault --file=schema.sql --remote
```

### 建 KV
```bash
npx wrangler kv namespace create SESSIONS
# 輸出會顯示 id，複製
```
把 `id` 填進 `wrangler.jsonc` 的 `kv_namespaces`。

### 設必要 Secret（4 個，缺一不可）

```bash
# 1. Step 1 拿到的 GitHub OAuth credentials
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# 2. Session 加密鑰匙（隨機 64 字元）
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET

# 3. 登入白名單（你的 GitHub primary email，逗號分隔多個）
npx wrangler secret put ALLOWED_EMAILS
# 例：alan.chen75@gmail.com,partner@x.com
```

### 選配：Notion 同步（推卡片到 Notion DB 當鏡像）

**A. 取 Notion Integration token**
1. 開 https://www.notion.so/my-integrations → New integration
2. 給名字（例：`kb-vault-sync`），workspace 選你自己的，Type = Internal
3. 拿到 token（`ntn_...` 或 `secret_...`）

**B. 建 / 選一個 Notion Database**

DB schema **必須**對齊 kb-vault 推送格式：

| Property name | Type |
|---|---|
| `Title` | title |
| `Category` | rich_text |
| `Tags` | multi_select |
| `KbVaultId` | rich_text |
| `UpdatedAt` | date |

建議直接讓 AI 用 Notion API 建好，schema 不會錯。或在 Notion 手動建 DB → 加上面 5 個 property。

**C. 把 integration connect 到那個 DB**：DB 頁右上「…」→ Connections → 加你的 integration

**D. 取 database_id**：DB URL `https://www.notion.so/<workspace>/<DB-ID>?v=...`，DB-ID 是 32 個 hex 字元（含或不含 dash）

```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DATABASE_ID  # 那個 32 字元的 ID
```

### 選配：GitHub backup（每張卡片 push 成 markdown 檔）

**A. 建 fine-grained PAT**
1. 開 https://github.com/settings/personal-access-tokens/new
2. **Resource owner**: 你
3. **Repository access**: Only select repositories → 選一個 backup 用 repo（建議 private）
4. **Permissions**:
   - Contents: **Read and write**
   - Metadata: Read-only（必要）
5. Generate → 拿 token（`github_pat_...`）

**B. 建 backup repo**
```bash
gh repo create <你的帳號>/<repo-name>-backup --private --description "Daily backup of kb-vault notes"
```

**C. 設 secrets**
```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_REPO   # 例：alanchen75/my-kb-backup
```

### Deploy
```bash
npx wrangler deploy
# 部署成功會顯示 URL，例如 https://kb-vault-api.alan-chen75.workers.dev
```

回 Step 1 把這個 URL 加進 Google OAuth 的 redirect URIs。

---

## Step 3：部署 UI（Pages）

```bash
cd ../ui
npm install
```

設 API URL：建 `.env.production`
```
VITE_API_URL=https://kb-vault-api.<your-subdomain>.workers.dev
```

```bash
npm run build
npx wrangler pages deploy dist --project-name kb-vault
# 部署成功會給 *.pages.dev URL
```

---

## Step 4：Custom Domain（選配）

CF Dashboard → Workers & Pages → kb-vault → Custom Domains，把 `kb.example.com` 綁進 Pages，把 `api.example.com` 綁進 Worker。

UI `.env.production` 同步改：
```
VITE_API_URL=https://api.example.com
```
重新 build + deploy。

並更新 Google OAuth 的 redirect URIs 為 `https://api.example.com/auth/google/cb`。

---

## Step 5：產生 MCP Token

1. 開部署好的 UI（`https://kb-vault.pages.dev` 或自訂網域）
2. 用 Google 登入（email 必須在 `ALLOWED_EMAILS` 內）
3. 進 `/settings` → Generate MCP Token → 複製 `mcp_xxx`

---

## Step 6：在 Claude.ai 加 connector

1. https://claude.ai/settings/connectors → Add custom connector
2. 填：
   ```
   Name:  kb-vault
   URL:   https://api.example.com/mcp
   Auth:  Bearer mcp_xxx
   ```
3. 測試：在對話打「列出 kb-vault 最近 5 張卡片」

---

## 本機開發

```bash
cd server
cp .env.example .dev.vars
# 編輯 .dev.vars 填本地用的 secrets
npx wrangler dev --remote     # 用 remote D1/KV
# 或 --local 用本地模擬

# 另一個 terminal
cd ui
echo "VITE_API_URL=http://localhost:8787" > .env.development
npm run dev
```

---

## 維運

### 看日誌
```bash
npx wrangler tail
```

### D1 查詢
```bash
npx wrangler d1 execute kb-vault --command="SELECT count(*) FROM notes"
```

### 撤銷某 MCP token
UI `/settings` 點 token 旁邊「撤銷」，或 CLI：
```bash
npx wrangler kv key delete "mcp_token:mcp_xxx" --binding=SESSIONS --remote
```

### 清過期 session（不必要做，TTL 會自動）
KV TTL 會自動清，無需介入。

### Schema migration（未來改 schema 時）
```bash
# 寫一個 migrations/0001_add_xxx.sql
npx wrangler d1 execute kb-vault --file=migrations/0001_add_xxx.sql --remote
```

---

## 成本確認

部署完到 https://dash.cloudflare.com/?to=/:account/billing/subscriptions 看：
- 應該只有 Free 訂閱
- Past invoices 應該沒任何收費

每月 1 號去看 https://dash.cloudflare.com/?to=/:account/workers/overview Metrics，確認用量遠低於免費上限。

---

## 移植到非 Cloudflare 平台

| 元件 | 改法 |
|---|---|
| Hono Worker | 換 runtime（Bun / Deno / Node），routes 不變 |
| D1 | 改用 libSQL/Turso 或自架 SQLite（`lib/db.ts` 換 driver）|
| KV | 改 Upstash Redis（`lib/kv.ts` 換 driver） |
| Cron | 用平台 cron（Vercel Cron、GitHub Actions 等）|
| Pages | Vercel/Netlify 部署 SPA |

主要檔案路徑：
- `server/src/lib/db.ts` — D1 wrapper（換 driver 改這裡）
- `server/src/lib/kv.ts` — KV wrapper
- `server/src/index.ts` — Hono entry，runtime adapter
