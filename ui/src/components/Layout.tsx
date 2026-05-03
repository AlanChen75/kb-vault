import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api, type User } from '../api/client'

export default function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get<User>('/api/me')
      .then(setUser)
      .catch(() => null)
      .finally(() => setChecked(true))
  }, [])

  async function logout() {
    // CF Access logout — clears CF Access session for this app
    location.href = '/cdn-cgi/access/logout'
    void navigate
  }

  if (!checked) return <div className="loading">Loading…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Link to="/">📚 kb-vault</Link>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Cards</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/graph">Graph</NavLink>
          <NavLink to="/rss">RSS</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="user">
          {user ? (
            <>
              {user.picture && <img src={user.picture} alt="" className="avatar" />}
              <span className="email">{user.email}</span>
              <button onClick={logout} className="btn-text">Logout</button>
            </>
          ) : (
            <Link to="/login" className="btn">Login</Link>
          )}
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
