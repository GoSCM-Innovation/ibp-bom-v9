import { createContext, useContext, useEffect, useState } from 'react'

// Set<string> de taskNames (uppercase) que existen en el repositorio productivo
// del mismo tenant. null = no disponible (conexión productiva, sin sesión PRD
// o carga fallida).
export const PromotedTasksContext = createContext(null)

export function usePromotedTasksContext() {
  return useContext(PromotedTasksContext)
}

export function isTaskPromoted(promotedSet, taskName) {
  return !!promotedSet?.has((taskName || '').trim().toUpperCase())
}

const cache = new Map() // `${connId}:${prodSessionId}` → Promise<Set|null>

async function soapProd(connection, prodSessionId, operation, params = {}) {
  const res = await fetch('/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: { hciUrl: connection.hciUrl, orgName: connection.orgName, isProduction: true },
      sessionId: prodSessionId, operation, params,
    }),
  })
  const data = await res.json().catch(() => null)
  if (res.status === 401) throw Object.assign(new Error('SESSION_EXPIRED'), { isSessionExpired: true })
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

async function fetchPromotedSet(connection, prodSessionId) {
  const projects = await soapProd(connection, prodSessionId, 'getProjects')
  const lists = await Promise.all(
    (Array.isArray(projects) ? projects : [])
      .filter(p => p.guid)
      .map(p => soapProd(connection, prodSessionId, 'getProjectTasks', { projectGuid: p.guid })
        .catch(e => { if (e.isSessionExpired) throw e; return [] }))
  )
  const set = new Set()
  for (const tasks of lists) {
    if (Array.isArray(tasks)) tasks.forEach(t => { if (t.taskName) set.add(t.taskName.trim().toUpperCase()) })
  }
  return set
}

export function usePromotedTasks(connection, sessionId) {
  const [promoted, setPromoted] = useState(null)

  useEffect(() => {
    // null significa "no disponible", y hay que fijarlo antes de decidir si se
    // consulta a SAP: mismo caso que un estado de carga previo al fetch.
    /* eslint-disable react-hooks/set-state-in-effect -- estado previo al fetch */
    if (connection.isProduction) { setPromoted(null); return }
    const prodSessionId = sessionStorage.getItem(`sap_prod_${connection.id}`)
    if (!prodSessionId) { setPromoted(null); return }
    /* eslint-enable react-hooks/set-state-in-effect */
    const key = `${connection.id}:${prodSessionId}`
    if (!cache.has(key)) {
      cache.set(key, fetchPromotedSet(connection, prodSessionId).catch(e => {
        if (e.isSessionExpired) sessionStorage.removeItem(`sap_prod_${connection.id}`)
        cache.delete(key)
        return null
      }))
    }
    let alive = true
    cache.get(key).then(set => { if (alive) setPromoted(set) })
    return () => { alive = false }
    // `connection` entra entero porque fetchPromotedSet lo usa para armar la
    // request: depender solo del id dejaria un closure con la hciUrl vieja si se
    // edita la conexion. El re-run extra es barato, lo corta la cache de arriba.
  }, [connection, sessionId])

  return promoted
}
