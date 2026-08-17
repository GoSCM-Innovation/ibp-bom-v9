import { useState } from 'react'

// Buffer de logs técnicos que alimenta al componente TechLogs. Vive fuera del
// componente para que el archivo de TechLogs.jsx exporte solo componentes y
// Fast Refresh siga funcionando (react-refresh/only-export-components).
const MAX_LOGS = 50

export function useTechLogs() {
  const [logs, setLogs] = useState([])
  function addLog(entry) {
    setLogs(p => [{ ...entry, ts: Date.now() }, ...p].slice(0, MAX_LOGS))
  }
  return [logs, addLog]
}
