/**
 * Login is handled by Cloudflare Access at the network edge.
 * If a user lands here, CF Access is misconfigured (or the user logged out).
 * This page just provides a re-entry link.
 */

export default function Login() {
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>📚 kb-vault</h1>
        <p>登入由 Cloudflare Access 處理。</p>
        <a href="/" className="btn-primary">回首頁登入</a>
        <p className="hint">
          如果一直跳回這頁，請確認管理員已在 Cloudflare Zero Trust 開好你的 email 權限。
        </p>
      </div>
    </div>
  )
}
