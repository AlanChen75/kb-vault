const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function Login() {
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>📚 kb-vault</h1>
        <p>Free, open-source personal knowledge base.</p>
        <a href={`${API_URL}/auth/github`} className="btn-primary">
          Sign in with GitHub
        </a>
        <p className="hint">
          只有 <code>ALLOWED_EMAILS</code> 白名單裡的 email 能登入。
        </p>
      </div>
    </div>
  )
}
