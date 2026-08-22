import { useState, useEffect, useRef, useCallback } from 'react'
import { usePolling } from './usePolling'
import { fetchRun, tickRun, startRun, cancelRun } from '../api'
import { pedirPermisoNotificaciones, notificarFinDeCorrida } from '../runNotifications'

const POLL_MS = 5000
const TERMINAL = new Set(['success', 'error', 'cancelled'])

// Estado de la corrida de la orquestacion seleccionada: carga, polling
// mientras esta en curso, y las tres acciones (start, resume, cancel).
//
// `selectedName` solo se usa para el texto del aviso del navegador; se lee por
// ref para que renombrar la orquestacion no reinicie el polling.
export function useOrchestrationRun(selectedId, connection, sessionId, onSessionExpired, selectedName) {
  const [run, setRun] = useState(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const prevStatusRef = useRef(null)
  const nameRef = useRef(selectedName)
  nameRef.current = selectedName

  const isRunning = run?.status === 'running'

  useEffect(() => {
    if (!selectedId) { setRun(null); return }
    fetchRun(selectedId).then(setRun).catch(() => setRun(null))
  }, [selectedId])

  const doTick = useCallback(async () => {
    if (!selectedId) return
    try {
      const data = await tickRun(selectedId)
      // El aviso solo dispara en la transicion running -> terminal. Sin la
      // guarda de prevStatus, abrir una orquestacion ya terminada avisaria.
      if (data && TERMINAL.has(data.status) && prevStatusRef.current === 'running') {
        notificarFinDeCorrida(nameRef.current, data.status)
      }
      prevStatusRef.current = data?.status || null
      setRun(data)
    } catch { /* un tick perdido se recupera en el siguiente */ }
  }, [selectedId])

  usePolling(isRunning, doTick, POLL_MS)

  // start y resume solo difieren en el cuerpo que mandan y en si piden
  // permiso de notificaciones.
  async function lanzar(body, pedirPermiso) {
    if (!selectedId || isRunning || starting) return
    setStarting(true)
    if (pedirPermiso) pedirPermisoNotificaciones()
    prevStatusRef.current = null
    try {
      const { sessionExpired, run: nuevo } = await startRun(body)
      if (sessionExpired) { onSessionExpired?.(); return }
      setRun(nuevo)
    } catch (e) { alert(e.message) }
    finally { setStarting(false) }
  }

  // La conexion va recortada a proposito: el backend solo necesita a donde
  // llamar, y el resto (id, nombre, logo) no tiene por que viajar.
  function conexionParaSap() {
    return { hciUrl: connection.hciUrl, orgName: connection.orgName, isProduction: connection.isProduction }
  }

  function handleStart({ agentName = null, profileName = null, globalVariables = [] } = {}) {
    return lanzar({
      orchestrationId: selectedId, action: 'start',
      connection: conexionParaSap(),
      sessionId,
      defaultAgent: agentName || null, defaultProfile: profileName || null,
      globalVariables: globalVariables || [],
    }, true)
  }

  function handleResume() {
    return lanzar({
      orchestrationId: selectedId, action: 'resume',
      connection: conexionParaSap(),
      sessionId,
    }, false)
  }

  async function handleCancel() {
    if (!selectedId || !isRunning) return
    setCancelling(true)
    try {
      setRun(await cancelRun(selectedId))
    } catch (e) { alert(e.message) }
    setCancelling(false)
  }

  return { run, isRunning, starting, cancelling, handleStart, handleResume, handleCancel }
}
