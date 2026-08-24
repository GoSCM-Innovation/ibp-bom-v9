import { useState } from 'react'
import { useBuildCursor } from './useBuildCursor'
import { STATUS_COLORS } from '../canvasUtils'
import WizardActions from './WizardActions'
import WizardStep from './WizardStep'
import MobileTaskPicker from './MobileTaskPicker'
import NodeConfigPanel from '../canvas/NodeConfigPanel'
import Sheet from '../../ui/Sheet'
import { createPortal } from 'react-dom'
import { alpha, tint } from '../../../styles/tokens'

function buildSteps(nodes, edges) {
  function buildContext(parentId, depth, parentBadge) {
    const contextNodes = nodes.filter(n => (n.parentId ?? null) === parentId)
    if (contextNodes.length === 0) return []
    const ids = new Set(contextNodes.map(n => n.id))

    const inDegree = {}
    const adj      = {}
    for (const n of contextNodes) { inDegree[n.id] = 0; adj[n.id] = [] }
    for (const e of edges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        adj[e.source].push(e.target); inDegree[e.target]++
      }
    }
    const colOf = {}
    let ready = contextNodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
    let col = 0
    while (ready.length > 0) {
      ready.forEach(id => { colOf[id] = col })
      const next = []
      for (const id of ready) for (const d of adj[id]) if (--inDegree[d] === 0) next.push(d)
      ready = next; col++
    }
    const orderMap = new Map(contextNodes.map((n, i) => [n.id, i]))
    const sorted = [...contextNodes].sort((a, b) =>
      ((colOf[a.id] ?? 0) - (colOf[b.id] ?? 0)) || (orderMap.get(a.id) - orderMap.get(b.id))
    )

    const rows = []
    let counter = 0
    for (const n of sorted) {
      counter++
      const badge = parentBadge
        ? `${parentBadge}${String.fromCharCode(96 + counter)}`
        : `${counter}`
      const incomingFromSibling = edges.some(e => ids.has(e.source) && e.target === n.id)
      const isParallel = !incomingFromSibling && counter > 1

      if (n.type === 'group' || n.type === 'orchGroup') {
        rows.push({ variant: 'group-open', node: n, depth, badge, isParallel })
        rows.push(...buildContext(n.id, depth + 1, badge))
        rows.push({ variant: 'group-close', depth: depth + 1, parentId: n.id })
      } else {
        rows.push({ variant: 'task', node: n, depth, badge, isParallel })
      }
    }
    return rows
  }
  return buildContext(null, 0, '')
}

