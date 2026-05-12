import { useEffect } from 'react'

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: mobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: mobile ? 0 : 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          width: mobile ? '100%' : `min(${maxWidth}px, 92vw)`,
          height: mobile ? '92vh' : 'auto',
          maxHeight: mobile ? '92vh' : '90vh',
          borderRadius: mobile ? '14px 14px 0 0' : 10,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,.5)',
        }}
      >
        {mobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border2)' }} />
          </div>
        )}

        {(title || onClose) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: mobile ? '4px 16px 10px' : '12px 16px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
            gap: 12,
          }}>
            <div style={{
              fontSize: mobile ? 14 : 13, fontWeight: 700,
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
                  width: mobile ? 'var(--tap-min)' : 32,
                  height: mobile ? 'var(--tap-min)' : 32,
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
            padding: mobile ? '10px 16px' : '10px 16px',
            background: 'var(--bg2)',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
