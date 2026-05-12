import { useState, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar/Sidebar'
import Connections from './components/Connections/Connections'
import SystemView from './components/System/SystemView'
import GlobalResumen from './components/Resumen/GlobalResumen'
import { useIsMobile } from './hooks/useViewport'
import './App.css'

const LS_KEY = 'ibp_connections'

function loadConnections() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function persistConnections(conns) {
  localStorage.setItem(LS_KEY, JSON.stringify(conns))
}

export default function App() {
  const [connections, setConnections] = useState(() => loadConnections())
  const [activeId, setActiveId] = useState('connections')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile drawer
  const isMobile = useIsMobile()

  // Auto-collapse sidebar when switching to mobile
  useEffect(() => {
    if (isMobile) setSidebarExpanded(false)
  }, [isMobile])

  function addConnection(conn) {
    const newConn = { ...conn, id: crypto.randomUUID() }
    const updated = [...connections, newConn]
    setConnections(updated)
    persistConnections(updated)
  }

  function updateConnection(conn) {
    const existing = connections.find(c => c.id === conn.id)
    if (existing) {
      const sapChanged = existing.hciUrl !== conn.hciUrl
        || existing.orgName !== conn.orgName
        || existing.isProduction !== conn.isProduction
      if (sapChanged) {
        const oldSid = sessionStorage.getItem(`sap_${conn.id}`)
        if (oldSid) {
          // Invalidate the old SAP session server-side so any cached
          // per-session metadata (agents, system configurations) is released
          // before the next login binds a new sessionId to the new env.
          fetch('/api/soap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connection: {
                hciUrl:       existing.hciUrl,
                orgName:      existing.orgName,
                isProduction: existing.isProduction,
              },
              sessionId: oldSid,
              operation: 'logout',
              params: { sessionId: oldSid },
            }),
          }).catch(() => {})
        }
        sessionStorage.removeItem(`sap_${conn.id}`)
      }
    }
    const updated = connections.map(c => c.id === conn.id ? conn : c)
    setConnections(updated)
    persistConnections(updated)
  }

  function deleteConnection(id) {
    if (activeId === id) setActiveId('connections')
    const updated = connections.filter(c => c.id !== id)
    setConnections(updated)
    persistConnections(updated)
  }

  function bulkImportConnections(incoming, { replaceDuplicates }) {
    const sameConn = (a, b) =>
      (a.name    || '').trim().toLowerCase() === (b.name    || '').trim().toLowerCase() &&
      (a.hciUrl  || '').trim().toLowerCase() === (b.hciUrl  || '').trim().toLowerCase() &&
      (a.orgName || '').trim().toLowerCase() === (b.orgName || '').trim().toLowerCase() &&
      (a.isProduction !== false) === (b.isProduction !== false)

    const updated = [...connections]
    let added = 0, replaced = 0, skipped = 0

    for (const c of incoming) {
      const idx = updated.findIndex(e => sameConn(e, c))
      const next = {
        id:           crypto.randomUUID(),
        name:         c.name,
        hciUrl:       c.hciUrl,
        orgName:      c.orgName,
        user:         c.user || '',
        isProduction: c.isProduction !== false,
        logoUrl:      c.logoUrl || '',
      }
      if (idx >= 0) {
        if (replaceDuplicates) {
          // Preserve local ID so existing orchestrations stay linked
          next.id = updated[idx].id
          updated[idx] = next
          replaced++
        } else {
          skipped++
        }
      } else {
        updated.push(next)
        added++
      }
    }

    setConnections(updated)
    persistConnections(updated)
    return { added, replaced, skipped }
  }

  function handleSelect(id) {
    setActiveId(id)
    if (isMobile) setSidebarOpen(false)
  }

  const activeConn = connections.find(c => c.id === activeId)

  function renderMain() {
    if (activeId === 'connections') {
      return (
        <Connections
          connections={connections}
          onAdd={addConnection}
          onUpdate={updateConnection}
          onDelete={deleteConnection}
          onSelect={handleSelect}
          onBulkImport={bulkImportConnections}
        />
      )
    }
    if (activeId === 'resumen-general') {
      return <GlobalResumen connections={connections} />
    }
    if (activeConn) {
      return <SystemView connection={activeConn} onLoginCancel={() => setActiveId('connections')} />
    }
    return null
  }

  return (
    <>
      <Header onMenuToggle={isMobile ? () => setSidebarOpen(p => !p) : null} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Backdrop for mobile drawer */}
        <div
          className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar
          connections={connections}
          activeId={activeId}
          onSelect={handleSelect}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(p => !p)}
          loading={false}
          isMobile={isMobile}
          mobileOpen={sidebarOpen}
        />

        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
          {renderMain()}
        </main>
      </div>

      <div style={{
        position: 'fixed', bottom: 10, right: 14,
        fontSize: 10, color: 'var(--text2)', opacity: 0.45,
        fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none',
        zIndex: 9999,
      }}>
        v{__APP_VERSION__}
      </div>
    </>
  )
}
