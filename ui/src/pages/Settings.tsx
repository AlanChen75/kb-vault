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
  const mcpUrl = `${apiUrl}/mcp`
  const auth = `Bearer ${token}`
  const allText = `Name: kb-vault\nURL: ${mcpUrl}\nAuth: ${auth}`

  const [copied, setCopied] = useState<string>('')
  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  return (
    <div className="alert">
      <strong>⚠️ Token 只顯示這一次，先複製完再關掉</strong>
      <p className="hint" style={{ marginTop: 8 }}>
        到 Claude.ai → Settings → Connectors → Add custom connector，貼以下三欄。
      </p>

      <div className="conn-row">
        <span className="conn-label">Name</span>
        <code className="conn-value">kb-vault</code>
        <button onClick={() => copy('kb-vault', 'name')} className="btn-text">
          {copied === 'name' ? '✓' : 'Copy'}
        </button>
      </div>

      <div className="conn-row">
        <span className="conn-label">URL</span>
        <code className="conn-value">{mcpUrl}</code>
        <button onClick={() => copy(mcpUrl, 'url')} className="btn-text">
          {copied === 'url' ? '✓' : 'Copy'}
        </button>
      </div>

      <div className="conn-row">
        <span className="conn-label">Auth</span>
        <code className="conn-value">{auth}</code>
        <button onClick={() => copy(auth, 'auth')} className="btn-text">
          {copied === 'auth' ? '✓' : 'Copy'}
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => copy(allText, 'all')} className="btn-primary">
          {copied === 'all' ? '✓ 已全部複製' : '一鍵複製全部'}
        </button>
        <button onClick={onDismiss} className="btn-text">關閉</button>
      </div>
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
        <h2>MCP Tokens</h2>
        <p className="hint">
          Generate a token to connect from Claude.ai. URL: <code>{api.apiUrl}/mcp</code>
        </p>
        <form onSubmit={generateToken} className="inline-form">
          <input
            placeholder="Label (e.g. Claude Desktop)"
            value={newTokenLabel}
            onChange={(e) => setNewTokenLabel(e.target.value)}
          />
          <button type="submit" className="btn-primary">Generate</button>
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
        <p className="hint">Push notes to external services. Requires server-side secrets configured.</p>
        <div className="actions">
          <button onClick={() => runSync('notion')} disabled={syncing !== null} className="btn">
            {syncing === 'notion' ? 'Syncing…' : 'Sync to Notion'}
          </button>
          <button onClick={() => runSync('github')} disabled={syncing !== null} className="btn">
            {syncing === 'github' ? 'Syncing…' : 'Sync to GitHub'}
          </button>
        </div>
        {syncResult && <p className="sync-result">{syncResult}</p>}
      </section>
    </div>
  )
}
