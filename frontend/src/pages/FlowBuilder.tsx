import { useState, useEffect, useCallback, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  Handle, Position, type Connection, type Edge, type Node, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { flowsApi } from '../services/api'
import toast from 'react-hot-toast'
import {
  Workflow, Plus, Save, Trash2, MessageCircle, HelpCircle, GitBranch,
  UserCheck, Play, X, ArrowLeft, Power
} from 'lucide-react'

// ── Tipos de nó ──
const NODE_TYPES_META: Record<string, { label: string; color: string; icon: any }> = {
  start:     { label: 'Início',       color: '#10b981', icon: Play },
  message:   { label: 'Mensagem',     color: '#6366f1', icon: MessageCircle },
  question:  { label: 'Pergunta',     color: '#f59e0b', icon: HelpCircle },
  condition: { label: 'Condição',     color: '#8b5cf6', icon: GitBranch },
  handoff:   { label: 'Encaminhar',   color: '#ec4899', icon: UserCheck },
}

// ── Nó custom ──
function FlowNodeComp({ data, selected }: NodeProps) {
  const meta = NODE_TYPES_META[data.type] || NODE_TYPES_META.message
  const Icon = meta.icon
  return (
    <div className={`rounded-xl border-2 bg-card px-3 py-2 min-w-[160px] max-w-[220px] shadow-lg transition-all ${selected ? 'ring-2 ring-white/40' : ''}`}
      style={{ borderColor: meta.color }}>
      {data.type !== 'start' && <Handle type="target" position={Position.Top} style={{ background: meta.color }} />}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} style={{ color: meta.color }} />
        <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
      </div>
      {data.text ? (
        <p className="text-[11px] text-text-secondary line-clamp-3 whitespace-pre-wrap">{data.text}</p>
      ) : data.type !== 'start' ? (
        <p className="text-[11px] text-text-muted italic">clique para editar</p>
      ) : (
        <p className="text-[11px] text-text-muted">entrada do fluxo</p>
      )}
      {data.type !== 'handoff' && <Handle type="source" position={Position.Bottom} style={{ background: meta.color }} />}
    </div>
  )
}
const nodeTypes = { flowNode: FlowNodeComp }

interface FlowItem { id: string; name: string; isActive: boolean }

