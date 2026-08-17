import { useState } from 'react'

function groupLogs(logs) {
  const groups = []
  for (const log of logs) {
    const key = `${log.method}|${log.path}|${log.status}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.count++
      last.lastTs = log.ts
    } else {
      groups.push({ key, log, count: 1, lastTs: log.ts })
    }
  }
  return groups
}

export default function TechLogs({ logs }) {
  const [open, setOpen] = useState(false)
  if (!logs || logs.length === 0) return null
  const groups = groupLogs(logs)
  return (
    <div style={{ marginTop: 16, flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text2)', fontSize: 11, fontWeight: 600, padding: '4px 10px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ fontSize: 10, opacity: .7 }}>{open ? '▲' : '▼'}</span>
        Ver logs tecnicos
        <span style={{ background: 'var(--bg3)', borderRadius: 10, padding: '1px 6px', fontSize: 10, color: 'var(--text3)' }}>
          {logs.length}
        </span>
      </button>

      {open && (
        <div style={{
          marginTop: 8, maxHeight: 240, overflowY: 'auto',
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--bg2)', fontSize: 11, color: 'var(--text2)',
        }}>
          {groups.map((g, i) => (
            <div key={i} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
              {g.count > 1 && (
                <span style={{ background: 'var(--bg3)', borderRadius: 10, padding: '1px 6px', fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
                  x{g.count}
                </span>
              )}
              <span style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                [{g.log.method}] {g.log.path} — {g.log.status} ({g.log.duration}ms)
              </span>
              {g.log.detail && (
                <span style={{ color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.log.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
