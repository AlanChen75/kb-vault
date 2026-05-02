import { Hono } from 'hono'
import type { Env, Variables } from '../types'

const sync = new Hono<{ Bindings: Env; Variables: Variables }>()

sync.post('/notion', async (c) => {
  // TODO: read NOTION_TOKEN + NOTION_DATABASE_ID, push notes via Notion API.
  return c.json({ error: 'not_implemented' }, 501)
})

sync.post('/github', async (c) => {
  // TODO: push notes as markdown files to GITHUB_REPO via GitHub Contents API.
  return c.json({ error: 'not_implemented' }, 501)
})

export default sync
