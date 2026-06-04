import { useState, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar/Sidebar'
import Connections from './components/Connections/Connections'
import SystemView from './components/System/SystemView'
import GlobalResumen from './components/Resumen/GlobalResumen'
import LegacyModuleView from './components/Legacy/LegacyModuleView'
import ConnectionTabs from './components/ConnectionTabs'
import { useIsMobile } from './hooks/useViewport'
import './App.css'

const LS_KEY = 'ibp_connections'
const LS_TABS_KEY = 'ibp_open_tabs'

// Legacy vanilla-JS modules embedded via iframe. Kept mounted once visited so
// their in-iframe state survives switching to another view and back.
const LEGACY_MODULES = {
  'mapping-dataflow':     { src: '/legacy/mapping-dataflow.html',     title: 'Mapping Dataflow Generator' },
  'integration-explorer': { src: '/legacy/integration-explorer.html', title: 'Integration Explorer' },
}

function loadConnections() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function persistConnections(conns) {
  localStorage.setItem(LS_KEY, JSON.stringify(conns))
}
function loadOpenTabs() {
  try { return JSON.parse(localStorage.getItem(LS_TABS_KEY) || '[]') } catch { return [] }
}
function persistOpenTabs(ids) {
  localStorage.setItem(LS_TABS_KEY, JSON.stringify(ids))
}

export default function App() {
  const [connections, setConnections] = useState(() => loadConnections())
  const [openConnIds, setOpenConnIds] = useState(() => {
    const ids = loadOpenTabs()
    const valid = new Set(loadConnections().map(c => c.id))
    return ids.filter(id => valid.has(id))
  })
  const [activeId, setActiveId] = useState(() => {
    const tabs = loadOpenTabs()
    const valid = new Set(loadConnections().map(c => c.id))
    const firstOpen = tabs.find(id => valid.has(id))
    return firstOpen || 'connections'
  })
  const [mountedLegacy, setMountedLegacy] = useState(() => [])
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile drawer
  const isMobile = useIsMobile()

  // Auto-collapse sidebar when switching to mobile
  useEffect(() => {
    if (isMobile) setSidebarExpanded(false)
  }, [isMobile])

  function addConnection(conn) {
    // Cada alta crea el par completo: misma URL/org, un repo por entorno
    const prod    = { ...conn, id: crypto.randomUUID(), isProduction: true }
    const sandbox = { ...conn, id: crypto.randomUUID(), isProduction: false }
    const updated = [...connections, prod, sandbox]
    setConnections(updated)
    persistConnections(updated)
  }

  function logoutSession(conn, sid) {
    fetch('/api/soap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: {
          hciUrl:       conn.hciUrl,
          orgName:      conn.orgName,
          isProduction: conn.isProduction,
        },
        sessionId: sid,
        operation: 'logout',
        params: { sessionId: sid },
      }),
    }).catch(() => {})
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
          logoutSession(existing, oldSid)
        }
        sessionStorage.removeItem(`sap_${conn.id}`)
        const oldProdSid = sessionStorage.getItem(`sap_prod_${conn.id}`)
        if (oldProdSid) logoutSession({ ...existing, isProduction: true }, oldProdSid)
        sessionStorage.removeItem(`sap_prod_${conn.id}`)
        // Close the tab so the next open shows a fresh login against the new env
        if (openConnIds.includes(conn.id)) {
          closeTab(conn.id, { skipLogout: true })
        }
      }
    }
    const updated = connections.map(c => c.id === conn.id ? conn : c)
    setConnections(updated)
    persistConnections(updated)
  }

  function reorderConnections(fromId, toId) {
    if (fromId === toId) return
    const from = connections.findIndex(c => c.id === fromId)
    const to   = connections.findIndex(c => c.id === toId)
    if (from < 0 || to < 0) return
    const next = connections.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setConnections(next)
    persistConnections(next)
  }

  function deleteConnection(id) {
    if (openConnIds.includes(id)) {
      const next = openConnIds.filter(x => x !== id)
      setOpenConnIds(next)
      persistOpenTabs(next)
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1] : 'connections')
      }
    } else if (activeId === id) {
      setActiveId('connections')
    }
    sessionStorage.removeItem(`sap_${id}`)
    sessionStorage.removeItem(`sap_prod_${id}`)
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
    const topLevelViews = ['connections', 'resumen-general', ...Object.keys(LEGACY_MODULES)]
    if (!topLevelViews.includes(id)) {
      if (!openConnIds.includes(id)) {
        const next = [...openConnIds, id]
        setOpenConnIds(next)
        persistOpenTabs(next)
      }
    }
    if (LEGACY_MODULES[id] && !mountedLegacy.includes(id)) {
      setMountedLegacy(prev => [...prev, id])
    }
    setActiveId(id)
    if (isMobile) setSidebarOpen(false)
  }

  function closeTab(id, { skipLogout = false } = {}) {
    if (!skipLogout) {
      const sid = sessionStorage.getItem(`sap_${id}`)
      const conn = connections.find(c => c.id === id)
      if (sid && conn) logoutSession(conn, sid)
      sessionStorage.removeItem(`sap_${id}`)
      const prodSid = sessionStorage.getItem(`sap_prod_${id}`)
      if (prodSid && conn) logoutSession({ ...conn, isProduction: true }, prodSid)
      sessionStorage.removeItem(`sap_prod_${id}`)
    }
    const next = openConnIds.filter(x => x !== id)
    setOpenConnIds(next)
    persistOpenTabs(next)
    if (activeId === id) {
      setActiveId(next.length > 0 ? next[next.length - 1] : 'connections')
    }
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
          openConnIds={openConnIds}
          onSelect={handleSelect}
          onReorder={reorderConnections}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(p => !p)}
          loading={false}
          isMobile={isMobile}
          mobileOpen={sidebarOpen}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--bg)' }}>
          <ConnectionTabs
            connections={connections}
            openConnIds={openConnIds}
            activeId={activeId}
            onSelect={handleSelect}
            onClose={closeTab}
          />
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0, minHeight: 0 }}>
            {activeId === 'connections' && (
              <Connections
                connections={connections}
                onAdd={addConnection}
                onUpdate={updateConnection}
                onDelete={deleteConnection}
                onSelect={handleSelect}
                onBulkImport={bulkImportConnections}
              />
            )}
            {activeId === 'resumen-general' && (
              <GlobalResumen connections={connections} onOpenConnection={handleSelect} />
            )}
            {mountedLegacy.map(id => (
              <div
                key={id}
                style={{
                  display: activeId === id ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <LegacyModuleView src={LEGACY_MODULES[id].src} title={LEGACY_MODULES[id].title} />
              </div>
            ))}
            {openConnIds.map(id => {
              const conn = connections.find(c => c.id === id)
              if (!conn) return null
              const hidden = activeId !== id
              return (
                <div
                  key={id}
                  style={{
                    display: hidden ? 'none' : 'flex',
                    flexDirection: 'column',
                    height: '100%',
                  }}
                >
                  <SystemView connection={conn} onLoginCancel={() => closeTab(id)} />
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {!isMobile && (
        <div style={{
          position: 'fixed', bottom: 10, right: 14,
          fontSize: 10, color: 'var(--text2)', opacity: 0.45,
          fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none',
          zIndex: 9999,
        }}>
          v{__APP_VERSION__}
        </div>
      )}
    </>
  )
}
