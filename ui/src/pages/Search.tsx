import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type SearchHit } from '../api/client'

export default function Search() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  async function doSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setHasSearched(true)
    try {
      const r = await api.get<{ items: SearchHit[] }>(
        `/api/search?q=${encodeURIComponent(q)}&limit=20`
      )
      setResults(r.items)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="search-page">
      <h1>Search</h1>
      <form onSubmit={doSearch} className="search-form">
        <input
          autoFocus
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? '…' : 'Search'}
        </button>
      </form>

      {hasSearched && !searching && results.length === 0 && (
        <div className="empty">No matches.</div>
      )}

      <ul className="search-results">
        {results.map((r) => (
          <li key={r.id}>
            <Link to={`/note/${r.id}`}>
              <h3>{r.title}</h3>
              <div className="meta">
                {r.category && <span className="badge">{r.category}</span>}
                <span className="date">{new Date(r.updated_at).toLocaleDateString()}</span>
              </div>
              <p
                className="snippet"
                dangerouslySetInnerHTML={{ __html: r.snippet ?? '' }}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
