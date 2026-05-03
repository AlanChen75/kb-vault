import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type User } from '../api/client'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('kb_vault_dark') === '1')
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get<User>('/api/me')
      .then(setUser)
      .catch(() => null)
      .finally(() => setChecked(true))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kb_vault_dark', dark ? '1' : '0')
  }, [dark])

  async function logout() {
    await api.post('/auth/logout').catch(() => null)
    setUser(null)
    navigate('/login')
  }

  if (!checked) return <div className="loading">Loading…</div>

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — 桌面常駐 / 手機 drawer */}
      <div className={menuOpen ? 'fixed inset-y-0 left-0 z-40 lg:static' : 'lg:static'}>
        <Sidebar
          open={menuOpen}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onClose={() => setMenuOpen(false)}
          user={user}
          onLogout={logout}
        />
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar dark={dark} setDark={setDark} onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
