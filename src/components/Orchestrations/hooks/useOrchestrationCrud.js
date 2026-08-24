import { useState, useEffect, useCallback } from 'react'
import { migrateStepsToGraph } from '../canvasUtils'
import {
  listOrchestrations, createOrchestration, duplicateOrchestration,
  updateOrchestration, deleteOrchestration,
} from '../api'

// Lista de orquestaciones de una conexion, su seleccion, y el alta, baja y
// modificacion. No sabe nada de ejecucion ni de polling.
export function useOrchestrationCrud(connection) {
  const [orchs, setOrchs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const selected = orchs.find(o => o.id === selectedId) || null

  const reload = useCallback(async () => {
    try {
      const data = await listOrchestrations(connection.id)
      setOrchs(data.map(migrateStepsToGraph))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [connection.id])

  useEffect(() => { reload() }, [reload])

  // Alta y duplicado comparten el cierre: migrar lo que devuelve el backend,
  // sumarlo a la lista y dejarlo seleccionado.
  function agregarYSeleccionar(data) {
    const migrated = migrateStepsToGraph(data)
    setOrchs(prev => [...prev, migrated])
    setSelectedId(migrated.id)
  }

  async function createOrch() {
    const name = prompt('Nombre de la nueva orquestación:')?.trim()
    if (!name) return
    try {
      agregarYSeleccionar(await createOrchestration({ connectionId: connection.id, name }))
    } catch (e) { alert(e.message) }
  }

  async function duplicateOrch(id) {
    try {
      agregarYSeleccionar(await duplicateOrchestration(id))
    } catch (e) { alert(e.message) }
  }

  async function deleteOrch(id) {
    if (!confirm('¿Eliminar esta orquestación?')) return
    try {
      await deleteOrchestration(id)
      setOrchs(prev => prev.filter(o => o.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (e) { alert(e.message) }
  }

  async function saveGraph(nodes, edges) {
    if (!selectedId) return
    // Optimista: el estado local cambia ya, para que los inputs controlados no
    // reviertan mientras el PUT esta en vuelo.
    setOrchs(prev => prev.map(o => o.id === selectedId ? { ...o, nodes, edges } : o))
    setSaving(true)
    try {
      await updateOrchestration({ id: selectedId, nodes, edges })
    } catch (e) {
      // Sin alert: el guardado es automatico al mover el grafo, y un dialogo
      // por cada fallo seria insoportable.
      console.error('Save error:', e.message)
    }
    setSaving(false)
  }

  async function commitName(name) {
    if (!name?.trim() || !selectedId) return
    try {
      await updateOrchestration({ id: selectedId, name })
      setOrchs(prev => prev.map(o => o.id === selectedId ? { ...o, name } : o))
    } catch (e) { alert(e.message) }
  }

  return {
    orchs, selected, selectedId, setSelectedId, loading, error, saving,
    createOrch, duplicateOrch, deleteOrch, saveGraph, commitName, reload,
  }
}
