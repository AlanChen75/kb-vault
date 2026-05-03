import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type AuthMethods = { magic_link: boolean; github: boolean }

export default function Login() {
  const [methods, setMethods] = useState<AuthMethods>({ magic_link: false, github: false })
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/auth/methods`)
      .then((r) => r.json())
      .then((m) => setMethods(m))
      .catch(() => null)
  }, [])

  async function requestMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setSending(true)
    setError('')
    try {
      const r = await fetch(`${API_URL}/auth/magic/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await r.json()) as { error?: string; ok?: boolean }
      if (r.ok) {
        setSent(true)
      } else {
        setError(messageForError(data.error))
      }
    } catch {
      setError('連線失敗，請稍後再試')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Free Second Brain</h1>
        <p>Open-source Second Brain for the LLM age.<br/>Bring your own Claude.</p>

        {sent ? (
          <div className="alert">
            <p>
              <strong>✉️ 信已寄出</strong>
            </p>
            <p>
              我們把登入連結寄到 <code>{email}</code>。
              <br />
              點信中的按鈕即可登入。連結 10 分鐘內有效，只能用一次。
            </p>
            <button onClick={() => { setSent(false); setEmail('') }} className="btn-text">
              改用別的 email
            </button>
          </div>
        ) : (
          <>
            {methods.magic_link && (
              <form onSubmit={requestMagicLink} className="login-form">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <button type="submit" className="btn-primary" disabled={sending || !email}>
                  {sending ? '寄送中…' : '寄送登入連結'}
                </button>
              </form>
            )}

            {methods.magic_link && methods.github && <div className="divider">或</div>}

            {methods.github && (
              <a href={`${API_URL}/auth/github`} className="btn">
                Sign in with GitHub
              </a>
            )}

            {!methods.magic_link && !methods.github && (
              <p className="hint">
                ⚠️ 沒有任何認證方式被啟用。管理員需設定 <code>RESEND_API_KEY</code>
                （magic link）或 <code>GITHUB_CLIENT_ID/SECRET</code>（GitHub OAuth）。
              </p>
            )}

            {error && <p className="error">{error}</p>}
          </>
        )}

        <p className="hint">
          只有白名單裡的 email 能登入。登入後 30 天內不必重新驗證。
        </p>
      </div>
    </div>
  )
}

function messageForError(code: string | undefined): string {
  switch (code) {
    case 'email_not_allowed':
      return '這個 email 不在白名單'
    case 'magic_link_not_configured':
      return 'Magic link 未設定，請改用 GitHub'
    case 'invalid_email':
      return 'Email 格式不對'
    case 'email_send_failed':
      return '寄信失敗，請稍後再試或改用 GitHub'
    default:
      return code ?? '未知錯誤'
  }
}
