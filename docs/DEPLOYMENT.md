# Deployment

整套部署到 Cloudflare 的步驟。預估時間 30 分鐘（第一次）。

---

## 前置需求

- Cloudflare 帳號（Free 即可）
- Google Cloud Console 帳號（拿 OAuth credentials）
- Node.js 20+
- `npm install -g wrangler`

---

## Step 1：Google OAuth credentials

1. 開 https://console.cloud.google.com/apis/credentials
2. 建 OAuth 2.0 Client ID（Web application）
3. **Authorized redirect URIs** 加：
   - `https://kb-vault-api.<your-subdomain>.workers.dev/auth/google/cb`（部署後拿到的 URL）
   - `http://localhost:8787/auth/google/cb`（本機開發）
4. 拿 `Client ID` 和 `Client Secret` 備用

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

### 設 Secret
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
# 貼上 Step 1 拿到的 Client ID

npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET     # openssl rand -hex 32
npx wrangler secret put ALLOWED_EMAILS     # alan@x.com,bob@y.com（逗號分隔）
```

### 選配 Secret
```bash
# Notion 同步
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DATABASE_ID

# GitHub 備份
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_REPO        # 如 alanchen75/my-kb-backup
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
