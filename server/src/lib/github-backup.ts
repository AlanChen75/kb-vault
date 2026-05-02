/**
 * GitHub backup adapter — optional sync target for kb-vault notes.
 *
 * Ported from kb-mcp/src/github-api.ts (2026-05-02), repurposed:
 *   kb-mcp: GitHub was the *primary* store, every CRUD hit GitHub
 *   kb-vault: D1 is primary, GitHub is *optional backup* (push-only)
 *
 * Activated when env.GITHUB_TOKEN and env.GITHUB_REPO are set.
 *
 * Usage:
 *   const repo = new GithubBackup(env.GITHUB_TOKEN, env.GITHUB_REPO)
 *   await repo.upsertFile('tech/ai-ml/2026-05-02-rag.md', mdContent, 'Add: rag')
 */

const API_BASE = 'https://api.github.com'

export class GithubBackup {
  constructor(
    private readonly token: string,
    private readonly repo: string
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: 'application/vnd.github.v3+json',
      'user-agent': 'kb-vault/0.1',
      'x-github-api-version': '2022-11-28',
    }
  }

  /** Read a file's metadata + content (for sha lookup before update) */
  async readFile(path: string, ref = 'main'): Promise<{
    content: string
    sha: string
    html_url: string
  } | null> {
    const url = `${API_BASE}/repos/${this.repo}/contents/${encodeURIComponent(path)}?ref=${ref}`
    const r = await fetch(url, { headers: this.headers() })
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`)
    const data = (await r.json()) as { content: string; sha: string; html_url: string }
    return {
      content: data.content
        ? new TextDecoder().decode(
            Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))
          )
        : '',
      sha: data.sha,
      html_url: data.html_url,
    }
  }

  /** List files in a directory (returns names + types) */
  async listFiles(path = '', ref = 'main'): Promise<
    Array<{ name: string; path: string; type: 'file' | 'dir'; size: number }>
  > {
    const url = path
      ? `${API_BASE}/repos/${this.repo}/contents/${encodeURIComponent(path)}?ref=${ref}`
      : `${API_BASE}/repos/${this.repo}/contents?ref=${ref}`
    const r = await fetch(url, { headers: this.headers() })
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`)
    return (await r.json()) as Array<{ name: string; path: string; type: 'file' | 'dir'; size: number }>
  }

  /** Create or update a file (auto-fetches sha if file already exists) */
  async upsertFile(
    path: string,
    content: string,
    message: string
  ): Promise<{ sha: string; html_url: string }> {
    const existing = await this.readFile(path).catch(() => null)
    const url = `${API_BASE}/repos/${this.repo}/contents/${path}`

    const body: Record<string, string> = {
      message,
      content: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
    }
    if (existing) body.sha = existing.sha

    const r = await fetch(url, {
      method: 'PUT',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`)

    const data = (await r.json()) as {
      content: { html_url: string }
      commit: { sha: string }
    }
    return { sha: data.commit.sha, html_url: data.content.html_url }
  }

  /** Delete a file (rare, mostly for cleanup) */
  async deleteFile(path: string, message: string): Promise<void> {
    const existing = await this.readFile(path)
    if (!existing) return
    const url = `${API_BASE}/repos/${this.repo}/contents/${path}`
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ message, sha: existing.sha }),
    })
    if (!r.ok && r.status !== 404) {
      throw new Error(`GitHub ${r.status}: ${await r.text()}`)
    }
  }
}
