import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Sheet({
  open,
  onClose,
  title,
  children,
  mobile = false,
  maxWidth = 480,
  footer = null,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const overlay = mobile ? (
    // Full-screen sheet on mobile: no overlay, the sheet IS the screen.
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 1000,
        background: 'var(--bg2)',
        color: 'var(--text)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {(title || onClose) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          gap: 12, background: 'var(--bg2)',
        }}>
          <div style={{
            fontSize: 15, fontWeight: 700,
            color: 'var(--text)', minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: 'none', border: 'none', color: 'var(--text2)',
                fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0,
                width: 'var(--tap-min)', height: 'var(--tap-min)',
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {children}
      </div>

      {footer && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 14px',
          background: 'var(--bg2)',
          flexShrink: 0,
        }}>
          {footer}
        </div>
      )}
    </div>
  ) : (
    // Desktop: centered modal with backdrop.
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          width: `min(${maxWidth}px, 92vw)`,
          maxHeight: '90vh',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,.5)',
        }}
      >
        {(title || onClose) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
            gap: 12,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: 'var(--text)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {title}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                style={{
                  background: 'none', border: 'none', color: 'var(--text2)',
                  fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0,
                  width: 32, height: 32,
                  flexShrink: 0,
                }}
              >×</button>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>

        {footer && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 16px',
            background: 'var(--bg2)',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