export default function WizardEditor({
  orchestration,
  connection,
  sessionId,
  run,
  isRunning,
  saving,
  starting,
  cancelling,
  onSaveGraph,
  onCancel,
  onEditName,
  onShowLog,
  onShowRunModal,
}) {
  const nodes = orchestration.nodes || []
  const edges = orchestration.edges || []

  const cursor = useBuildCursor({
    nodes, edges,
    onChange: onSaveGraph,
  })

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [picker, setPicker] = useState(null) // 'sequential' | 'parallel' | null
  const [actionsOpen, setActionsOpen] = useState(false)

  const rows = buildSteps(nodes, edges)
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null

  const currentCtx = cursor.currentContext
  const hasHeadInCtx = nodes.some(n => (n.parentId ?? null) === currentCtx)

  let cursorRowIndex = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.variant === 'group-close') continue
    if ((r.node?.parentId ?? null) === currentCtx) cursorRowIndex = i
  }
  if (cursorRowIndex === -1 && currentCtx !== null) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].variant === 'group-open' && rows[i].node?.id === currentCtx) {
        cursorRowIndex = i; break
      }
    }
  }

  function handleNodeUpdate(nodeId, patch) {
    if (patch === null) {
      const newNodes = nodes.filter(n => n.id !== nodeId && n.parentId !== nodeId)
      const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId)
      onSaveGraph(newNodes, newEdges)
      setSelectedNodeId(null)
      return
    }
    const newNodes = nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)
    onSaveGraph(newNodes, edges)
  }

  function deleteNode(nodeId) {
    const hasChildren = nodes.some(n => n.parentId === nodeId)
    if (hasChildren) {
      if (!confirm('Este grupo contiene tasks. ¿Eliminar todo?')) return false
    }
    const newNodes = nodes.filter(n => n.id !== nodeId && n.parentId !== nodeId)
    const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    onSaveGraph(newNodes, newEdges)
    if (cursor.cursorPath.includes(nodeId)) cursor.setCursorToContext(null)
    return true
  }

  const totalSteps = run ? Object.values(run.nodes || {}).length : 0
  const doneSteps  = run ? Object.values(run.nodes || {}).filter(ns => !['pending','running'].includes(ns.status)).length : 0
  const hasNodes   = nodes.filter(n => !n.parentId).length > 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', color: 'var(--text)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button
          onClick={onEditName}
          disabled={isRunning}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left',
            background: 'none', border: 'none', color: 'var(--text)',
            fontSize: 16, fontWeight: 700, padding: 4,
            cursor: isRunning ? 'default' : 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={orchestration.name}
        >{orchestration.name}</button>

        {saving && (
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>Guardando…</span>
        )}

        {run && totalSteps > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            {doneSteps}/{totalSteps}
          </span>
        )}

        {run && (
          <button onClick={onShowLog} style={iconBtn('var(--purple)')} title="Ver log">📋</button>
        )}

        {isRunning ? (
          <button
            onClick={onCancel}
            disabled={cancelling}
            style={iconBtn('var(--red)', cancelling)}
            title="Cancelar"
          >■</button>
        ) : (
          <button
            onClick={onShowRunModal}
            disabled={!hasNodes || starting}
            style={iconBtn('var(--green)', !hasNodes || starting)}
            title="Iniciar"
          >▶</button>
        )}
      </div>

      {/* Breadcrumb (only when inside a group) */}
      {cursor.cursorPath.length > 1 && (
        <div style={{
          padding: '8px 14px', background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text2)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>cursor:</span>
          <button
            onClick={() => cursor.setCursorToContext(null)}
            style={crumbBtn(false)}
          >raíz</button>
          {cursor.cursorPath.slice(1).map((id, i, arr) => {
            const n = nodes.find(nn => nn.id === id)
            const isLast = i === arr.length - 1
            return (
              <span key={id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span style={{ color: 'var(--text3)' }}>›</span>
                <button
                  onClick={() => cursor.setCursorToContext(id)}
                  style={crumbBtn(isLast)}
                >{n?.data?.label || 'Grupo'}</button>
              </span>
            )
          })}
        </div>
      )}

      {/* Steps list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {rows.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--text2)', fontSize: 14,
          }}>
            <div style={{ fontSize: 40, opacity: .35, marginBottom: 10 }}>⚙</div>
            Sin pasos todavía.<br />
            Tocá el botón <b>+</b> para empezar.
          </div>
        ) : (
          <>
            {/* Top cursor if context is root and empty */}
            {cursorRowIndex === -1 && currentCtx === null && !hasHeadInCtx && (
              <div style={{
                height: 3, background: 'var(--accent)', margin: '0 14px',
                boxShadow: `0 0 8px ${alpha.accent(.55)}`,
              }} />
            )}

            {rows.map((r, i) => {
              if (r.variant === 'group-close') {
                return (
                  <WizardStep
                    key={`close_${r.parentId}_${i}`}
                    variant="group-close"
                    depth={r.depth}
                  />
                )
              }
              const node = r.node
              const runStatus = run?.nodes?.[node.id]?.status
              const statusColor = runStatus ? STATUS_COLORS[runStatus] : null
              return (
                <WizardStep
                  key={node.id}
                  variant={r.variant}
                  label={node.data?.label || node.data?.taskName || 'Sin nombre'}
                  badge={r.badge}
                  isParallel={r.isParallel}
                  depth={r.depth}
                  statusColor={statusColor}
                  cursorAfter={i === cursorRowIndex}
                  onTap={isRunning ? undefined : () => {
                    if (r.variant === 'group-open') {
                      cursor.setCursorToContext(node.id)
                    } else {
                      setSelectedNodeId(node.id)
                    }
                  }}
                  onDelete={isRunning ? undefined : () => deleteNode(node.id)}
                />
              )
            })}
          </>
        )}
      </div>

      {/* Floating Action Buttons — undo + main "+" */}
      {!isRunning && createPortal(
        <div style={{
          position: 'fixed', right: 16, bottom: 18, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {cursor.canUndo && (
            <button
              onClick={() => cursor.undo()}
              aria-label="Deshacer"
              title="Deshacer último paso"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--text)',
                fontSize: 20, lineHeight: 1, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${alpha.black(.35)}`,
              }}
            >↺</button>
          )}
          <button
            onClick={() => setActionsOpen(true)}
            aria-label="Añadir paso"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              border: 'none', background: 'var(--accent)', color: 'var(--bg)',
              fontSize: 32, fontWeight: 300, lineHeight: 1, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 24px ${alpha.accent(.45)}, 0 2px 8px ${alpha.black(.35)}`,
              transition: 'transform .12s',
            }}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(.94)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >+</button>
        </div>,
        document.body
      )}

      {/* Actions bottom sheet */}
      <Sheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title="Añadir paso"
        mobile
      >
        <WizardActions
          canUndo={cursor.canUndo}
          canClose={cursor.canClose}
          hasHead={hasHeadInCtx}
          onAddSequential={() => { setActionsOpen(false); setPicker('sequential') }}
          onAddParallel={()  => { setActionsOpen(false); setPicker('parallel') }}
          onAddGroup={()     => { setActionsOpen(false); cursor.openGroup() }}
          onCloseBranch={()  => { setActionsOpen(false); cursor.closeBranch() }}
          onUndo={()         => { setActionsOpen(false); cursor.undo() }}
        />
      </Sheet>

      {/* Montado solo mientras está abierto: al cerrarlo se desmonta y la
          selección se descarta sin necesidad de limpiarla por efecto. */}
      {picker && (
        <MobileTaskPicker
          open
          onClose={() => setPicker(null)}
          connection={connection}
          sessionId={sessionId}
          mode={picker === 'parallel' ? 'parallel' : 'sequential'}
          onConfirm={(tasks) => {
            if (picker === 'parallel') cursor.addTasksParallel(tasks)
            else cursor.addTasksSequential(tasks)
          }}
        />
      )}

      <Sheet
        open={!!selectedNode}
        onClose={() => setSelectedNodeId(null)}
        title={selectedNode?.data?.label || selectedNode?.data?.taskName || 'Configurar paso'}
        mobile
      >
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            connection={connection}
            sessionId={sessionId}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNodeId(null)}
            presentation="sheet"
          />
        )}
      </Sheet>
    </div>
  )
}

function iconBtn(color, disabled = false) {
  return {
    width: 'var(--tap-min)', height: 'var(--tap-min)',
    minWidth: 'var(--tap-min)', flexShrink: 0,
    border: `1px solid ${disabled ? 'var(--border)' : tint(color, .333)}`,
    background: disabled ? 'var(--bg3)' : tint(color, .125),
    color: disabled ? 'var(--text2)' : color,
    fontSize: 16, fontWeight: 700, borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
}

function crumbBtn(active) {
  return {
    background: active ? alpha.accent(.15) : 'var(--bg3)',
    border: `1px solid ${active ? alpha.accent(.4) : 'var(--border)'}`,
    color: active ? 'var(--accent)' : 'var(--text)',
    fontSize: 11, padding: '2px 8px', borderRadius: 6,
    cursor: 'pointer',
  }
}
