/**
 * Note path / format utilities.
 *
 * Ported from kb-mcp/src/note-formatter.ts (2026-05-02).
 * Used for optional GitHub backup (file path generation) and
 * for the create_note tool description shown to Claude.
 */

/** Generate file path for a new note based on category and title. */
export function generateNotePath(
  category: string,
  title: string,
  subcategory?: string
): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const sanitized = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .trim()

  const dir = subcategory ? `${category}/${subcategory}` : category
  return `${dir}/${date}-${sanitized}.md`
}

/** Generate raw file path for original input backup. */
export function generateRawPath(): string {
  const now = new Date()
  const month = now.toISOString().slice(0, 7) // YYYY-MM
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14) // YYYYMMDDHHmmss
  return `raw/${month}/${timestamp}-mcp-note.md`
}

/** Parse YAML-like frontmatter from a markdown string. */
export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>
  body: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { metadata: {}, body: content }

  const metadata: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: string | string[] = line.slice(colonIdx + 1).trim()

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    metadata[key] = value
  }
  return { metadata, body: match[2] }
}

/** Build YAML frontmatter from metadata object. */
export function buildFrontmatter(meta: Record<string, unknown>): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((s) => JSON.stringify(s)).join(', ')}]`)
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${JSON.stringify(v)}`)
    } else {
      lines.push(`${k}: ${v}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

/**
 * The note format specification shown in the create_note MCP tool description.
 * Claude reads this and follows the format when authoring notes.
 *
 * Ported verbatim from kb-mcp.
 */
export const NOTE_FORMAT_DESCRIPTION = `建立知識庫筆記。

content 參數必須是完整的 Markdown 筆記，包含 YAML frontmatter。格式如下：

---
title: "標題（30字內）"
date: YYYY-MM-DD
category: 分類路徑（如 tech/ai-ml）
tags: [標籤1, 標籤2, 標籤3]
type: analysis | note | research | comparison | report
source: "來源URL或描述"
---

# 標題

## 📌 摘要
2-3 句話總結核心內容

## 🔑 關鍵要點
1. 要點一
2. 要點二
3. 要點三

## 💬 金句摘錄
> "重要引用"

## 🧠 概念連結
- **相關概念 A**：說明
- **相關概念 B**：說明

## 💡 與我的連結
這個內容與個人/工作的關聯或啟發

## ✅ 行動項目
- [ ] 具體行動 1
- [ ] 具體行動 2

## 📝 我的註解與思考
個人想法、反思或延伸思考

## 🔗 延伸閱讀
- [相關資源](連結)

## ℹ️ 原文資訊
- **來源**：URL 或描述
- **收錄時間**：YYYY-MM-DD HH:mm:ss

分類路徑說明：
- tech/ai-ml: AI、機器學習、LLM
- tech/devops: Docker、CI/CD、部署
- tech/tools: 軟體工具
- tech/programming: 程式開發
- tech/agent: AI Agent
- business/strategy: 商業策略
- business/marketing: 行銷
- research: 論文、學術研究
- news: 新聞時事
- personal: 個人筆記

所有筆記內容必須使用繁體中文。`
