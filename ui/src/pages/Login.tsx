import { api } from '../api/client'

export default function Login() {
  const apiUrl = api.apiUrl
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>📚 kb-vault</h1>
        <p>Free, open-source personal knowledge base.</p>
        <a href={`${apiUrl}/auth/google`} className="btn-primary">
          Sign in with Google
        </a>
        <p className="hint">
          Your email must be in the server's <code>ALLOWED_EMAILS</code> whitelist.
        </p>
      </div>
    </div>
  )
}
