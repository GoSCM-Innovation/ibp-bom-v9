import { useState, useEffect } from 'react'
import { soapCall } from '../../api/soapCall'
import { selectStyle } from '../../styles/forms'
import Field from '../ui/Field'
import { alpha } from '../../styles/tokens'


export default function RunSingleModal({ connection, sessionId, node, onClose }) {
  const [agents,      setAgents]      = useState([])
  const [configs,     setConfigs]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [running,     setRunning]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const [agentName,   setAgentName]   = useState(node.data.agentName || '')
  const [profileName, setProfileName] = useState(node.data.profileName || '')

  useEffect(() => {
    Promise.all([
      soapCall(connection, sessionId, 'getAgents', { activeOnly: false }),
      soapCall(connection, sessionId, 'getSystemConfigurations'),
    ]).then(([agentGroups, profs]) => {
      const flat = (Array.isArray(agentGroups) ? agentGroups : [])
        .flatMap(g => Array.isArray(g.agents) ? g.agents : [])
      setAgents(flat)
      setConfigs(Array.isArray(profs) ? profs : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [connection, sessionId])

  async function handleRun() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const vars = (node.data.globalVariables || []).filter(v => v.name.trim())
      const res = await soapCall(connection, sessionId, 'runTask', {
        taskName:        node.data.taskName,
        agentName:       agentName  || null,
        profileName:     profileName || null,
        globalVariables: vars,
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    }
    setRunning(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: alpha.black(0.55), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
        width: 360, boxShadow: `0 8px 32px ${alpha.black(0.4)}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ejecutar task individual</div>
            <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2, fontFamily: 'var(--mono)' }}>
              {node.data.taskName}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12, padding: '20px 0' }}>Cargando…</div>
          ) : (
            <>
              <Field label={`Agente (${agents.length} disponibles)`}>
                <select style={selectStyle} value={agentName} onChange={e => setAgentName(e.target.value)}>
                  <option value="">— Default del sistema —</option>
                  {agents.map(a => (
                    <option key={a.guid || a.name} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </Field>

              <Field label={`Configuración (${configs.length} disponibles)`} gap={14}>
                <select style={selectStyle} value={profileName} onChange={e => setProfileName(e.target.value)}>
                  <option value="">— Default del sistema —</option>
                  {configs.map(c => (
                    <option key={c.guid || c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>

              {(node.data.globalVariables || []).filter(v => v.name).length > 0 && (
                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  Variables: {(node.data.globalVariables || []).filter(v => v.name).map(v => `${v.name}=${v.value || '""'}`).join(', ')}
                </div>
              )}

              {result && (
                <div style={{ padding: '8px 10px', borderRadius: 6, background: alpha.green(.08), border: `1px solid ${alpha.green(.25)}`, fontSize: 11, color: 'var(--green)' }}>
                  Iniciado — RunID: <span style={{ fontFamily: 'var(--mono)' }}>{result.runId}</span>
                </div>
              )}
              {error && (
                <div style={{ padding: '8px 10px', borderRadius: 6, background: alpha.red(.08), border: `1px solid ${alpha.red(.2)}`, fontSize: 11, color: 'var(--red)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result && (
            <button onClick={handleRun} disabled={loading || running} style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: (loading || running) ? 'var(--bg3)' : alpha.green(.133),
              color: (loading || running) ? 'var(--text2)' : 'var(--green)',
              border: `1px solid ${(loading || running) ? 'var(--border)' : alpha.green(.267)}`,
              cursor: (loading || running) ? 'default' : 'pointer',
            }}>
              {running ? 'Iniciando…' : '▶ Ejecutar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
