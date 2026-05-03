import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'

const titles: Record<string, { zh: string; sub: string }> = {
  '/':         { zh: '卡片牆',     sub: '所有筆記' },
  '/search':   { zh: '搜尋',       sub: 'FTS5 全文檢索' },
  '/graph':    { zh: '知識圖譜',   sub: 'tag 關聯視覺化' },
  '/rss':      { zh: 'RSS 訂閱',   sub: '自動抓取新聞' },
  '/settings': { zh: '設定',       sub: 'MCP token / 帳號' },
}

interface TopbarProps {
  dark: boolean
  setDark: (d: boolean) => void
  onMenu: () => void
}

export default function Topbar({ dark, setDark, onMenu }: TopbarProps) {
  const location = useLocation()
  const t = titles[location.pathname] ?? (
    location.pathname.startsWith('/note') ? { zh: '筆記', sub: '單篇內容' } : { zh: '', sub: '' }
  )

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-slate-200 dark:border-slate-900 bg-white/70 dark:bg-slate-950/70 backdrop-blur sticky top-0 z-20">
      <button
        onClick={onMenu}
        aria-label="menu"
        className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Icon name="menu" className="w-5 h-5" />
      </button>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-none">{t.zh}</div>
        <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{t.sub}</div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setDark(!dark)}
          className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
          title={dark ? '切換淺色' : '切換深色'}
        >
          <Icon name={dark ? 'sun' : 'moon'} className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  )
}
