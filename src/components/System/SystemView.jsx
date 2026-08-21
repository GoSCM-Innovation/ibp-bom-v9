import { useState, useEffect, useCallback } from 'react'
import Tasks from '../Tasks/Tasks'
import TaskMonitor from '../Tasks/TaskMonitor'
import Resumen from '../Resumen/Resumen'
import Orchestrations from '../Orchestrations/Orchestrations'
import ConnectionAvatar from '../Connections/ConnectionAvatar'
import SapLoginModal from '../Connections/SapLoginModal'
import { usePromotedTasks, PromotedTasksContext } from '../../hooks/usePromotedTasks'
import { alpha, color } from '../../styles/tokens'

const TABS = [
  { id: 'resumen',        label: 'Resumen'          },
  { id: 'tasks',          label: 'Projects & Tasks'  },
  { id: 'monitor',        label: 'Task Monitor'      },
  { id: 'orchestrations', label: 'Orquestaciones'    },
]

export default function SystemView({ connection, onLoginCancel }) {
  const [activeTab, setActiveTab]           = useState('resumen')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [pendingTaskName, setPendingTaskName] = useState(null)
  const [sessionId, setSessionId]       = useState(() => sessionStorage.getItem(`sap_${connection.id}`))
  const [showLogin, setShowLogin]       = useState(!sessionStorage.getItem(`sap_${connection.id}`))
  const [sessionExpired, setSessionExpired] = useState(false)
  const promotedTasks = usePromotedTasks(connection, sessionId)

  // Resincroniza la sesión cuando cambian los datos de la conexión: editar la
  // URL o la organización con la pestaña abierta debe forzar un login nuevo.
  // TODO(#2): el reemplazo idiomático es remontar con un `key` por identidad de
  // conexión, pero eso también reiniciaría la pestaña activa y el estado del
  // header, que hoy se conservan.
  useEffect(() => {
    const sid = sessionStorage.getItem(`sap_${connection.id}`)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync ante cambio de conexión
    setSessionId(sid)
    setShowLogin(!sid)
    setSessionExpired(false)
  }, [connection.id, connection.hciUrl, connection.orgName, connection.isProduction])

  function handleLoginSuccess(sid) {
    sessionStorage.setItem(`sap_${connection.id}`, sid)
    setSessionId(sid)
    setShowLogin(false)
    setSessionExpired(false)
  }

  // Identidad estable: las vistas hijas la reciben por props y la usan como
  // dependencia de los efectos que consultan a SAP. Sin memoizar, cambiaría en
  // cada render de SystemView y esos efectos se reejecutarían en bucle.
  const handleSessionExpired = useCallback(() => {
    sessionStorage.removeItem(`sap_${connection.id}`)
    setSessionId(null)
    setSessionExpired(true)
  }, [connection.id])

  const handleSearchConsumed = useCallback(() => setPendingTaskName(null), [])

  function handleReconnect() {
    setSessionExpired(false)
    setShowLogin(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* SAP login modal */}
      {showLogin && (
        <SapLoginModal
          connection={connection}
          onSuccess={handleLoginSuccess}
          onCancel={onLoginCancel}
        />
      )}

      {/* System header — colapsable */}
      {!headerCollapsed && (
        <div style={{
          background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <ConnectionAvatar name={connection.name} logoUrl={connection.logoUrl} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: color.white, fontSize: 14 }}>{connection.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', marginTop: 1 }}>
              {connection.hciUrl} · {connection.orgName} · {connection.isProduction ? 'Producción' : 'Sandbox'}
            </div>
          </div>
          <button
            onClick={() => setHeaderCollapsed(true)}
            title="Contraer cabecera"
            style={{
              background: 'none', border: 'none', color: 'var(--text3)',
              cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px',
              borderRadius: 4, flexShrink: 0,
            }}
          >▴</button>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', padding: '0 16px', flexShrink: 0, alignItems: 'center',
        overflowX: 'auto', maxWidth: '100%',
      }}>
        {headerCollapsed && (
          <button
            onClick={() => setHeaderCollapsed(false)}
            title={`${connection.name} — expandir cabecera`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 8px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            <ConnectionAvatar name={connection.name} logoUrl={connection.logoUrl} size={20} />
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>▾</span>
          </button>
        )}

        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 16px', fontSize: 12, background: 'none', border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--text2)',
            fontWeight: activeTab === tab.id ? 600 : 400,
            cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Session expired banner */}
      {sessionExpired && !showLogin && (
        <div style={{
          background: alpha.red(.08), borderBottom: `1px solid ${alpha.red(.25)}`,
          padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>
            Sesión SAP expirada — los datos mostrados pueden estar desactualizados.
          </span>
          <button onClick={handleReconnect} style={{
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: color.onAccent, fontSize: 11, fontWeight: 700, padding: '4px 14px', cursor: 'pointer', flexShrink: 0,
          }}>Reconectar</button>
        </div>
      )}

      {/* Content */}
      <PromotedTasksContext.Provider value={promotedTasks}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'resumen'        && <Resumen       connection={connection} sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'tasks'          && <Tasks          connection={connection} sessionId={sessionId} onSessionExpired={handleSessionExpired} onTaskRun={(name) => { setPendingTaskName(name); setActiveTab('monitor') }} />}
          {activeTab === 'monitor'        && <TaskMonitor    connection={connection} sessionId={sessionId} onSessionExpired={handleSessionExpired} initialSearch={pendingTaskName} onSearchConsumed={handleSearchConsumed} />}
          {activeTab === 'orchestrations' && <Orchestrations connection={connection} sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
        </div>
      </PromotedTasksContext.Provider>
    </div>
  )
}
