/**
 * Daily RSS fetch cron handler.
 *
 * 1. Load all active feeds across all users
 * 2. fetch each, parse RSS XML
 * 3. INSERT OR IGNORE rss_items (de-dupe by guid)
 * 4. Update last_fetched_at
 *
 * Runs from index.ts scheduled() handler.
 */

import { ulid } from 'ulid'
import type { Env } from '../types'

export async function runRssFetch(env: Env): Promise<void> {
  const feeds = await env.DB.prepare(
    'SELECT id, user_id, url, category FROM rss_feeds WHERE active = 1'
  ).all<{ id: string; user_id: string; url: string; category: string | null }>()

  console.log(`[rss] processing ${feeds.results.length} feeds`)

  for (const feed of feeds.results) {
    try {
      await fetchAndStore(env, feed)
    } catch (e) {
      console.error(`[rss] feed ${feed.id} failed:`, e)
    }
  }
}

async function fetchAndStore(
  env: Env,
  feed: { id: string; user_id: string; url: string; category: string | null }
): Promise<void> {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'kb-vault/0.1 (RSS fetcher)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  const items = parseRss(xml)

  const now = Date.now()
  const stmts = items.map((it) =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO rss_items (id, feed_id, guid, title, link, summary, published_at, fetched_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(
      ulid(),
      feed.id,
      it.guid,
      it.title,
      it.link,
      it.summary,
      it.published_at,
      now
    )
  )

  if (stmts.length) await env.DB.batch(stmts)

  await env.DB.prepare('UPDATE rss_feeds SET last_fetched_at = ? WHERE id = ?')
    .bind(now, feed.id)
    .run()
}

type ParsedItem = {
  guid: string
  title: string | null
  link: string | null
  summary: string | null
  published_at: number | null
}

/**
 * Minimal RSS / Atom parser. Worker has no DOM; we use regex on well-formed XML.
 * For production, consider a tiny parser library.
 */
function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml))) {
    const block = m[2]
    const title = pick(block, 'title')
    const link =
      pick(block, 'link') ??
      pickAttr(block, 'link', 'href')
    const guid =
      pick(block, 'guid') ?? pick(block, 'id') ?? link ?? ulid()
    const summary =
      pick(block, 'description') ?? pick(block, 'summary') ?? pick(block, 'content')
    const pubDate = pick(block, 'pubDate') ?? pick(block, 'published') ?? pick(block, 'updated')

    items.push({
      guid,
      title: clean(title),
      link: clean(link),
      summary: clean(summary)?.slice(0, 5000) ?? null,
      published_at: pubDate ? Date.parse(pubDate) || null : null,
    })
  }
  return items
}

function pick(s: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = s.match(re)
  return m ? m[1] : null
}

function pickAttr(s: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i')
  const m = s.match(re)
  return m ? m[1] : null
}

function clean(s: string | null): string | null {
  if (!s) return null
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
