/**
 * Stateless MCP HTTP handler (JSON-RPC 2.0).
 *
 * No Durable Objects, no SSE, no long-lived sessions.
 * Each request: verify Bearer token -> dispatch method -> return JSON.
 *
 * Compatible with Claude.ai custom connectors.
 */

import { Hono } from 'hono'
import type { Env, McpRequest, McpResponse, User } from '../types'
import { verifyMcpToken } from '../auth/session'
import { tools, callTool } from './tools'

const mcp = new Hono<{ Bindings: Env }>()

mcp.post('/', async (c) => {
  // Accept token from EITHER Bearer header OR ?token=... query string.
  // The query-string form lets Claude.ai consume a single connector URL
  // that bakes the token in (matches agent-kb's pattern).
  const headerAuth = c.req.header('authorization') ?? ''
  const headerToken = headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : ''
  const queryToken = c.req.query('token') ?? ''
  const token = headerToken || queryToken

  const user = await verifyMcpToken(c.env, token)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  // 2. Parse JSON-RPC
  let body: McpRequest
  try {
    body = await c.req.json()
  } catch {
    return c.json(jsonRpcError(null, -32700, 'Parse error'))
  }

  // 3. Dispatch
  const res = await dispatch(body, user, c.env)
  return c.json(res)
})

async function dispatch(req: McpRequest, user: User, env: Env): Promise<McpResponse> {
  switch (req.method) {
    case 'initialize':
      return ok(req.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'kb-vault', version: '0.1.0' },
      })

    case 'tools/list':
      return ok(req.id, { tools })

    case 'tools/call': {
      const params = req.params as { name?: string; arguments?: Record<string, unknown> }
      if (!params?.name) return jsonRpcError(req.id, -32602, 'Missing tool name')
      try {
        const result = await callTool(params.name, params.arguments ?? {}, user, env)
        return ok(req.id, result)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return ok(req.id, {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        })
      }
    }

    case 'ping':
      return ok(req.id, {})

    default:
      return jsonRpcError(req.id, -32601, `Method not found: ${req.method}`)
  }
}

function ok(id: McpRequest['id'], result: unknown): McpResponse {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(
  id: McpRequest['id'],
  code: number,
  message: string,
  data?: unknown
): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } }
}

export default mcp
