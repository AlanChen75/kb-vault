# kb-vault UI

React + Vite SPA, deployed to Cloudflare Pages.

## Dev

```bash
npm install
echo "VITE_API_URL=http://localhost:8787" > .env.development
npm run dev
```

Vite proxies `/api/*` and `/auth/*` to `localhost:8787` automatically.

## Build & deploy

```bash
echo "VITE_API_URL=https://kb-vault-api.<your-subdomain>.workers.dev" > .env.production
npm run build
npx wrangler pages deploy dist --project-name kb-vault
```

## Pages to implement

| Route | Description |
|---|---|
| `/` | Card grid with category/tag filter |
| `/note/:id` | Card detail with markdown render, backlinks |
| `/graph` | Interactive graph (vis-network) |
| `/search` | Full-text search results |
| `/rss` | RSS subscriptions + inbox |
| `/settings` | MCP tokens, sync targets, allowlist |
| `/login` | Google OAuth entry |
