import { useState, useRef } from 'react'
import ConnectionForm from './ConnectionForm'
import ConnectionAvatar from './ConnectionAvatar'
import SapLoginModal from './SapLoginModal'
import ImportConnectionsModal from './ImportConnectionsModal'
import TechLogs, { useTechLogs } from '../TechLogs'

const EXPORT_VERSION = '1.0'

function parseImportText(text) {
  let raw
  try { raw = JSON.parse(text) }
  catch { throw new Error('El archivo no es un JSON válido') }

  const arr = Array.isArray(raw) ? raw : raw?.connections
  if (!Array.isArray(arr)) {
    throw new Error('El archivo no contiene un array de conexiones')
  }

  const valid = []
  const invalid = []
  arr.forEach((c, i) => {
    if (!c || typeof c !== 'object') {
      invalid.push({ index: i, reason: 'no es un objeto' }); return
    }
    const name    = typeof c.name    === 'string' ? c.name.trim()    : ''
    const hciUrl  = typeof c.hciUrl  === 'string' ? c.hciUrl.trim()  : ''
    const orgName = typeof c.orgName === 'string' ? c.orgName.trim() : ''
    if (!name || !hciUrl || !orgName) {
      invalid.push({ index: i, reason: 'faltan name, hciUrl u orgName' }); return
    }
    valid.push({
      name,
      hciUrl:       hciUrl.replace(/\/$/, ''),
      orgName,
      user:         typeof c.user    === 'string' ? c.user    : '',
      isProduction: c.isProduction !== false,
      logoUrl:      typeof c.logoUrl === 'string' ? c.logoUrl : '',
    })
  })

  return { connections: valid, invalid, version: raw?.version, exportedAt: raw?.exportedAt }
}

