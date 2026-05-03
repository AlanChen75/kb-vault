# Authentication Options

kb-vault 支援兩種登入方式，**至少設好一種**才能用。可以兩種都設，UI 自動兩個按鈕都顯示。

---

## Option A：Magic Link（推薦給學員 / 一般使用者）

**零 OAuth 設定**。流程：輸入 email → 收信 → 點連結 → 登入。

### 為什麼推薦
- ✅ 不必註冊 GitHub OAuth app
- ✅ 不必跑 Google Cloud Console
- ✅ 不需要 custom domain
- ✅ 在 `*.pages.dev` / `*.workers.dev` 免費 tier 直接可跑

### 設定（3 分鐘）

1. **註冊 Resend**：https://resend.com（free tier 100 emails/day，足夠個人用 + 給少數學員）
2. **拿 API Key**：登入後 → API Keys → Create API Key（給「Sending access」權限）
3. **寫進 wrangler secret**：
   ```bash
   echo "re_YourApiKeyHere" | npx wrangler secret put RESEND_API_KEY
   ```

完成。Login 頁就會出現 email 輸入框。

### 客製寄件人（選配）
預設用 Resend 的 `onboarding@resend.dev`。想用自家 domain 寄信：
1. Resend → Domains → Add Domain（要驗 DNS）
2. 設 `wrangler secret put MAGIC_FROM_EMAIL` = `kb-vault <noreply@yourdomain.com>`

---

## Option B：GitHub OAuth（推薦給開發者）

如果你 / 你的學員都已經有 GitHub 帳號，這條路登入比 magic link 快 5-10 秒（不必切到信箱）。

### 設定（2 分鐘）

1. **建 OAuth App**：https://github.com/settings/applications/new
2. 填：
   - Application name: `kb-vault`
   - Homepage URL: `https://your-pages-url.pages.dev`
   - Authorization callback URL: `https://your-worker-url.workers.dev/auth/github/cb`
3. **拿 Client ID** → 寫 secret：
   ```bash
   echo "YourClientID" | npx wrangler secret put GITHUB_CLIENT_ID
   ```
4. **Generate client secret**（只顯示一次）→ 寫 secret：
   ```bash
   echo "YourClientSecret" | npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

完成。Login 頁會出現「Sign in with GitHub」按鈕。

---

## 共同要設的（兩個都要）

```bash
echo "you@example.com,friend@example.com" | npx wrangler secret put ALLOWED_EMAILS
echo "$(openssl rand -hex 32)" | npx wrangler secret put SESSION_SECRET
```

`ALLOWED_EMAILS` 是逗號分隔的白名單。**沒有在白名單的 email 不能登入**，不論用哪條路。

---

## 登入後體驗（兩種一樣）

- Session cookie 有效期 **30 天**
- 30 天內：直接打開網頁就是已登入態，**不必再做任何驗證動作**
- 30 天到期：再次走當初的登入流程一次

---

## UI 自動偵測

UI 會打 `GET /auth/methods` 看哪些方法被啟用：

```json
{ "magic_link": true, "github": true }
```

對應的按鈕才會顯示。沒設的不會出現。所以你可以「只設 magic link」、「只設 GitHub」、或「兩個都設」。

---

## 哪個比較適合我？

| 場景 | 建議 |
|---|---|
| 個人 daily use，已有 GitHub 帳號 | **B（GitHub OAuth）** — 一鍵登入快 |
| 給朋友 / 學員體驗，不想他們申請 OAuth app | **A（Magic Link）** — 他們開信點連結就好 |
| 不想信箱常被打擾 | B |
| 完全不想離開 Cloudflare 生態 | A（只多用 Resend 寄信，沒額外平台跑 OAuth） |
| 開源 README 主推 | **A** — 部署門檻最低 |
