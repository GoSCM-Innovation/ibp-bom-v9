import { useState, useRef } from 'react'
import ConnectionForm from './ConnectionForm'
import ConnectionAvatar from './ConnectionAvatar'
import SapLoginModal from './SapLoginModal'
import ImportConnectionsModal from './ImportConnectionsModal'
import TechLogs from '../TechLogs'
import { useTechLogs } from '../../hooks/useTechLogs'
import { primaryBtn, secondaryBtn } from '../../styles/buttons'

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
  const [showHelp, setShowHelp] = useState(false)
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
            onClick={() => setShowHelp(v => !v)}
            title="Ver guía paso a paso para crear una conexión"
            style={{
              ...secondaryBtnStyle,
              background: showHelp ? 'rgba(96,165,250,.12)' : 'var(--bg2)',
              borderColor: showHelp ? 'rgba(96,165,250,.45)' : 'var(--border2)',
              color: showHelp ? 'var(--cyan)' : 'var(--text2)',
            }}
          >
            {showHelp ? '× Ocultar guía' : '? Cómo crear una conexión'}
          </button>
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
          <button onClick={handleNew} style={primaryBtn}>
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

      {/* Help / tutorial panel */}
      {showHelp && (
        <div style={{ marginBottom: 18 }}>
          <HelpPanel onClose={() => setShowHelp(false)} />
        </div>
      )}

      {/* Form — only at the top when creating a new connection. Editing renders inline below. */}
      {showForm && !editing && (
        <div style={{ marginBottom: 24 }}>
          <ConnectionForm
            initial={null}
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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleNew} style={primaryBtn}>
              + Nueva conexión
            </button>
            <button onClick={() => setShowHelp(true)} style={{ ...secondaryBtn, color: 'var(--cyan)' }}>
              ? Ver guía paso a paso
            </button>
          </div>
        </div>
      )}

      {/* Connection cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connections.map(conn => {
          const isEditing = showForm && editing?.id === conn.id
          if (isEditing) {
            return (
              <div key={conn.id}>
                <ConnectionForm
                  initial={editing}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); setEditing(null) }}
                />
              </div>
            )
          }
          return (
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
          )
        })}
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

function HelpPanel({ onClose }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid rgba(96,165,250,.35)', borderRadius: 10,
      padding: '18px 20px', position: 'relative',
    }}>
      <button
        onClick={onClose}
        title="Cerrar guía"
        style={{
          position: 'absolute', top: 10, right: 12, background: 'none', border: 'none',
          color: 'var(--text2)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
        }}
      >×</button>

      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        Cómo crear una conexión a SAP CI-DS
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
        Guía rápida. Las conexiones se guardan cifradas; la contraseña se pide al iniciar sesión, no se almacena en el formulario.
      </div>

      <HelpStep n="1" title="Abrir el formulario">
        Pulsa <b style={{ color: 'var(--accent)' }}>+ Nueva conexión</b> arriba a la derecha.
      </HelpStep>

      <HelpStep n="2" title="Rellena los campos">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
          <thead>
            <tr style={{ color: 'var(--text2)', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <th style={thStyle}>Campo</th>
              <th style={thStyle}>Qué poner</th>
              <th style={thStyle}>De dónde sacarlo</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text)' }}>
            <tr><td style={tdStyle}><b>Nombre conexión</b></td><td style={tdStyle}>Etiqueta libre</td><td style={tdStyle}>Lo que quieras (ej. <code style={codeStyle}>CI-DS Producción EMEA</code>)</td></tr>
            <tr><td style={tdStyle}><b>Organización</b></td><td style={tdStyle}>Nombre técnico de la org CI-DS (case-sensitive)</td><td style={tdStyle}>Consola CI-DS → arriba a la derecha, bajo tu usuario aparece la organización activa</td></tr>
            <tr><td style={tdStyle}><b>URL del servicio</b></td><td style={tdStyle}>Endpoint SOAP del WebService</td><td style={tdStyle}>Ver paso 3</td></tr>
            <tr><td style={tdStyle}><b>Usuario SAP</b> <span style={{ color: 'var(--text3)' }}>(opcional)</span></td><td style={tdStyle}>Usuario tipo WebService</td><td style={tdStyle}>Lo crea el admin en <b>Administrator → Users</b> con permiso de WebServices (un usuario normal de UI no sirve)</td></tr>
            <tr><td style={tdStyle}><b>URL del logo</b> <span style={{ color: 'var(--text3)' }}>(opcional)</span></td><td style={tdStyle}>Imagen para identificar la conexión</td><td style={tdStyle}>Cualquier URL pública de imagen</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
          Al guardar se crean automáticamente <b>dos conexiones</b>: una contra el repositorio de Producción y otra contra Sandbox.
        </div>
      </HelpStep>

      <HelpStep n="3" title="Cómo formar la URL del servicio">
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
          Depende de la plataforma donde corre tu tenant:
          <ul style={{ margin: '8px 0 8px 18px', padding: 0 }}>
            <li><b>Kyma</b> (lo más común): <code style={codeStyle}>https://&lt;host&gt;/webservices</code><br/>
              <span style={{ color: 'var(--text2)' }}>Ej.: <code style={codeStyle}>https://us.cids.cloud.sap/webservices</code>, <code style={codeStyle}>https://eu.cids.cloud.sap/webservices</code></span>
            </li>
            <li style={{ marginTop: 6 }}><b>Neo</b> (legacy): <code style={codeStyle}>https://&lt;host&gt;/DSoD/webservices</code></li>
          </ul>
          <div style={{ color: 'var(--text2)', marginTop: 6 }}>
            Para obtener tu <code style={codeStyle}>&lt;host&gt;</code>: abre el portal CI-DS en el navegador y copia el dominio antes de <code style={codeStyle}>/ui/...</code> o <code style={codeStyle}>/app/...</code>. Luego reemplaza la ruta por <code style={codeStyle}>/webservices</code>.
          </div>
        </div>
      </HelpStep>

      <HelpStep n="4" title="Probar la conexión">
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
          Tras guardar, pulsa <b style={{ color: 'var(--cyan)' }}>Probar</b> en la fila de la conexión. Se abrirá un modal pidiendo usuario y contraseña. Si las credenciales y la URL son correctas, verás <b style={{ color: 'var(--green)' }}>✓ Conectado</b> y podrás pulsar <b>Abrir</b> para entrar al sistema.
        </div>
      </HelpStep>

      <div style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 8,
        background: 'rgba(255,107,107,.06)', border: '1px solid rgba(255,107,107,.20)',
        fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
      }}>
        <b style={{ color: 'var(--red)' }}>Errores típicos:</b>
        &nbsp;Organización mal escrita (mayúsculas/minúsculas) ·
        URL apuntando a la UI en vez de <code style={codeStyle}>/webservices</code> ·
        Usuario sin permiso de WebService.
      </div>
    </div>
  )
}

function HelpStep({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

const thStyle = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600 }
const tdStyle = { padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const codeStyle = { fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }
