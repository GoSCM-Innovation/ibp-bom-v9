import ConnectionAvatar from './Connections/ConnectionAvatar'

export default function ConnectionTabs({ connections, openConnIds, activeId, onSelect, onClose }) {
  if (!openConnIds || openConnIds.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
      overflowX: 'auto', overflowY: 'hidden',
      flexShrink: 0, minHeight: 38,
    }}>
      {openConnIds.map(id => {
        const conn = connections.find(c => c.id === id)
        if (!conn) return null
        const isActive = activeId === id
        const hasSession = !!sessionStorage.getItem(`sap_${id}`)
        return (
          <div
            key={id}
            onClick={() => onSelect(id)}
            title={`${conn.name} — ${conn.isProduction ? 'Productivo' : 'Sandbox'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 10px 0 12px',
              borderRight: '1px solid var(--border)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              background: isActive ? 'var(--bg)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text2)',
              cursor: 'pointer',
              minWidth: 140, maxWidth: 220,
              flexShrink: 0,
              transition: 'background .15s, color .15s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={20} />
            <span style={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 12, fontWeight: isActive ? 600 : 400,
            }}>{conn.name}</span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: hasSession ? '#34d399' : 'var(--text3)',
              flexShrink: 0,
            }} />
            <button
              onClick={e => { e.stopPropagation(); onClose(id) }}
              title="Cerrar pestaña"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', fontSize: 14, lineHeight: 1,
                padding: '2px 4px', borderRadius: 4, flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text3)' }}
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}
