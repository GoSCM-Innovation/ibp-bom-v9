import { useState, useEffect, useRef } from 'react'

async function soapCall(connection, sessionId, operation, params = {}) {
  const { hciUrl, orgName, isProduction } = connection
  const res = await fetch('/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection: { hciUrl, orgName, isProduction }, sessionId, operation, params }),
  })
  const raw = await res.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch {}
  if (res.status === 401) throw Object.assign(new Error('Sesión SAP expirada'), { isSessionExpired: true })
  if (!res.ok) throw new Error(data?.error || raw?.slice(0, 240) || `HTTP ${res.status}`)
  if (!data) throw new Error(raw?.slice(0, 240) || 'Respuesta inválida del servidor')
  return data
}

function DragChip({ task, style, fullscreen, onPick, selectable = false, selected = false, onToggleSelect }) {
  const tapMode = typeof onPick === 'function' || selectable

  function onDragStart(e) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/x-orch-task', JSON.stringify({
      taskName: task.taskName,
      taskGuid: task.taskGuid,
      type: task.type,
    }))
  }

  function handleTap() {
    const payload = { taskName: task.taskName, taskGuid: task.taskGuid, type: task.type }
    if (selectable) onToggleSelect?.(payload)
    else onPick?.(payload)
  }

  const desc = task.description?.trim() || ''
  const hoverTitle = desc ? `${task.taskName}\n\n${desc}` : task.taskName
  const showInlineDesc = (fullscreen || tapMode) && desc

  return (
    <div
      draggable={!tapMode}
      onDragStart={tapMode ? undefined : onDragStart}
      onClick={tapMode ? handleTap : undefined}
      title={hoverTitle}
      style={{
        display: 'flex', alignItems: showInlineDesc ? 'flex-start' : 'center', gap: 8,
        padding: tapMode ? '10px 12px 10px 14px' : '5px 8px 5px 14px',
        minHeight: tapMode ? 'var(--tap-min)' : undefined,
        cursor: tapMode ? 'pointer' : 'grab',
        userSelect: 'none', transition: 'background .1s',
        background: selected ? 'rgba(247,168,0,.10)' : 'transparent',
        ...style,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg3)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {selectable && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          marginTop: showInlineDesc ? 2 : 0,
          border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--text3)'}`,
          background: selected ? 'var(--accent)' : 'transparent',
          color: 'var(--bg)', fontSize: 13, fontWeight: 700, lineHeight: '15px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{selected ? '✓' : ''}</span>
      )}
      {!tapMode && (
        <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0, marginTop: showInlineDesc ? 3 : 0 }}>⠿</span>
      )}
      <span style={{
        fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 8, flexShrink: 0,
        marginTop: showInlineDesc ? 2 : 0,
        background: task.type === 'PROCESS' ? 'rgba(139,92,246,.15)' : 'rgba(6,182,212,.15)',
        color: task.type === 'PROCESS' ? 'var(--purple)' : 'var(--cyan)',
        border: `1px solid ${task.type === 'PROCESS' ? 'rgba(139,92,246,.3)' : 'rgba(6,182,212,.3)'}`,
        textTransform: 'uppercase',
      }}>{task.type || 'TASK'}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{
          fontSize: 11, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.taskName}</span>
        {showInlineDesc && (
          <span style={{
            fontSize: 9, color: 'var(--text3)', marginTop: 1, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{desc}</span>
        )}
      </span>
    </div>
  )
}

