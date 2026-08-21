import { useState, useRef, useEffect } from 'react'
import OrchList                    from './OrchList'
import TaskPalette                 from './panel/TaskPalette'
import OrchestrationsCanvas        from './canvas/OrchestrationsCanvas'
import NodeConfigPanel             from './canvas/NodeConfigPanel'
import RunModal                    from './RunModal'
import RunSingleModal              from './RunSingleModal'
import RunLogModal                 from './RunLogModal'
import ImportOrchestrationsModal   from './ImportOrchestrationsModal'
import WizardEditor                from './mobile/WizardEditor'
import { useOrchestration }        from './useOrchestration'
import { STATUS_COLORS }           from './canvasUtils'
import { useIsMobile }             from '../../hooks/useViewport'
import { alpha, hex, withAlpha } from '../../styles/tokens'

function parseOrchImportText(text) {
  let raw
  try { raw = JSON.parse(text) }
  catch { throw new Error('El archivo no es un JSON válido') }

  const arr = Array.isArray(raw) ? raw : raw?.orchestrations
  if (!Array.isArray(arr)) {
    throw new Error('El archivo no contiene un array de orquestaciones')
  }

  const valid = []
  const invalid = []
  arr.forEach((o, i) => {
    if (!o || typeof o !== 'object') {
      invalid.push({ index: i, reason: 'no es un objeto' }); return
    }
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) {
      invalid.push({ index: i, reason: 'falta el campo name' }); return
    }
    if (!Array.isArray(o.nodes)) {
      invalid.push({ index: i, reason: 'nodes no es un array' }); return
    }
    if (o.edges !== undefined && !Array.isArray(o.edges)) {
      invalid.push({ index: i, reason: 'edges debe ser un array' }); return
    }
    valid.push({
      name,
      nodes: o.nodes,
      edges: Array.isArray(o.edges) ? o.edges : [],
    })
  })

  return {
    orchestrations:   valid,
    invalid,
    version:          raw?.version,
    exportedAt:       raw?.exportedAt,
    sourceConnection: raw?.sourceConnection || null,
  }
}

function RunBadge({ status }) {
  const labels = { running: 'Ejecutando', success: 'Completado', error: 'Error', cancelled: 'Cancelado' }
  if (!status || status === 'idle') return null
  const color = STATUS_COLORS[status] || '#64748b'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: color + '22', color, border: `1px solid ${color}44`,
      fontFamily: 'var(--mono)',
    }}>
      {labels[status] || status}
    </span>
  )
}

