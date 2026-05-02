import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type RssFeed, type RssItem } from '../api/client'

export default function Rss() {
  const [feeds, setFeeds] = useState<RssFeed[]>([])
  const [items, setItems] = useState<RssItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ url: '', title: '', category: 'news' })

  async function load() {
    setLoading(true)
    const [f, i] = await Promise.all([
      api.get<{ items: RssFeed[] }>('/api/rss/feeds'),
      api.get<{ items: RssItem[] }>('/api/rss/items?unread=true&limit=50'),
    ])
    setFeeds(f.items)
    setItems(i.items)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function addFeed(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.url) return
    await api.post('/api/rss/feeds', {
      url: draft.url,
      title: draft.title || undefined,
      category: draft.category || undefined,
    })
    setDraft({ url: '', title: '', category: 'news' })
    setAdding(false)
    load()
  }

  async function deleteFeed(id: string) {
    if (!confirm('Unsubscribe?')) return
    await api.del(`/api/rss/feeds/${id}`)
    load()
  }

  async function saveItem(item: RssItem) {
    const r = await api.post<{ id: string }>(`/api/rss/items/${item.id}/save`, {
      category: item.feed_category ?? 'news',
      summarize: true,
    })
    alert('Saved as note: ' + r.id)
    load()
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="rss-page">
      <h1>RSS</h1>

      <section>
        <div className="page-head">
          <h2>Subscriptions ({feeds.length})</h2>
          <button onClick={() => setAdding(!adding)} className="btn-primary">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {adding && (
          <form onSubmit={addFeed} className="rss-form">
            <input
              placeholder="Feed URL (e.g. https://news.google.com/rss/search?q=AI&hl=zh-TW)"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              required
            />
            <input
              placeholder="Title (optional)"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <input
              placeholder="Category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
            <button type="submit" className="btn-primary">Subscribe</button>
          </form>
        )}
        <ul className="feed-list">
          {feeds.map((f) => (
            <li key={f.id}>
              <strong>{f.title || f.url}</strong>
              <span className="badge">{f.category}</span>
              <small>{f.last_fetched_at ? `last: ${new Date(f.last_fetched_at).toLocaleString()}` : 'never fetched'}</small>
              <button onClick={() => deleteFeed(f.id)} className="btn-danger">×</button>
            </li>
          ))}
          {feeds.length === 0 && <li className="empty">No subscriptions yet.</li>}
        </ul>
      </section>

      <section>
        <h2>Inbox ({items.length} unread)</h2>
        <ul className="item-list">
          {items.map((it) => (
            <li key={it.id}>
              <div>
                <a href={it.link ?? '#'} target="_blank" rel="noreferrer">
                  <strong>{it.title}</strong>
                </a>
                <div className="meta">
                  <span className="badge">{it.feed_title}</span>
                  {it.published_at && (
                    <span className="date">{new Date(it.published_at).toLocaleDateString()}</span>
                  )}
                </div>
                {it.summary && <p className="snippet">{it.summary.slice(0, 200)}…</p>}
              </div>
              <div className="actions">
                {it.saved_to_note_id ? (
                  <Link to={`/note/${it.saved_to_note_id}`} className="btn-text">View note ↗</Link>
                ) : (
                  <button onClick={() => saveItem(it)} className="btn-primary">Save</button>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="empty">Inbox is clean.</li>}
        </ul>
      </section>
    </div>
  )
}