function downloadConnectionsFile(connections) {
  const payload = {
    version:    EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
    connections: connections.map(c => ({
      name:         c.name,
      hciUrl:       c.hciUrl,
      orgName:      c.orgName,
      user:         c.user || '',
      isProduction: c.isProduction !== false,
      logoUrl:      c.logoUrl || '',
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `ibp-conexiones-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Connections({ connections, onAdd, onUpdate, onDelete, onSelect, onBulkImport }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [testTarget, setTestTarget] = useState(null) // conn being tested via login modal
  const [testResult, setTestResult] = useState({})
  const [logs, addLog] = useTechLogs()
  const [importParsed, setImportParsed]   = useState(null)
  const [importFileName, setImportFileName] = useState('')
  const [feedback, setFeedback] = useState(null) // { kind: 'ok'|'error', text }
  const fileInputRef = useRef(null)

  function handleEdit(conn) {
    setEditing(conn)
    setShowForm(true)
  }

  function handleNew() {
    setEditing(null)
    setShowForm(true)
  }

  function handleSave(conn) {
    if (editing) {
      onUpdate(conn)
    } else {
      onAdd(conn)
    }
    setShowForm(false)
    setEditing(null)
  }

  function handleDelete(id, name) {
    if (!confirm(`¿Eliminar la conexión "${name}"?`)) return
    onDelete(id)
  }

  function handleTest(conn) {
    setTestTarget(conn)
  }

  function handleTestSuccess(conn, sessionId) {
    const start = performance.now()
    const duration = Math.round(performance.now() - start)
    addLog({ method: 'POST', path: `sap-login (${conn.name})`, status: 200, duration, detail: 'Conexión exitosa' })
    setTestResult(p => ({ ...p, [conn.id]: 'ok' }))
    setTestTarget(null)
    // store sessionId for when user opens this connection
    sessionStorage.setItem(`sap_${conn.id}`, sessionId)
  }

  function handleTestCancel() {
    setTestTarget(null)
  }

  function handleExport() {
    if (connections.length === 0) return
    try {
      downloadConnectionsFile(connections)
      setFeedback({ kind: 'ok', text: `${connections.length} conexion${connections.length === 1 ? '' : 'es'} exportada${connections.length === 1 ? '' : 's'}` })
      setTimeout(() => setFeedback(null), 3500)
    } catch (e) {
      setFeedback({ kind: 'error', text: `No se pudo exportar: ${e.message}` })
    }
  }

  function handleImportClick() {
    setFeedback(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseImportText(text)
      if (parsed.connections.length === 0 && parsed.invalid.length === 0) {
        setFeedback({ kind: 'error', text: 'El archivo no contiene conexiones' })
        return
      }
      setImportFileName(file.name)
      setImportParsed(parsed)
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message })
    }
  }

  function handleImportConfirm({ replaceDuplicates }) {
    const { added, replaced, skipped } = onBulkImport(importParsed.connections, { replaceDuplicates })
    setImportParsed(null)
    setImportFileName('')
    const parts = []
    if (added)    parts.push(`${added} agregada${added === 1 ? '' : 's'}`)
    if (replaced) parts.push(`${replaced} reemplazada${replaced === 1 ? '' : 's'}`)
    if (skipped)  parts.push(`${skipped} omitida${skipped === 1 ? '' : 's'}`)
    setFeedback({ kind: 'ok', text: parts.length ? parts.join(', ') : 'Sin cambios' })
    setTimeout(() => setFeedback(null), 4000)
  }

  function handleImportCancel() {
    setImportParsed(null)
    setImportFileName('')
  }

  return (
    <div style={{ padding: 'clamp(14px, 4vw, 28px)', maxWidth: 900 }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Conexiones</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
            Gestiona los sistemas SAP CI-DS — las conexiones se guardan en este navegador
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleImportClick}
            title="Importar conexiones desde un archivo JSON"
            style={secondaryBtnStyle}
          >
            Importar
          </button>
          <button
            onClick={handleExport}
            disabled={connections.length === 0}
            title={connections.length === 0 ? 'No hay conexiones para exportar' : 'Descargar todas las conexiones como JSON'}
            style={{
              ...secondaryBtnStyle,
              opacity: connections.length === 0 ? 0.5 : 1,
              cursor: connections.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Exportar
          </button>
          <button onClick={handleNew} style={{
            background: 'var(--accent)', border: 'none', borderRadius: 7,
            color: '#000', fontWeight: 700, fontSize: 12, padding: '8px 18px', cursor: 'pointer',
          }}>
            + Nueva conexión
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          marginBottom: 14, padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: feedback.kind === 'ok' ? 'rgba(52,211,153,.10)' : 'rgba(255,107,107,.10)',
          border:     `1px solid ${feedback.kind === 'ok' ? 'rgba(52,211,153,.30)' : 'rgba(255,107,107,.30)'}`,
          color:      feedback.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{feedback.kind === 'ok' ? '✓' : '✕'} {feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: .7 }}
          >×</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <ConnectionForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      {/* Empty state */}
      {connections.length === 0 && !showForm && (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--border2)', borderRadius: 10,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            No hay conexiones configuradas
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>
            Agrega un sistema SAP CI-DS para empezar a gestionar tasks
          </div>
          <button onClick={handleNew} style={{
            background: 'var(--accent)', border: 'none', borderRadius: 7,
            color: '#000', fontWeight: 700, fontSize: 12, padding: '8px 18px',
          }}>
            + Nueva conexión
          </button>
        </div>
      )}

      {/* Connection cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connections.map(conn => (
          <div key={conn.id} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={40} />

            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conn.name} <span style={{ color: 'var(--text2)', fontWeight: 500 }}>({conn.isProduction ? 'Productivo' : 'Sandbox'})</span>
              </div>
              {conn.hciUrl && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.hciUrl}</div>}
            </div>

            {testResult[conn.id] && (
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: testResult[conn.id] === 'ok' ? 'rgba(52,211,153,.15)' : 'rgba(255,107,107,.15)',
                color: testResult[conn.id] === 'ok' ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${testResult[conn.id] === 'ok' ? 'rgba(52,211,153,.3)' : 'rgba(255,107,107,.3)'}`,
                flexShrink: 0,
              }}>
                {testResult[conn.id] === 'ok' ? '✓ Conectado' : '✕ Error'}
              </div>
            )}

            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap',
              justifyContent: 'flex-end',
              flex: '1 1 auto',
            }}>
              <button onClick={() => onSelect(conn.id)} style={btnStyle('var(--cyan)')}>Abrir</button>
              <button onClick={() => handleTest(conn)} style={btnStyle('var(--text2)')}>Probar</button>
              <button onClick={() => handleEdit(conn)} style={btnStyle('var(--text2)')}>Editar</button>
              <button onClick={() => handleDelete(conn.id, conn.name)} style={btnStyle('var(--red)')}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {testTarget && (
        <SapLoginModal
          connection={testTarget}
          onSuccess={sid => handleTestSuccess(testTarget, sid)}
          onCancel={handleTestCancel}
        />
      )}

      {importParsed && (
        <ImportConnectionsModal
          parsed={importParsed}
          existing={connections}
          fileName={importFileName}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
        />
      )}

      <TechLogs logs={logs} />
    </div>
  )
}

const secondaryBtnStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 7,
  color: 'var(--text2)', fontWeight: 600, fontSize: 12, padding: '8px 14px', cursor: 'pointer',
}

function btnStyle(color) {
  return {
    background: 'none', border: `1px solid ${color}33`,
    borderRadius: 6, color, fontSize: 11, fontWeight: 600,
    padding: '5px 12px', transition: 'all .15s',
  }
}