export default function Orchestrations({ connection, sessionId, onSessionExpired }) {
  const {
    orchs, loading, error, selected, selectedId, setSelectedId,
    run, isRunning, saving, starting, cancelling,
    createOrch, duplicateOrch, deleteOrch, saveGraph, commitName,
    handleStart, handleResume, handleCancel,
    exportOrchestrations, bulkImportOrchestrations,
  } = useOrchestration(connection, sessionId, onSessionExpired)

  const isMobile = useIsMobile()

  const [selectedNodeId, setSelectedNodeId]   = useState(null)
  const [editingName, setEditingName]         = useState(false)
  const [nameValue, setNameValue]             = useState('')
  const [showRunModal, setShowRunModal]       = useState(false)
  const [showLogModal, setShowLogModal]       = useState(false)
  const [lastRunParams, setLastRunParams]     = useState(null)
  const [runSingleNode, setRunSingleNode]     = useState(null)
  const [paletteCollapsed, setPaletteCollapsed]   = useState(false)
  const [orchListCollapsed, setOrchListCollapsed] = useState(false)
  const [orphanWarning, setOrphanWarning]         = useState(null)
  const [autoConnect, setAutoConnect]             = useState(false)
  const [fullscreen, setFullscreen]               = useState(false)
  const [importParsed, setImportParsed]           = useState(null)
  const [importFileName, setImportFileName]       = useState('')
  const [importFeedback, setImportFeedback]       = useState(null)
  const addGroupRef  = useRef(() => {})
  const canvasRef    = useRef(null)
  const fileInputRef = useRef(null)

  function handleExportClick() {
    if (!orchs.length) return
    try {
      exportOrchestrations()
      setImportFeedback({ kind: 'ok', text: `${orchs.length} orquestacion${orchs.length === 1 ? '' : 'es'} exportada${orchs.length === 1 ? '' : 's'}` })
      setTimeout(() => setImportFeedback(null), 3500)
    } catch (e) {
      setImportFeedback({ kind: 'error', text: `No se pudo exportar: ${e.message}` })
    }
  }

  function handleImportClick() {
    setImportFeedback(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text   = await file.text()
      const parsed = parseOrchImportText(text)
      if (parsed.orchestrations.length === 0 && parsed.invalid.length === 0) {
        setImportFeedback({ kind: 'error', text: 'El archivo no contiene orquestaciones' })
        return
      }
      setImportFileName(file.name)
      setImportParsed(parsed)
    } catch (err) {
      setImportFeedback({ kind: 'error', text: err.message })
    }
  }

  async function handleImportConfirm({ replaceDuplicates }) {
    if (!importParsed) return
    const result = await bulkImportOrchestrations(importParsed, { replaceDuplicates })
    setImportParsed(null)
    setImportFileName('')
    const parts = []
    if (result.added)    parts.push(`${result.added} agregada${result.added === 1 ? '' : 's'}`)
    if (result.replaced) parts.push(`${result.replaced} reemplazada${result.replaced === 1 ? '' : 's'}`)
    if (result.skipped)  parts.push(`${result.skipped} omitida${result.skipped === 1 ? '' : 's'}`)
    if (result.failed)   parts.push(`${result.failed} con error`)
    setImportFeedback({
      kind: result.failed > 0 ? 'error' : 'ok',
      text: parts.length ? parts.join(', ') : 'Sin cambios',
    })
    setTimeout(() => setImportFeedback(null), 5000)
  }

  function handleImportCancel() {
    setImportParsed(null)
    setImportFileName('')
  }

  // Global Escape key to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const handler = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [fullscreen])

  function handleRunSingle(nodeId) {
    const node = selected?.nodes?.find(n => n.id === nodeId)
    if (node) setRunSingleNode(node)
  }

  const selectedNode = selected?.nodes?.find(n => n.id === selectedNodeId) || null

  function checkBeforeRun() {
    const nodes = selected?.nodes || []
    const hasGroups = nodes.some(n => !n.parentId && n.type === 'group')
    if (!hasGroups) return true
    const orphans = nodes.filter(n => !n.parentId && n.type === 'task')
    if (orphans.length > 0) {
      const names = orphans.map(n => n.data?.label || n.data?.taskName || 'Task').join(', ')
      setOrphanWarning(`Tasks fuera de grupo: ${names}`)
      setTimeout(() => setOrphanWarning(null), 6000)
      return false
    }
    return true
  }

  function handleNodeUpdate(nodeId, patch) {
    if (!selected) return
    if (patch === null) {
      canvasRef.current?.deleteNode(nodeId)
      const newNodes = selected.nodes.filter(n => n.id !== nodeId && n.parentId !== nodeId)
      const newEdges = selected.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
      saveGraph(newNodes, newEdges)
      setSelectedNodeId(null)
      return
    }
    canvasRef.current?.patchNodeData(nodeId, patch)
    const newNodes = selected.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)
    saveGraph(newNodes, selected.edges)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text2)', fontSize: 12 }}>Cargando orquestaciones…</div>
  if (error)   return <div style={{ padding: 40, color: 'var(--red)', fontSize: 12 }}>{error}</div>

  // ─── Mobile rendering ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Feedback toast for export/import */}
        {importFeedback && (
          <div style={{
            position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 1100,
            padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: importFeedback.kind === 'ok' ? alpha.green(.15) : alpha.red(.15),
            border:     `1px solid ${importFeedback.kind === 'ok' ? alpha.green(.40) : alpha.red(.40)}`,
            color:      importFeedback.kind === 'ok' ? 'var(--green)' : 'var(--red)',
            display: 'flex', gap: 12, alignItems: 'center',
            boxShadow: `0 6px 20px ${alpha.black(.35)}`,
          }}>
            <span style={{ flex: 1 }}>{importFeedback.kind === 'ok' ? '✓' : '✕'} {importFeedback.text}</span>
            <button onClick={() => setImportFeedback(null)} style={{
              background: 'none', border: 'none', color: 'inherit',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, opacity: .7,
            }}>×</button>
          </div>
        )}

        {orphanWarning && (
          <div style={{
            position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 1100,
            padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: 'rgba(251,191,36,.15)',
            border: '1px solid rgba(251,191,36,.4)', color: '#fbbf24',
            boxShadow: `0 6px 20px ${alpha.black(.35)}`,
          }}>
            ⚠ Tasks fuera de grupo: <strong>{orphanWarning}</strong>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {importParsed && (
          <ImportOrchestrationsModal
            parsed={importParsed}
            existing={orchs}
            fileName={importFileName}
            currentConnection={connection}
            onConfirm={handleImportConfirm}
            onCancel={handleImportCancel}
          />
        )}

        {!selected ? (
          <OrchList
            orchs={orchs}
            selectedId={selectedId}
            onSelect={id => { setSelectedId(id); setSelectedNodeId(null) }}
            onCreate={createOrch}
            onDuplicate={duplicateOrch}
            onDelete={deleteOrch}
            onExport={handleExportClick}
            onImportClick={handleImportClick}
            connectionId={connection.id}
            mobile
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
              padding: '6px 10px', background: 'var(--bg3)',
              borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <button
                onClick={() => { setSelectedId(null); setSelectedNodeId(null) }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text2)',
                  fontSize: 12, cursor: 'pointer', padding: '6px 4px',
                  minHeight: 'var(--tap-min)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >← Orquestaciones</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <WizardEditor
                orchestration={selected}
                connection={connection}
                sessionId={sessionId}
                run={run}
                isRunning={isRunning}
                saving={saving}
                starting={starting}
                cancelling={cancelling}
                onSaveGraph={saveGraph}
                onCancel={handleCancel}
                onEditName={() => {
                  const next = window.prompt('Nuevo nombre de la orquestación:', selected.name)
                  if (next?.trim()) commitName(next.trim())
                }}
                onShowLog={() => setShowLogModal(true)}
                onShowRunModal={() => { if (checkBeforeRun()) setShowRunModal(true) }}
              />
            </div>
          </div>
        )}

        {showRunModal && (
          <RunModal
            key={`run-${connection.id}-${sessionId || 'nosess'}`}
            connection={connection}
            sessionId={sessionId}
            orchNodes={selected?.nodes || []}
            onConfirm={(agentName, profileName, globalVariables) => {
              setShowRunModal(false)
              setLastRunParams({ agentName, profileName, globalVariables })
              handleStart({ agentName, profileName, globalVariables })
            }}
            onClose={() => setShowRunModal(false)}
          />
        )}

        {runSingleNode && (
          <RunSingleModal
            key={`single-${connection.id}-${sessionId || 'nosess'}-${runSingleNode.id}`}
            connection={connection}
            sessionId={sessionId}
            node={runSingleNode}
            onClose={() => setRunSingleNode(null)}
          />
        )}

        {showLogModal && run && (
          <RunLogModal
            run={run}
            connection={connection}
            sessionId={sessionId}
            nodes={selected?.nodes || []}
            onClose={() => setShowLogModal(false)}
          />
        )}
      </div>
    )
  }
  // ──────────────────────────────────────────────────────────────────────────────

  const hasNodes = (selected?.nodes?.filter(n => !n.parentId).length || 0) > 0
  const doneSteps = run ? Object.values(run.nodes || {}).filter(ns => !['pending','running'].includes(ns.status)).length : 0
  const totalSteps = run ? Object.values(run.nodes || {}).length : 0

  // ── Canvas + toolbar section (shared between normal and fullscreen) ──────────
  const canvasSection = selected && (
    <>
      {/* Task palette */}
      <TaskPalette
        connection={connection}
        sessionId={sessionId}
        onAddGroup={() => addGroupRef.current?.()}
        collapsed={paletteCollapsed}
        onToggle={() => setPaletteCollapsed(v => !v)}
        fullscreen={fullscreen}
      />

      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          background: 'var(--bg2)', flexWrap: 'wrap',
        }}>
          {/* Fullscreen exit button (prominent, leftmost when in fullscreen) */}
          {fullscreen && (
            <button
              onClick={() => setFullscreen(false)}
              style={{
                ...actionBtn(hex.purple, false),
                fontWeight: 700, fontSize: 13, padding: '5px 12px',
              }}
              title="Salir de pantalla completa (Esc)"
            >
              ✕ Salir
            </button>
          )}

          {/* Editable name */}
          {editingName ? (
            <input
              value={nameValue}
              autoFocus
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => { commitName(nameValue); setEditingName(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter')  { commitName(nameValue); setEditingName(false) }
                if (e.key === 'Escape') setEditingName(false)
              }}
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 5, color: 'var(--text)', fontSize: 14, fontWeight: 700,
                padding: '3px 8px', outline: 'none', minWidth: 160,
              }}
            />
          ) : (
            <span
              onClick={() => { if (!isRunning) { setEditingName(true); setNameValue(selected.name) } }}
              style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', cursor: isRunning ? 'default' : 'text' }}
              title={isRunning ? undefined : 'Click para editar'}
            >
              {selected.name}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Run state */}
          {run && <RunBadge status={run.status} />}
          {isRunning && totalSteps > 0 && (
            <span style={{ fontSize: 10, color: '#3b82f6', fontFamily: 'var(--mono)' }}>
              {doneSteps}/{totalSteps}
            </span>
          )}
          {saving && <span style={{ fontSize: 10, color: 'var(--text2)' }}>Guardando…</span>}

          {/* Auto-connect toggle */}
          <button
            onClick={() => setAutoConnect(v => !v)}
            style={actionBtn(autoConnect ? '#34d399' : null, false, autoConnect)}
            title="Conectar automáticamente cada task al anterior al soltarlo en el canvas"
          >
            ⚡{autoConnect ? ' Auto ON' : ' Auto'}
          </button>

          {/* Fullscreen enter button */}
          {!fullscreen && (
            <button
              onClick={() => setFullscreen(true)}
              style={actionBtn('#64748b', false)}
              title="Pantalla completa"
            >
              ⛶
            </button>
          )}

          {/* Run controls */}
          {run && (
            <button
              onClick={() => setShowLogModal(true)}
              style={actionBtn(hex.purple, false)}
              title="Ver log de la última ejecución"
            >
              📋 Log
            </button>
          )}

          {lastRunParams && !isRunning && run && (
            <button
              onClick={() => handleStart(lastRunParams)}
              disabled={starting}
              style={actionBtn('#3b82f6', starting)}
              title={`Repetir con ${lastRunParams.agentName || 'default'} / ${lastRunParams.profileName || 'default'}`}
            >
              {starting ? 'Iniciando…' : '↺ Repetir'}
            </button>
          )}

          {run?.status === 'error' && !isRunning && (
            <button
              onClick={handleResume}
              disabled={starting}
              style={actionBtn('#f59e0b', starting)}
              title="Reanudar desde el primer nodo fallido, conservando los resultados ya completados"
            >
              {starting ? 'Iniciando…' : '⏭ Reanudar'}
            </button>
          )}

          <button
            onClick={() => { if (checkBeforeRun()) setShowRunModal(true) }}
            disabled={isRunning || !hasNodes || starting}
            style={actionBtn('#34d399', isRunning || !hasNodes || starting)}
          >
            {starting ? 'Iniciando…' : '▶ Iniciar'}
          </button>

          {isRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={actionBtn('#ff6b6b', cancelling)}
            >
              {cancelling ? 'Cancelando…' : '■ Cancelar'}
            </button>
          )}
        </div>

        {/* Orphan tasks warning */}
        {orphanWarning && (
          <div style={{
            padding: '7px 14px', background: 'rgba(251,191,36,.1)',
            borderBottom: '1px solid rgba(251,191,36,.3)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#fbbf24' }}>
              ⚠ Los siguientes tasks deben estar dentro de un grupo para poder iniciar: <strong>{orphanWarning}</strong>
            </span>
            <button onClick={() => setOrphanWarning(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Canvas + node config panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <OrchestrationsCanvas
            ref={canvasRef}
            key={selected.id}
            orchId={selected.id}
            initialNodes={selected.nodes || []}
            initialEdges={selected.edges || []}
            run={run}
            isRunning={isRunning}
            onSave={saveGraph}
            onNodeSelect={setSelectedNodeId}
            onAddGroup={addGroupRef}
            onRunSingle={handleRunSingle}
            autoConnect={autoConnect}
          />

          {selectedNode && !isRunning && (
            <NodeConfigPanel
              node={selectedNode}
              connection={connection}
              sessionId={sessionId}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Orchestration list — hidden in fullscreen */}
      {!fullscreen && (
        <OrchList
          orchs={orchs}
          selectedId={selectedId}
          onSelect={id => { setSelectedId(id); setSelectedNodeId(null) }}
          onCreate={createOrch}
          onDuplicate={duplicateOrch}
          onDelete={deleteOrch}
          onExport={handleExportClick}
          onImportClick={handleImportClick}
          connectionId={connection.id}
          collapsed={orchListCollapsed}
          onToggle={() => setOrchListCollapsed(v => !v)}
        />
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Feedback toast for export/import */}
      {importFeedback && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1100,
          padding: '10px 16px', borderRadius: 8, fontSize: 12,
          background: importFeedback.kind === 'ok' ? alpha.green(.15) : alpha.red(.15),
          border:     `1px solid ${importFeedback.kind === 'ok' ? alpha.green(.40) : alpha.red(.40)}`,
          color:      importFeedback.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          display: 'flex', gap: 12, alignItems: 'center',
          boxShadow: `0 6px 20px ${alpha.black(.35)}`,
        }}>
          <span>{importFeedback.kind === 'ok' ? '✓' : '✕'} {importFeedback.text}</span>
          <button
            onClick={() => setImportFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: .7 }}
          >×</button>
        </div>
      )}

      {/* Import preview modal */}
      {importParsed && (
        <ImportOrchestrationsModal
          parsed={importParsed}
          existing={orchs}
          fileName={importFileName}
          currentConnection={connection}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
        />
      )}

      {!selected ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>⚙</div>
            Selecciona una orquestación o crea una nueva
          </div>
        </div>
      ) : fullscreen ? (
        /* ── Fullscreen overlay ─────────────────────────────────────────────── */
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          display: 'flex', background: 'var(--bg)', overflow: 'hidden',
        }}>
          {canvasSection}
        </div>
      ) : (
        /* ── Normal layout ──────────────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {canvasSection}
        </div>
      )}

      {showRunModal && (
        <RunModal
          key={`run-${connection.id}-${sessionId || 'nosess'}`}
          connection={connection}
          sessionId={sessionId}
          orchNodes={selected?.nodes || []}
          onConfirm={(agentName, profileName, globalVariables) => {
            setShowRunModal(false)
            setLastRunParams({ agentName, profileName, globalVariables })
            handleStart({ agentName, profileName, globalVariables })
          }}
          onClose={() => setShowRunModal(false)}
        />
      )}

      {runSingleNode && (
        <RunSingleModal
          key={`single-${connection.id}-${sessionId || 'nosess'}-${runSingleNode.id}`}
          connection={connection}
          sessionId={sessionId}
          node={runSingleNode}
          onClose={() => setRunSingleNode(null)}
        />
      )}

      {showLogModal && run && (
        <RunLogModal
          run={run}
          connection={connection}
          sessionId={sessionId}
          nodes={selected?.nodes || []}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  )
}

function actionBtn(color, disabled, active = false) {
  if (!color) color = '#64748b'
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: disabled ? 'var(--bg3)' : withAlpha(color, active ? .133 : .082),
    color:      disabled ? 'var(--text2)' : color,
    border:     `1px solid ${disabled ? 'var(--border)' : withAlpha(color, active ? .333 : .188)}`,
    cursor:     disabled ? 'default' : 'pointer', transition: 'all .15s',
    flexShrink: 0,
  }
}
