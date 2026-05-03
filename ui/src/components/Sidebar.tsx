import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'
import type { User } from '../api/client'

export const NAV = [
  { path: '/',         icon: 'cards',   label: '卡片牆' },
  { path: '/search',   icon: 'search',  label: '搜尋' },
  { path: '/graph',    icon: 'globe',   label: '知識圖譜' },
  { path: '/rss',      icon: 'sparkle', label: 'RSS 訂閱' },
  { path: '/settings', icon: 'slider',  label: '設定' },
] as const

interface SidebarProps {
  open: boolean
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  onClose: () => void
  user: User | null
  onLogout: () => void
}

export default function Sidebar({ open, collapsed, setCollapsed, onClose, user, onLogout }: SidebarProps) {
  return (
    <aside
      className={`shrink-0 h-full border-r border-slate-200 dark:border-slate-900 bg-slate-50/60 dark:bg-slate-950/70 backdrop-blur flex flex-col transition-all duration-300 ease-out ${collapsed ? 'w-[68px]' : 'w-60'} ${open ? 'flex' : 'hidden lg:flex'}`}
    >
      {/* brand */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200 dark:border-slate-900">
        <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-sm shrink-0">🧠</div>
        {!collapsed && (
          <div className="ml-2.5 min-w-0">
            <div className="text-[13px] font-semibold truncate">Free Second Brain</div>
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">bring your own claude</div>
          </div>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-slate-500">
            主功能
          </div>
        )}
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onClose}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13.5px] transition ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`
            }
          >
            <Icon name={item.icon} className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* bottom: collapse + user */}
      <div className="border-t border-slate-200 dark:border-slate-900 p-2 space-y-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-full items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100"
          title={collapsed ? '展開' : '收合'}
        >
          <Icon name={collapsed ? 'chevR' : 'chevL'} className="w-4 h-4" />
          {!collapsed && <span>收合側欄</span>}
        </button>
        <div className={`flex items-center gap-2.5 px-2 py-2 rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 ${collapsed ? 'justify-center' : ''}`}>
          {user ? (
            <>
              {user.picture ? (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                  {(user.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{user.email}</div>
                  <button onClick={onLogout} className="text-[10px] text-slate-400 hover:text-red-500 transition">登出</button>
                </div>
              )}
            </>
          ) : (
            <NavLink
              to="/login"
              className={`flex items-center gap-2 text-[12.5px] font-medium text-accent hover:underline ${collapsed ? '' : 'w-full'}`}
            >
              <Icon name="user" className="w-4 h-4 shrink-0" />
              {!collapsed && <span>登入</span>}
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  )
}
