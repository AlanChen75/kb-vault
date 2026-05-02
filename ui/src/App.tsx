/**
 * kb-vault UI router skeleton.
 *
 * Pages to implement:
 *   /           Cards grid + filters
 *   /note/:id   Card detail with backlinks
 *   /graph      Interactive graph view
 *   /search     Full-text search
 *   /rss        RSS subscriptions + inbox
 *   /settings   MCP tokens, sync, allowlist
 *   /login      Google OAuth entry
 */

import { Routes, Route, Link } from 'react-router-dom'

export default function App() {
  return (
    <div>
      <nav style={{ padding: 16, borderBottom: '1px solid #ddd' }}>
        <Link to="/">kb-vault</Link>
        {' · '}
        <Link to="/graph">Graph</Link>
        {' · '}
        <Link to="/search">Search</Link>
        {' · '}
        <Link to="/rss">RSS</Link>
        {' · '}
        <Link to="/settings">Settings</Link>
      </nav>
      <main style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Placeholder name="Cards grid" />} />
          <Route path="/note/:id" element={<Placeholder name="Note detail" />} />
          <Route path="/graph" element={<Placeholder name="Graph view" />} />
          <Route path="/search" element={<Placeholder name="Search" />} />
          <Route path="/rss" element={<Placeholder name="RSS" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
          <Route path="/login" element={<Placeholder name="Login" />} />
        </Routes>
      </main>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div>
      <h1>{name}</h1>
      <p>TODO: implement this page.</p>
    </div>
  )
}