export default function TaskPalette({
  connection,
  sessionId,
  onAddGroup,
  collapsed = false,
  onToggle,
  fullscreen = false,
  mobile = false,
  onPick = null,
  selectable = false,
  selectedKeys = null,
  onToggleSelect = null,
}) {
  const PINS_KEY = `ibp-palette-pins-${connection.id}`

  const [projects, setProjects]     = useState([])
  const [expanded, setExpanded]     = useState({})
  const [tasks, setTasks]           = useState({})
  const [loadingP, setLoadingP]     = useState(true)
  const [loadingT, setLoadingT]     = useState({})
  const [search, setSearch]         = useState('')
  const [width, setWidth]           = useState(210)
  const [pinnedGuids, setPinnedGuids] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PINS_KEY) || '[]')) }
    catch { return new Set() }
  })
  const [filterPinned, setFilterPinned] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: 0 })

  function onResizeStart(e) {
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startW: width }
    function onMove(e) {
      if (!dragRef.current.active) return
      const next = Math.max(160, Math.min(520, dragRef.current.startW + e.clientX - dragRef.current.startX))
      setWidth(next)
    }
    function onUp() {
      dragRef.current.active = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    soapCall(connection, sessionId, 'getProjects')
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingP(false))
  }, [connection, sessionId])

  async function toggleProject(proj) {
    const guid = proj.guid
    if (expanded[guid]) { setExpanded(p => ({ ...p, [guid]: false })); return }
    setExpanded(p => ({ ...p, [guid]: true }))
    if (tasks[guid]) return
    setLoadingT(p => ({ ...p, [guid]: true }))
    try {
      const data = await soapCall(connection, sessionId, 'getProjectTasks', { projectGuid: guid })
      setTasks(p => ({ ...p, [guid]: Array.isArray(data) ? data : [] }))
    } catch {
      setTasks(p => ({ ...p, [guid]: [] }))
    } finally {
      setLoadingT(p => ({ ...p, [guid]: false }))
    }
  }

  function togglePin(e, guid) {
    e.stopPropagation()
    setPinnedGuids(prev => {
      const next = new Set(prev)
      if (next.has(guid)) next.delete(guid)
      else next.add(guid)
      localStorage.setItem(PINS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function toggleFilterPinned() {
    setFilterPinned(v => !v)
  }

  function clearPins() {
    setPinnedGuids(new Set())
    setFilterPinned(false)
    localStorage.removeItem(PINS_KEY)
  }

  const visibleProjects = (() => {
    let list = projects
    if (filterPinned && pinnedGuids.size > 0) list = list.filter(p => pinnedGuids.has(p.guid))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => {
        const matchProj = p.name?.toLowerCase().includes(q)
        const matchTask = (tasks[p.guid] || []).some(t => t.taskName?.toLowerCase().includes(q))
        return matchProj || matchTask
      })
    }
    return list
  })()

  const hasPins = pinnedGuids.size > 0

  if (mobile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: 'var(--bg2)', color: 'var(--text)',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Buscar proyectos o tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 13,
              padding: '9px 10px', outline: 'none',
              minHeight: 'var(--tap-min)',
            }}
          />
          {hasPins && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={toggleFilterPinned}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  background: filterPinned ? 'rgba(247,168,0,.15)' : 'var(--bg3)',
                  border: filterPinned ? '1px solid rgba(247,168,0,.4)' : '1px solid var(--border)',
                  color: filterPinned ? '#f7a800' : 'var(--text2)',
                  cursor: 'pointer', fontSize: 12, minHeight: 'var(--tap-min)',
                }}
              >📌 {filterPinned ? 'Solo fijados' : `Filtrar (${pinnedGuids.size})`}</button>
            </div>
          )}
        </div>

        {/* Project tree */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingP ? (
            <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--text2)' }}>Cargando proyectos…</div>
          ) : visibleProjects.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--text3)' }}>
              {filterPinned && hasPins ? 'Sin proyectos fijados coincidentes' : 'Sin proyectos'}
            </div>
          ) : visibleProjects.map(proj => {
            const isExp        = !!expanded[proj.guid]
            const isPinned     = pinnedGuids.has(proj.guid)
            const projTasks    = tasks[proj.guid] || []
            const isLoadingT   = !!loadingT[proj.guid]
            const filteredTasks = search.trim()
              ? projTasks.filter(t => t.taskName?.toLowerCase().includes(search.toLowerCase()))
              : projTasks

            return (
              <div key={proj.guid} style={{ borderBottom: '1px solid var(--border)' }}>
                <div
                  onClick={() => toggleProject(proj)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 14px', cursor: 'pointer',
                    minHeight: 'var(--tap-min)',
                    background: isExp ? 'rgba(247,168,0,.05)' : 'transparent',
                  }}
                >
                  <span style={{ color: 'var(--text2)', fontSize: 18, width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {isLoadingT ? '…' : isExp ? '▾' : '▸'}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: isExp ? 'var(--accent)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }} title={proj.name}>{proj.name}</span>
                  <button
                    onClick={e => togglePin(e, proj.guid)}
                    style={{
                      background: 'none', border: 'none',
                      color: isPinned ? '#f7a800' : 'var(--text3)',
                      cursor: 'pointer', fontSize: 16, padding: 8,
                      flexShrink: 0,
                    }}
                  >📌</button>
                </div>

                {isExp && (
                  <div>
                    {filteredTasks.length === 0 && !isLoadingT
                      ? <div style={{ padding: '10px 22px', fontSize: 12, color: 'var(--text3)' }}>Sin tasks</div>
                      : filteredTasks.map(t => {
                        const key = t.taskGuid || t.taskName
                        const isSelected = selectable && selectedKeys ? selectedKeys.has(key) : false
                        return (
                          <DragChip
                            key={key}
                            task={t}
                            style={{}}
                            fullscreen={false}
                            onPick={selectable ? null : onPick}
                            selectable={selectable}
                            selected={isSelected}
                            onToggleSelect={onToggleSelect}
                          />
                        )
                      })
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div
        onClick={onToggle}
        title="Expandir panel de tasks"
        style={{
          width: 28, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'var(--bg2)', cursor: 'pointer', userSelect: 'none',
          paddingTop: 12, gap: 8,
        }}
      >
        <span style={{ fontSize: 24, color: 'var(--text3)', writingMode: 'vertical-rl', letterSpacing: '0.1em', transform: 'rotate(180deg)' }}>
          TASKS
        </span>
        <span style={{ fontSize: 24, color: 'var(--text2)' }}>›</span>
      </div>
    )
  }

  return (
    <div style={{
      width, flexShrink: 0, position: 'relative',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', background: 'var(--bg2)',
      overflow: 'hidden',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute', top: 0, right: 0, width: 4, height: '100%',
          cursor: 'col-resize', zIndex: 10, background: 'transparent',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      />

      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Task Palette
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Filter by pinned toggle */}
            <button
              onClick={toggleFilterPinned}
              title={filterPinned ? 'Mostrando solo proyectos fijados — clic para ver todos' : `Filtrar por proyectos fijados (${pinnedGuids.size})`}
              style={{
                background: filterPinned ? 'rgba(247,168,0,.15)' : 'none',
                border: filterPinned ? '1px solid rgba(247,168,0,.4)' : '1px solid transparent',
                borderRadius: 4, color: filterPinned ? '#f7a800' : hasPins ? 'var(--text2)' : 'var(--text3)',
                cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 5px',
                position: 'relative',
              }}
            >
              📌
              {hasPins && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  fontSize: 8, fontWeight: 700, lineHeight: 1,
                  background: filterPinned ? '#f7a800' : 'var(--text3)',
                  color: 'var(--bg)', borderRadius: 8, padding: '1px 3px',
                  minWidth: 12, textAlign: 'center',
                }}>
                  {pinnedGuids.size}
                </span>
              )}
            </button>
            <button
              onClick={onToggle}
              title="Contraer panel"
              style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
            >‹</button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar proyectos o tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 5, color: 'var(--text)', fontSize: 11,
            padding: '5px 8px', outline: 'none',
          }}
        />

        {/* Active filter indicator */}
        {filterPinned && hasPins && (
          <div style={{
            marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '3px 6px', borderRadius: 4,
            background: 'rgba(247,168,0,.08)', border: '1px solid rgba(247,168,0,.2)',
          }}>
            <span style={{ fontSize: 9, color: '#f7a800' }}>
              {pinnedGuids.size} proyecto{pinnedGuids.size !== 1 ? 's' : ''} fijado{pinnedGuids.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={clearPins}
              title="Quitar todos los fijados"
              style={{ background: 'none', border: 'none', color: '#f7a800', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Project tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingP ? (
          <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--text2)' }}>Cargando proyectos…</div>
        ) : visibleProjects.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--text3)' }}>
            {filterPinned && hasPins ? 'Sin proyectos fijados coincidentes' : 'Sin proyectos'}
          </div>
        ) : visibleProjects.map(proj => {
          const isExp    = !!expanded[proj.guid]
          const isPinned = pinnedGuids.has(proj.guid)
          const projTasks    = tasks[proj.guid] || []
          const isLoadingT   = !!loadingT[proj.guid]
          const filteredTasks = search.trim()
            ? projTasks.filter(t => t.taskName?.toLowerCase().includes(search.toLowerCase()))
            : projTasks

          return (
            <div key={proj.guid} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => toggleProject(proj)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 10px', cursor: 'pointer',
                  background: isExp ? 'rgba(247,168,0,.05)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = isExp ? 'rgba(247,168,0,.05)' : 'transparent' }}
              >
                <span style={{ color: 'var(--text2)', fontSize: 16, width: 16, textAlign: 'center', flexShrink: 0 }}>
                  {isLoadingT ? '…' : isExp ? '▾' : '▸'}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: isExp ? 'var(--accent)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }} title={proj.name}>{proj.name}</span>

                {/* Pin button */}
                <button
                  onClick={e => togglePin(e, proj.guid)}
                  title={isPinned ? 'Quitar de fijados' : 'Fijar proyecto'}
                  style={{
                    background: 'none', border: 'none',
                    color: isPinned ? '#f7a800' : 'var(--text3)',
                    cursor: 'pointer', fontSize: 11, padding: '0 2px',
                    flexShrink: 0, opacity: isPinned ? 1 : 0.4,
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = isPinned ? '1' : '0.4' }}
                >
                  📌
                </button>
              </div>

              {isExp && (
                <div>
                  {filteredTasks.length === 0 && !isLoadingT
                    ? <div style={{ padding: '6px 14px', fontSize: 10, color: 'var(--text3)' }}>Sin tasks</div>
                    : filteredTasks.map(t => (
                      <DragChip key={t.taskGuid || t.taskName} task={t} style={{}} fullscreen={fullscreen} />
                    ))
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add group button */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={onAddGroup}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 6,
            border: '1px dashed rgba(41,171,226,.4)',
            background: 'rgba(41,171,226,.06)', color: 'var(--cyan)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Nuevo grupo
        </button>
      </div>
    </div>
  )
}
