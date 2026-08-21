import { useState } from 'react'
import { alpha } from '../../styles/tokens'

const W = 220
const W_MIN = 52

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#06B6D4', '#F97316',
]
function colorFor(name = '') {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function initials(name = '') {
  const base = name.trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
  const words = base.split(/\s+/).filter(Boolean)
  if (words.length === 0) return name.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}
function envDotColor(name = '') {
  const match = name.trim().match(/\(([^)]+)\)\s*$/)
  if (!match) return null
  const env = match[1].trim()
  if (/calidad/i.test(env)) return '#F59E0B'
  if (/producci[oó]n/i.test(env)) return '#3B82F6'
  if (/desarrollo/i.test(env)) return '#8B5CF6'
  return '#6B7280'
}

export default function Sidebar({ connections, activeId, openConnIds = [], onSelect, onReorder, expanded, onToggle, loading, isMobile = false, mobileOpen = false }) {
  const w = expanded ? W : W_MIN
  const openSet = new Set(openConnIds)
  const [dragId, setDragId]       = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  // Drag-drop is desktop-only; on touch/mobile devices native HTML5 DnD is unreliable
  const dndEnabled = !isMobile && typeof onReorder === 'function'

  function handleDragStart(e, id) {
    if (!dndEnabled) return
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* algunos navegadores lo bloquean en dragstart */ }
  }
  function handleDragOver(e, id) {
    if (!dndEnabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverId !== id) setDragOverId(id)
  }
  function handleDrop(e, id) {
    if (!dndEnabled || dragId === null) return
    e.preventDefault()
    if (dragId !== id) onReorder(dragId, id)
    setDragId(null)
    setDragOverId(null)
  }
  function handleDragEnd() {
    setDragId(null)
    setDragOverId(null)
  }

  return (
    <aside
      className={isMobile ? `sidebar-drawer${mobileOpen ? ' open' : ''}` : ''}
      style={{
        width: w, minWidth: w, maxWidth: w,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .2s, min-width .2s, max-width .2s',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        justifyContent: expanded ? 'space-between' : 'center',
        gap: 8, flexShrink: 0,
      }}>
        {expanded && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            Navegación
          </span>
        )}
        <button onClick={onToggle} style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 5,
          color: 'var(--text2)', padding: '3px 6px', fontSize: 11, flexShrink: 0,
        }} title={expanded ? 'Minimizar' : 'Expandir'}>
          {expanded ? '◀' : '▶'}
        </button>
      </div>

      {/* Conexiones link */}
      <SidebarItem
        id="connections"
        label="Conexiones"
        icon="🔗"
        active={activeId === 'connections'}
        expanded={expanded}
        onClick={() => onSelect('connections')}
        accent
      />

      {/* Resumen general link */}
      <SidebarItem
        id="resumen-general"
        label="Resumen"
        icon="📊"
        active={activeId === 'resumen-general'}
        expanded={expanded}
        onClick={() => onSelect('resumen-general')}
        accent
      />

      {/* Mapping Dataflow Generator */}
      <SidebarItem
        id="mapping-dataflow"
        label="Mapping Dataflow Generator"
        icon="📄"
        active={activeId === 'mapping-dataflow'}
        expanded={expanded}
        onClick={() => onSelect('mapping-dataflow')}
        accent
      />

      {/* Integration Explorer */}
      <SidebarItem
        id="integration-explorer"
        label="Integration Explorer"
        icon="🔎"
        active={activeId === 'integration-explorer'}
        expanded={expanded}
        onClick={() => onSelect('integration-explorer')}
        accent
      />

      {/* Divider */}
      {connections.length > 0 && (
        <div style={{ margin: '4px 10px', borderTop: '1px solid var(--border)' }} />
      )}

      {/* Connection list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading
          ? expanded && <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)' }}>Cargando...</div>
          : connections.map((c, idx) => {
            const isOpen = openSet.has(c.id)
            if (isMobile) {
              const hasSession = !!sessionStorage.getItem(`sap_${c.id}`)
              return (
                <SidebarItem
                  key={c.id}
                  id={c.id}
                  label={c.name}
                  icon={initials(c.name)}
                  iconColor={colorFor(c.name)}
                  envColor={envDotColor(c.name)}
                  numberIcon
                  avatarStyle
                  active={activeId === c.id}
                  isOpen={isOpen}
                  expanded={expanded}
                  onClick={() => onSelect(c.id)}
                  sessionStatus={hasSession ? 'online' : 'offline'}
                />
              )
            }
            const dragging = dragId === c.id
            const dropTarget = dndEnabled && dragId && dragOverId === c.id && dragOverId !== dragId
            return (
              <SidebarItem
                key={c.id}
                id={c.id}
                label={`${c.name} (${c.isProduction ? 'Productivo' : 'Sandbox'})`}
                icon={String(idx + 1)}
                numberIcon
                active={activeId === c.id}
                isOpen={isOpen}
                expanded={expanded}
                onClick={() => onSelect(c.id)}
                draggable={dndEnabled}
                dragging={dragging}
                dropTarget={dropTarget}
                onDragStart={e => handleDragStart(e, c.id)}
                onDragOver={e => handleDragOver(e, c.id)}
                onDrop={e => handleDrop(e, c.id)}
                onDragLeave={() => { if (dragOverId === c.id) setDragOverId(null) }}
                onDragEnd={handleDragEnd}
              />
            )
          })
        }
      </div>

      {/* Add new */}
      <div style={{ padding: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => onSelect('connections')} style={{
          width: '100%', padding: '7px 0',
          background: alpha.accent(.08), border: `1px dashed ${alpha.accent(.3)}`,
          borderRadius: 6, color: 'var(--accent)', fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span>+</span>
          {expanded && <span>Nueva conexión</span>}
        </button>
      </div>
    </aside>
  )
}

function SidebarItem({
  label, icon, iconColor, envColor, sessionStatus, numberIcon, avatarStyle,
  active, isOpen, expanded, onClick,
  draggable = false, dragging = false, dropTarget = false,
  onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd,
}) {
  const showOpenIndicator = isOpen && !active
  const leftBorder = dropTarget
    ? '3px solid var(--accent)'
    : active ? '3px solid var(--accent)'
    : showOpenIndicator ? '3px solid #34d399'
    : '3px solid transparent'
  const baseBg = active
    ? alpha.accent(.1)
    : showOpenIndicator ? alpha.green(.05) : 'none'
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        padding: '9px 14px',
        justifyContent: 'flex-start',
        gap: 10,
        background: dropTarget ? alpha.accent(.18) : baseBg,
        border: 'none',
        borderLeft: leftBorder,
        color: active ? 'var(--accent)' : 'var(--text2)',
        fontSize: 12, fontWeight: active || isOpen ? 600 : 400,
        transition: 'background .15s, color .15s, border-color .15s, opacity .15s',
        textAlign: 'left',
        cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'pointer',
        opacity: dragging ? 0.4 : 1,
      }}
      onMouseEnter={e => { if (!active && !dropTarget) e.currentTarget.style.background = alpha.white(.04) }}
      onMouseLeave={e => { if (!active && !dropTarget) e.currentTarget.style.background = 'none' }}
      title={!expanded ? label : (draggable ? `${label} · arrastra para reordenar` : undefined)}
    >
      {/* Icon */}
      {numberIcon && avatarStyle ? (
        <span style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: active ? iconColor : `${iconColor}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
          color: active ? '#fff' : iconColor,
          position: 'relative',
          transition: 'background .15s',
        }}>
          {icon}
          {envColor && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              width: 7, height: 7, borderRadius: '50%',
              background: envColor,
              border: '1.5px solid var(--bg2)',
            }} />
          )}
          {sessionStatus && (
            <span style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 7, height: 7, borderRadius: '50%',
              background: sessionStatus === 'online' ? '#34d399' : 'var(--text3)',
              border: '1.5px solid var(--bg2)',
            }} />
          )}
        </span>
      ) : numberIcon ? (
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: active ? alpha.accent(.2) : alpha.white(.08),
          border: `1px solid ${active ? alpha.accent(.4) : alpha.white(.12)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, flexShrink: 0,
          color: active ? 'var(--accent)' : 'var(--text2)',
        }}>{icon}</span>
      ) : (
        <span style={{ fontSize: 14, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</span>
      )}
      {expanded && (
        <span style={avatarStyle ? {
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          lineHeight: 1.3,
        } : {
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{label}</span>
      )}
      {expanded && sessionStatus === 'offline' && (
        <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>🔒</span>
      )}
    </button>
  )
}
