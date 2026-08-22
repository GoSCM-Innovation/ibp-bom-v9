import { createOrchestration, updateOrchestration } from '../api'

const EXPORT_VERSION = '1.0'

function mismoNombre(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()
}

function descargar(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Exportar e importar orquestaciones como JSON. No tiene estado propio: opera
// sobre la lista que le pasa el hook de CRUD y le pide recargar al terminar.
export function useOrchestrationTransfer(connection, orchs, reload) {
  function exportOrchestrations() {
    if (!orchs.length) return
    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      sourceConnection: {
        name: connection.name,
        orgName: connection.orgName,
        isProduction: !!connection.isProduction,
      },
      orchestrations: orchs.map(o => ({ name: o.name, nodes: o.nodes || [], edges: o.edges || [] })),
    }
    const fecha = new Date().toISOString().slice(0, 10)
    const nombre = (connection.name || 'connection').replace(/[^\w-]+/g, '_').slice(0, 40)
    descargar(`ibp-orquestaciones-${nombre}-${fecha}.json`, JSON.stringify(payload, null, 2))
  }

  // Secuencial a proposito: son escrituras sobre la misma conexion y el
  // resumen tiene que poder atribuir cada fallo a su orquestacion.
  async function bulkImportOrchestrations(parsed, { replaceDuplicates }) {
    const resumen = { added: 0, replaced: 0, skipped: 0, failed: 0, errors: [] }
    for (const incoming of parsed.orchestrations) {
      const nodes = incoming.nodes || []
      const edges = incoming.edges || []
      const existing = orchs.find(o => mismoNombre(o.name, incoming.name))
      try {
        if (existing && !replaceDuplicates) {
          resumen.skipped++
        } else if (existing) {
          await updateOrchestration({ id: existing.id, name: incoming.name, nodes, edges })
          resumen.replaced++
        } else {
          await createOrchestration({ connectionId: connection.id, name: incoming.name, nodes, edges })
          resumen.added++
        }
      } catch (e) {
        resumen.failed++
        resumen.errors.push({ name: incoming.name, message: e.message })
      }
    }
    await reload()
    return resumen
  }

  return { exportOrchestrations, bulkImportOrchestrations }
}
