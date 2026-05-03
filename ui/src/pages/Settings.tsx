import { useEffect, useState } from 'react'
import { api, type McpToken, type KbStats } from '../api/client'

function ConnectionDetails({
  token,
  apiUrl,
  onDismiss,
}: {
  token: string
  apiUrl: string
  onDismiss: () => void
}) {
  const connectorUrl = `${apiUrl}/mcp?token=${token}`

  const [copied, setCopied] = useState(false)
  function copyConnector() {
    navigator.clipboard.writeText(connectorUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="alert">
      <strong>⚠️ 連接器 URL 含你的 token，**只顯示這一次**，立刻複製</strong>

      <button
        onClick={copyConnector}
        className="btn-primary"
        style={{
          width: '100%',
          marginTop: 12,
          padding: '14px 16px',
          fontSize: 14,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {copied ? '✓ 已複製整段，可貼進 Claude connector URL 欄位' : '📋 複製連接器 URL（含 token）'}
      </button>

      <code
        style={{
          display: 'block',
          marginTop: 12,
          padding: 10,
          fontSize: 11,
          wordBreak: 'break-all',
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 4,
        }}
      >
        {connectorUrl}
      </code>

      <p className="hint" style={{ marginTop: 12 }}>
        <strong>怎麼用：</strong>
      </p>
      <ol className="hint" style={{ paddingLeft: 20, margin: '4px 0' }}>
        <li>到 Claude.ai → Settings → Connectors → <strong>Add custom connector</strong></li>
        <li>Name 自己填（例：<code>kb-vault</code>）</li>
        <li><strong>Remote MCP server URL</strong> 欄位直接貼整段（含 <code>?token=...</code>）</li>
        <li>OAuth Client ID / Secret <strong>留白</strong>，按 Save</li>
        <li>進對話試問「列出 kb-vault 最近的卡片」</li>
      </ol>

      <p className="hint" style={{ marginTop: 12, color: '#dc2626' }}>
        ⚠️ 這個 URL 含你的 token = 等於密碼。不要分享、不要 commit 到 GitHub。萬一外洩，回來 Revoke 重產一個即可。
      </p>

      <button
        onClick={onDismiss}
        className="btn-text"
        style={{ marginTop: 12 }}
      >
        關閉
      </button>
    </div>
  )
}

export default function Settings() {
  const [tokens, setTokens] = useState<McpToken[]>([])
  const [stats, setStats] = useState<KbStats | null>(null)
  const [newTokenLabel, setNewTokenLabel] = useState('')
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<'notion' | 'github' | null>(null)
  const [syncResult, setSyncResult] = useState<string>('')

  async function load() {
    const [t, s] = await Promise.all([
      api.get<{ items: McpToken[] }>('/api/tokens'),
      api.get<KbStats>('/api/stats').catch(() => null),
    ])
    setTokens(t.items)
    if (s) setStats(s)
  }
  useEffect(() => { load() }, [])

  async function generateToken(e: React.FormEvent) {
    e.preventDefault()
    const r = await api.post<{ token: string; id: string }>(
      '/api/tokens',
      newTokenLabel ? { label: newTokenLabel } : {}
    )
    setJustCreated(r.token)
    setNewTokenLabel('')
    load()
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Existing connectors using it will stop working.')) return
    await api.del(`/api/tokens/${id}`)
    load()
  }

  async function runSync(target: 'notion' | 'github') {
    setSyncing(target)
    setSyncResult('')
    try {
      const r = await api.post<{ synced: number; failed: number; attempted: number }>(`/api/sync/${target}`)
      setSyncResult(`✓ ${target}: synced ${r.synced} / failed ${r.failed} / attempted ${r.attempted}`)
    } catch (e) {
      setSyncResult(`✗ ${target} failed: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      {stats && (
        <section>
          <h2>Knowledge base</h2>
          <div className="stats">
            <div><strong>{stats.total_notes}</strong> notes</div>
            <div><strong>{stats.total_tags}</strong> tags</div>
            <div><strong>{stats.recent_activity.this_week}</strong> updated this week</div>
          </div>
        </section>
      )}

      <section>
        <h2>MCP 連線</h2>
        <p className="hint">
          產生一個 token 後拿到「連接器 URL」，直接貼進 Claude.ai 的 Add custom connector。每個裝置一個，可隨時撤銷。
        </p>
        <form onSubmit={generateToken} className="inline-form">
          <input
            placeholder="Label (e.g. iPhone Claude)"
            value={newTokenLabel}
            onChange={(e) => setNewTokenLabel(e.target.value)}
          />
          <button type="submit" className="btn-primary">產生新 token</button>
        </form>
        {justCreated && (
          <ConnectionDetails token={justCreated} apiUrl={api.apiUrl} onDismiss={() => setJustCreated(null)} />
        )}
        <ul className="token-list">
          {tokens.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.label || '(unlabeled)'}</strong>
                <small>created {new Date(t.created_at).toLocaleString()}</small>
                {t.last_used_at && (
                  <small>last used {new Date(t.last_used_at).toLocaleString()}</small>
                )}
              </div>
              <button onClick={() => revoke(t.id)} className="btn-danger">Revoke</button>
            </li>
          ))}
          {tokens.length === 0 && <li className="empty">No tokens yet.</li>}
        </ul>
      </section>

      <section>
        <h2>Sync</h2>
        <p className="hint">把卡片推到 Notion DB（單向唯讀鏡像）或 GitHub repo（markdown 備份）。需要 Worker secrets 已設。</p>
        <div className="actions">
          <button onClick={() => runSync('notion')} disabled={syncing !== null} className="btn">
            {syncing === 'notion' ? 'Syncing…' : '🔄 同步到 Notion'}
          </button>
          <a
            href="https://www.notion.so/355bff7031e3815aad07e5216cbf1907"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-text"
            title="在新視窗打開 Notion DB"
          >
            ↗ 打開 Notion DB
          </a>
          <button onClick={() => runSync('github')} disabled={syncing !== null} className="btn">
            {syncing === 'github' ? 'Syncing…' : '📦 備份到 GitHub'}
          </button>
          <a
            href="https://github.com/AlanChen75/kb-vault-backup-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-text"
            title="在新視窗打開 GitHub backup repo"
          >
            ↗ 打開 backup repo
          </a>
        </div>
        {syncResult && <p className="sync-result">{syncResult}</p>}
      </section>
    </div>
  )
}
