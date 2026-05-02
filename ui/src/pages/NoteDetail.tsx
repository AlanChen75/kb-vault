import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, type Note } from '../api/client'

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [note, setNote] = useState<Note | null>(null)
  const [editing, setEditing] = useState(id === 'new')
  const [draft, setDraft] = useState({
    title: '',
    content: '',
    category: '',
    tagsStr: '',
  })
  const isNew = id === 'new'

  useEffect(() => {
    if (isNew) return
    api.get<Note>(`/api/notes/${id}`).then((n) => {
      setNote(n)
      setDraft({
        title: n.title,
        content: n.content,
        category: n.category ?? '',
        tagsStr: n.tags.join(', '),
      })
    })
  }, [id, isNew])

  async function save() {
    const payload = {
      title: draft.title,
      content: draft.content,
      category: draft.category || undefined,
      tags: draft.tagsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    if (isNew) {
      const r = await api.post<{ id: string }>('/api/notes', payload)
      navigate(`/note/${r.id}`, { replace: true })
    } else {
      const updated = await api.put<Note>(`/api/notes/${id}`, payload)
      setNote(updated)
      setEditing(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this note?')) return
    await api.del(`/api/notes/${id}`)
    navigate('/')
  }

  const renderedHtml = useMemo(() => {
    if (!note) return ''
    return renderMarkdown(note.content)
  }, [note])

  if (!isNew && !note) return <div className="loading">Loading…</div>

  return (
    <div className="note-detail">
      <div className="page-head">
        <Link to="/" className="btn-text">← Back</Link>
        {!isNew && !editing && (
          <div className="actions">
            <button onClick={() => setEditing(true)}>Edit</button>
            <button onClick={remove} className="btn-danger">Delete</button>
          </div>
        )}
        {editing && (
          <div className="actions">
            <button onClick={save} className="btn-primary">Save</button>
            {!isNew && <button onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        )}
      </div>

      {editing ? (
        <div className="editor">
          <input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="input-title"
          />
          <input
            placeholder="Category (e.g. tech/ai-ml)"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
          <input
            placeholder="Tags (comma separated)"
            value={draft.tagsStr}
            onChange={(e) => setDraft({ ...draft, tagsStr: e.target.value })}
          />
          <textarea
            placeholder="Markdown content…"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={24}
          />
        </div>
      ) : (
        note && (
          <article>
            <h1>{note.title}</h1>
            <div className="meta">
              {note.category && <span className="badge">{note.category}</span>}
              {note.tags.map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
              {note.source_url && (
                <a href={note.source_url} target="_blank" rel="noreferrer" className="src-link">
                  source ↗
                </a>
              )}
            </div>
            <div className="markdown" dangerouslySetInnerHTML={{ __html: renderedHtml }} />

            {note.links_in.length > 0 && (
              <section className="backlinks">
                <h3>Backlinks</h3>
                <ul>
                  {note.links_in.map((linkId) => (
                    <li key={linkId}>
                      <Link to={`/note/${linkId}`}>{linkId}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        )
      )}
    </div>
  )
}

/** Tiny markdown renderer (heading, bold, italic, code, list, link, paragraph). */
function renderMarkdown(md: string): string {
  const stripped = md.replace(/^---\n[\s\S]*?\n---\n/, '')
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

  const lines = stripped.split('\n')
  const out: string[] = []
  let inList = false
  let inCode = false
  let codeBuf: string[] = []

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${escape(codeBuf.join('\n'))}</code></pre>`)
        codeBuf = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }

    if (line.startsWith('### ')) { closeList(); out.push(`<h3>${inline(escape(line.slice(4)))}</h3>`) }
    else if (line.startsWith('## ')) { closeList(); out.push(`<h2>${inline(escape(line.slice(3)))}</h2>`) }
    else if (line.startsWith('# ')) { closeList(); out.push(`<h1>${inline(escape(line.slice(2)))}</h1>`) }
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(escape(line.slice(2)))}</li>`)
    }
    else if (line.startsWith('> ')) { closeList(); out.push(`<blockquote>${inline(escape(line.slice(2)))}</blockquote>`) }
    else if (line.trim()) { closeList(); out.push(`<p>${inline(escape(line))}</p>`) }
  }
  if (inList) out.push('</ul>')
  if (inCode && codeBuf.length) out.push(`<pre><code>${escape(codeBuf.join('\n'))}</code></pre>`)

  return out.join('\n')
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}