export default function FlowBuilder() {
  const [flows, setFlows] = useState<FlowItem[]>([])
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [flowName, setFlowName] = useState('')
  const [flowActive, setFlowActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const idCounter = useRef(1)

  useEffect(() => { loadFlows() }, [])

  async function loadFlows() {
    setLoading(true)
    try {
      const res = await flowsApi.list()
      setFlows(res.data.data)
    } catch { toast.error('Erro ao carregar fluxos') }
    finally { setLoading(false) }
  }

  async function openFlow(id: string) {
    try {
      const res = await flowsApi.get(id)
      const f = res.data.data
      setActiveFlowId(f.id); setFlowName(f.name); setFlowActive(f.isActive)
      setNodes(f.nodes || []); setEdges(f.edges || [])
      setSelectedNode(null)
      // ajusta contador de ids
      idCounter.current = (f.nodes?.length || 0) + 1
    } catch { toast.error('Erro ao abrir fluxo') }
  }

  async function createFlow() {
    const name = prompt('Nome do fluxo:')
    if (!name?.trim()) return
    try {
      const res = await flowsApi.create(name.trim())
      await loadFlows()
      openFlow(res.data.data.id)
    } catch { toast.error('Erro ao criar fluxo') }
  }

  async function deleteFlow(id: string) {
    if (!confirm('Excluir este fluxo?')) return
    try {
      await flowsApi.remove(id)
      if (activeFlowId === id) setActiveFlowId(null)
      loadFlows()
      toast.success('Fluxo removido')
    } catch { toast.error('Erro ao excluir') }
  }

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, animated: true }, eds))
  }, [setEdges])

  const addNode = (type: string) => {
    const id = `n${Date.now()}_${idCounter.current++}`
    const newNode: Node = {
      id, type: 'flowNode',
      position: { x: 120 + Math.random() * 200, y: 120 + Math.random() * 200 },
      data: { type, text: '' },
    }
    setNodes((nds) => [...nds, newNode])
  }

  const updateNodeText = (text: string) => {
    if (!selectedNode) return
    setNodes((nds) => nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, text } } : n))
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, text } } : null)
  }

  const editEdgeLabel = (edge: Edge) => {
    const label = prompt('Palavra-chave para seguir este caminho (ex: "sim", "1", "orçamento"). Deixe "default" para o caminho padrão:', String(edge.label || ''))
    if (label === null) return
    setEdges((eds) => eds.map((e) => e.id === edge.id ? { ...e, label } : e))
  }

  const deleteSelectedNode = () => {
    if (!selectedNode || selectedNode.data.type === 'start') return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  async function save() {
    if (!activeFlowId) return
    setSaving(true)
    try {
      await flowsApi.update(activeFlowId, { name: flowName, isActive: flowActive, nodes, edges })
      toast.success('Fluxo salvo!')
      loadFlows()
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  async function toggleActive() {
    const next = !flowActive
    setFlowActive(next)
    if (activeFlowId) {
      try {
        await flowsApi.update(activeFlowId, { isActive: next })
        toast.success(next ? '🤖 Fluxo ativado! Responde novos contatos.' : 'Fluxo desativado')
        loadFlows()
      } catch { setFlowActive(!next); toast.error('Erro') }
    }
  }

  // ── Lista de fluxos ──
  if (!activeFlowId) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Workflow size={22} className="text-primary" /> Robô / Fluxos
            </h1>
            <p className="text-sm text-text-muted mt-0.5">Atendimento automático antes de cair na roleta</p>
          </div>
          <button onClick={createFlow} className="btn-primary flex items-center gap-2"><Plus size={16} /> Novo Fluxo</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : flows.length === 0 ? (
          <div className="card p-12 text-center text-text-muted">
            <Workflow size={40} className="mx-auto mb-3 opacity-30" />
            <p className="mb-4">Nenhum fluxo criado ainda</p>
            <button onClick={createFlow} className="btn-primary mx-auto flex items-center gap-2"><Plus size={16} /> Criar primeiro fluxo</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flows.map((f) => (
              <div key={f.id} className="card p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10"><Workflow size={20} className="text-primary" /></div>
                  <div>
                    <p className="font-semibold text-text-primary">{f.name}</p>
                    {f.isActive
                      ? <span className="text-xs text-green-500 flex items-center gap-1"><Power size={11} /> Ativo</span>
                      : <span className="text-xs text-text-muted">Inativo</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openFlow(f.id)} className="btn-ghost border border-border text-sm px-3 py-1.5 rounded-lg">Editar</button>
                  <button onClick={() => deleteFlow(f.id)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Editor (canvas) ──
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-bg-secondary flex-shrink-0 flex-wrap">
        <button onClick={() => setActiveFlowId(null)} className="text-text-muted hover:text-text-primary p-1"><ArrowLeft size={18} /></button>
        <input value={flowName} onChange={(e) => setFlowName(e.target.value)}
          className="input-field py-1.5 text-sm w-48" />
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(NODE_TYPES_META).filter(([t]) => t !== 'start').map(([type, meta]) => {
            const Icon = meta.icon
            return (
              <button key={type} onClick={() => addNode(type)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-bg-hover transition-colors"
                style={{ color: meta.color }}>
                <Icon size={13} /> {meta.label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${flowActive ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-muted border border-border'}`}>
            <Power size={14} /> {flowActive ? 'Ativo' : 'Inativo'}
          </button>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
            <Save size={15} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setSelectedNode(n)}
            onEdgeClick={(_, e) => editEdgeLabel(e)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e2d4a" gap={20} />
            <Controls />
            <MiniMap nodeColor={(n) => NODE_TYPES_META[n.data?.type]?.color || '#6366f1'} maskColor="rgba(8,13,23,0.7)" />
          </ReactFlow>
        </div>

        {/* Painel de edição */}
        {selectedNode && (
          <div className="w-72 border-l border-border bg-bg-secondary p-4 flex-shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary text-sm">
                {NODE_TYPES_META[selectedNode.data.type]?.label || 'Nó'}
              </h3>
              <button onClick={() => setSelectedNode(null)} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
            </div>

            {selectedNode.data.type === 'start' && (
              <p className="text-xs text-text-muted">Ponto de entrada do fluxo. Conecte-o ao primeiro passo.</p>
            )}

            {['message', 'question', 'handoff'].includes(selectedNode.data.type) && (
              <div>
                <label className="text-xs text-text-muted">
                  {selectedNode.data.type === 'question' ? 'Pergunta ao cliente' :
                   selectedNode.data.type === 'handoff' ? 'Mensagem antes de encaminhar (opcional)' : 'Mensagem'}
                </label>
                <textarea
                  value={selectedNode.data.text || ''}
                  onChange={(e) => updateNodeText(e.target.value)}
                  rows={5}
                  className="input-field resize-none mt-1 text-sm"
                  placeholder={selectedNode.data.type === 'question' ? 'Ex: Qual produto você procura?' : 'Digite a mensagem...'}
                />
                {selectedNode.data.type === 'question' && (
                  <p className="text-[11px] text-text-muted mt-1">O fluxo aguarda a resposta do cliente neste ponto.</p>
                )}
                {selectedNode.data.type === 'handoff' && (
                  <p className="text-[11px] text-text-muted mt-1">Encerra o robô e envia o lead para a roleta.</p>
                )}
              </div>
            )}

            {selectedNode.data.type === 'condition' && (
              <p className="text-xs text-text-muted">
                Conecte várias saídas e <b>clique em cada seta</b> para definir a palavra-chave
                (ex: "sim", "1"). Use "default" para o caminho padrão quando nada casar.
              </p>
            )}

            {selectedNode.data.type !== 'start' && (
              <button onClick={deleteSelectedNode}
                className="mt-4 w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-600 text-sm py-2 border border-border rounded-lg hover:bg-danger/10">
                <Trash2 size={14} /> Remover nó
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
