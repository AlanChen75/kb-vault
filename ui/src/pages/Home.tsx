import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type NoteSummary } from '../api/client'

export default function Home() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    api
      .get<{ items: NoteSummary[] }>(`/api/notes${qs}`)
      .then((r) => setNotes(r.items))
      .finally(() => setLoading(false))
  }, [category])

  return (
    <div className="home-page">
      <div className="page-head">
        <h1>Cards</h1>
        <div className="actions">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="tech">tech</option>
            <option value="business">business</option>
            <option value="research">research</option>
            <option value="news">news</option>
            <option value="personal">personal</option>
          </select>
          <Link to="/note/new" className="btn-primary">+ New</Link>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="empty">
          No notes yet. Create one from Claude.ai (via MCP) or click <strong>+ New</strong>.
        </div>
      ) : (
        <div className="cards">
          {notes.map((n) => (
            <Link key={n.id} to={`/note/${n.id}`} className="card">
              <div className="card-cat">{n.category ?? 'uncategorized'}</div>
              <h3 className="card-title">{n.title}</h3>
              <div className="card-date">{new Date(n.updated_at).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
