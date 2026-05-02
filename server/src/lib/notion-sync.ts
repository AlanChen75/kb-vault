/**
 * Notion sync adapter — push kb-vault notes to a Notion database.
 *
 * The target Notion database must have these properties:
 *   Title       (title)            — note title
 *   Category    (rich_text)        — category path
 *   Tags        (multi_select)     — tags
 *   KbVaultId   (rich_text)        — kb-vault note id (for de-dupe)
 *   UpdatedAt   (date)             — last update
 *
 * Strategy: upsert by KbVaultId. If a Notion page with this id exists, update it.
 * Otherwise, create new. Markdown body is converted to a small set of Notion blocks
 * (heading_1/2/3, bulleted_list, paragraph, code).
 */

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

type RichText = Array<{ type: 'text'; text: { content: string }; annotations?: Record<string, boolean> }>

export class NotionSync {
  constructor(
    private readonly token: string,
    private readonly databaseId: string
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
    }
  }

  /** Upsert a note. Returns the Notion page_id. */
  async upsertNote(
    note: {
      id: string
      title: string
      content: string
      category: string | null
      tags: string[]
      updated_at: number
    },
    appUrl?: string
  ): Promise<string> {
    const existingId = await this.findByKbVaultId(note.id)
    const properties = this.buildProperties(note)
    const callout = mirrorCallout(note.id, appUrl)
    const children = [callout, ...markdownToBlocks(note.content)]

    if (existingId) {
      // Update properties + replace children
      await this.fetch(`${NOTION_API}/pages/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      })
      await this.replaceChildren(existingId, children)
      return existingId
    }

    const r = await this.fetch(`${NOTION_API}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties,
        children: children.slice(0, 100), // Notion limits children per request to 100
      }),
    })
    const data = (await r.json()) as { id: string }

    // If more children, append
    if (children.length > 100) {
      await this.appendChildren(data.id, children.slice(100))
    }
    return data.id
  }

  private async findByKbVaultId(kbId: string): Promise<string | null> {
    const r = await this.fetch(`${NOTION_API}/databases/${this.databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'KbVaultId', rich_text: { equals: kbId } },
        page_size: 1,
      }),
    })
    const data = (await r.json()) as { results: Array<{ id: string }> }
    return data.results[0]?.id ?? null
  }

  private buildProperties(note: {
    id: string
    title: string
    category: string | null
    tags: string[]
    updated_at: number
  }) {
    return {
      Title: { title: [{ type: 'text', text: { content: note.title.slice(0, 200) } }] },
      Category: {
        rich_text: [{ type: 'text', text: { content: note.category ?? '' } }],
      },
      Tags: {
        multi_select: note.tags.slice(0, 100).map((name) => ({ name: name.slice(0, 100) })),
      },
      KbVaultId: { rich_text: [{ type: 'text', text: { content: note.id } }] },
      UpdatedAt: {
        date: { start: new Date(note.updated_at).toISOString() },
      },
    }
  }

  private async replaceChildren(pageId: string, children: unknown[]): Promise<void> {
    // List existing children and delete them
    const r = await this.fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
      method: 'GET',
    })
    const data = (await r.json()) as { results: Array<{ id: string }> }
    for (const block of data.results) {
      await this.fetch(`${NOTION_API}/blocks/${block.id}`, { method: 'DELETE' }).catch(() => null)
    }
    // Append fresh
    await this.appendChildren(pageId, children)
  }

  private async appendChildren(pageId: string, children: unknown[]): Promise<void> {
    for (let i = 0; i < children.length; i += 100) {
      await this.fetch(`${NOTION_API}/blocks/${pageId}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children: children.slice(i, i + 100) }),
      })
    }
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    const r = await fetch(url, { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) } })
    if (!r.ok) {
      const body = await r.text()
      throw new Error(`Notion ${r.status}: ${body.slice(0, 500)}`)
    }
    return r
  }
}

/**
 * Top-of-page warning callout that says "this is a one-way mirror".
 * Notion is treated as a read-only mirror; primary edit happens in kb-vault Web UI.
 */
function mirrorCallout(noteId: string, appUrl?: string): unknown {
  const editUrl = appUrl ? `${appUrl}/note/${noteId}` : `kb-vault Web UI`
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `此頁為 kb-vault 自動同步的鏡像副本。請勿在此編輯（會被下次同步覆蓋）。\n編輯請至：${editUrl}`,
          },
        },
      ],
      icon: { type: 'emoji', emoji: '⚠️' },
      color: 'yellow_background',
    },
  }
}

/** Very small markdown -> Notion blocks converter. */
function markdownToBlocks(md: string): unknown[] {
  // Strip frontmatter
  const stripped = md.replace(/^---\n[\s\S]*?\n---\n/, '')
  const lines = stripped.split('\n')
  const blocks: unknown[] = []
  let inCode = false
  let codeBuf: string[] = []
  let codeLang = 'plain text'

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push(codeBlock(codeBuf.join('\n'), codeLang))
        codeBuf = []
        inCode = false
      } else {
        inCode = true
        codeLang = line.slice(3).trim() || 'plain text'
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    if (line.startsWith('# ')) blocks.push(heading(1, line.slice(2)))
    else if (line.startsWith('## ')) blocks.push(heading(2, line.slice(3)))
    else if (line.startsWith('### ')) blocks.push(heading(3, line.slice(4)))
    else if (line.startsWith('- ') || line.startsWith('* ')) blocks.push(bullet(line.slice(2)))
    else if (line.match(/^\d+\.\s/)) blocks.push(numbered(line.replace(/^\d+\.\s/, '')))
    else if (line.startsWith('> ')) blocks.push(quote(line.slice(2)))
    else if (line.trim()) blocks.push(paragraph(line))
  }

  if (inCode && codeBuf.length) blocks.push(codeBlock(codeBuf.join('\n'), codeLang))
  return blocks
}

function rich(content: string): RichText {
  return [{ type: 'text', text: { content: content.slice(0, 2000) } }]
}
function heading(level: 1 | 2 | 3, text: string) {
  const key = `heading_${level}` as const
  return { object: 'block', type: key, [key]: { rich_text: rich(text) } }
}
function paragraph(text: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rich(text) } }
}
function bullet(text: string) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: rich(text) },
  }
}
function numbered(text: string) {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: { rich_text: rich(text) },
  }
}
function quote(text: string) {
  return { object: 'block', type: 'quote', quote: { rich_text: rich(text) } }
}
function codeBlock(content: string, language: string) {
  return {
    object: 'block',
    type: 'code',
    code: { rich_text: rich(content), language: normalizeLang(language) },
  }
}
function normalizeLang(lang: string): string {
  const known = new Set([
    'plain text', 'typescript', 'javascript', 'python', 'bash', 'shell', 'json', 'yaml',
    'markdown', 'sql', 'go', 'rust', 'java', 'c', 'cpp', 'html', 'css',
  ])
  const l = lang.toLowerCase()
  if (l === 'js') return 'javascript'
  if (l === 'ts') return 'typescript'
  if (l === 'sh') return 'bash'
  if (l === 'yml') return 'yaml'
  if (l === 'md') return 'markdown'
  return known.has(l) ? l : 'plain text'
}
