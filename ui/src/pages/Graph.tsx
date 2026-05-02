import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network, type Data } from 'vis-network'
import { api, type GraphData } from '../api/client'

const CATEGORY_COLORS: Record<string, string> = {
  tech: '#3b82f6',
  business: '#f59e0b',
  research: '#10b981',
  news: '#ef4444',
  personal: '#8b5cf6',
}

export default function Graph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!containerRef.current) return
    let net: Network | null = null

    api.get<GraphData>('/api/graph').then((g) => {
      const nodes = g.nodes.map((n) => ({
        id: n.id,
        label: n.label.length > 24 ? n.label.slice(0, 24) + '…' : n.label,
        color: CATEGORY_COLORS[(n.category ?? '').split('/')[0]] ?? '#9ca3af',
        font: { color: '#1f2937', size: 14 },
      }))
      const edges = g.edges.map((e) => ({
        from: e.from,
        to: e.to,
        arrows: 'to',
        color: { color: '#cbd5e1' },
      }))

      const data: Data = { nodes, edges }
      net = new Network(containerRef.current!, data, {
        layout: { improvedLayout: true },
        physics: { stabilization: { iterations: 200 } },
        interaction: { hover: true, navigationButtons: true },
        nodes: { shape: 'dot', size: 12 },
      })
      net.on('selectNode', (params: { nodes: string[] }) => {
        if (params.nodes[0]) navigate(`/note/${params.nodes[0]}`)
      })
    })

    return () => { net?.destroy() }
  }, [navigate])

  return (
    <div className="graph-page">
      <h1>Graph</h1>
      <div ref={containerRef} className="graph-canvas" />
    </div>
  )
}
