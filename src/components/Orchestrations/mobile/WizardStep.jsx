import { useState, useRef } from 'react'
import { alpha } from '../../../styles/tokens'

// A single row in the wizard listing. Handles tap (config) and swipe-left (delete).
// Visual variants:
//   variant='task'        → numbered task row
//   variant='group-open'  → "[badge] ⊞ Label {"  + parallel chip
//   variant='group-close' → "} cerrar rama"      (no interactions)
export default function WizardStep({
  variant = 'task',
  label,
  badge,
  isParallel = false,
  depth = 0,
  statusColor = null,
  cursorAfter = false,
  onTap,
  onDelete,
}) {
  const [tx, setTx]   = useState(0)
  const startRef     = useRef(null)
  const swiping      = useRef(false)
  const indent       = 14 + depth * 18

  if (variant === 'group-close') {
    return (
      <div style={{
        padding: `6px 14px 6px ${indent}px`,
        fontSize: 11, color: 'var(--text3)',
        background: 'var(--bg)', fontFamily: 'var(--mono)',
        borderBottom: '1px solid var(--border)',
      }}>
        {'} cerrar rama'}
      </div>
    )
  }

  const isGroupOpen = variant === 'group-open'

  function onPointerDown(e) {
    if (!onDelete) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    swiping.current = false
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* puntero ya liberado: el swipe sigue funcionando */ }
  }
  function onPointerMove(e) {
    if (!startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = Math.abs(e.clientY - startRef.current.y)
    if (dy > 18 && !swiping.current) { startRef.current = null; setTx(0); return }
    if (dx < -6) swiping.current = true
    setTx(Math.min(0, Math.max(-160, dx)))
  }
  function onPointerUp() {
    if (!startRef.current) return
    const wasSwipe = swiping.current
    startRef.current = null
    if (tx < -80 && onDelete) {
      setTx(0)
      const result = onDelete()
      if (result === false) setTx(0)
    } else {
      setTx(0)
    }
    // Suppress click after a swipe to avoid opening config accidentally
    if (wasSwipe) {
      const suppress = (ev) => { ev.preventDefault(); ev.stopPropagation() }
      window.addEventListener('click', suppress, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', suppress, { capture: true }), 0)
    }
  }

  return (
    <div style={{ position: 'relative', background: alpha.red(.12) }}>
      {/* Delete affordance behind the row */}
      {onDelete && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center',
          paddingRight: 18, color: 'var(--red)', fontSize: 12, fontWeight: 700,
          pointerEvents: 'none',
        }}>
          Eliminar
        </div>
      )}

      <div
        onClick={onTap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: `12px 14px 12px ${indent}px`,
          minHeight: 'var(--tap-min)',
          background: isGroupOpen ? alpha.accent(.04) : 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          cursor: onTap ? 'pointer' : 'default',
          transform: `translateX(${tx}px)`,
          transition: tx === 0 ? 'transform .15s' : 'none',
          userSelect: 'none', touchAction: 'pan-y',
        }}
      >
        <span style={{
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)',
          minWidth: 28, textAlign: 'right', flexShrink: 0,
        }}>{badge || ''}</span>

        {isGroupOpen ? (
          <>
            {isParallel && (
              <span style={{
                fontSize: 13, color: 'var(--cyan)', fontWeight: 700,
                fontFamily: 'var(--mono)', flexShrink: 0,
              }} title="Paralelo con el paso anterior">∥</span>
            )}
            <span style={{ fontSize: 16, color: 'var(--purple)' }}>⊞</span>
            <span style={{
              flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {label} <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{'{'}</span>
            </span>
            <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>
          </>
        ) : (
          <>
            {isParallel && (
              <span style={{
                fontSize: 13, color: 'var(--cyan)', fontWeight: 700,
                fontFamily: 'var(--mono)', flexShrink: 0,
              }} title="Paralelo con el paso anterior">∥</span>
            )}
            <span style={{
              flex: 1, fontSize: 14, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{label}</span>
            {statusColor && (
              <span style={{
                width: 9, height: 9, borderRadius: '50%',
                background: statusColor, flexShrink: 0,
                boxShadow: `0 0 0 2px ${statusColor}33`,
              }} />
            )}
            <span style={{ fontSize: 16, color: 'var(--text3)', flexShrink: 0 }}>›</span>
          </>
        )}
      </div>

      {cursorAfter && (
        <div style={{
          height: 3, background: 'var(--accent)',
          marginLeft: indent, marginRight: 14,
          boxShadow: `0 0 8px ${alpha.accent(.55)}`,
        }} />
      )}
    </div>
  )
}
