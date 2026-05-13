import { useState, useEffect } from 'react'

async function soapCall(connection, sessionId, operation, params = {}) {
  const { hciUrl, orgName, isProduction } = connection
  const res = await fetch('/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection: { hciUrl, orgName, isProduction }, sessionId, operation, params }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const selectStyle = {
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', fontSize: 12, padding: '7px 10px', width: '100%',
  boxSizing: 'border-box', outline: 'none', cursor: 'pointer',
}
const inputStyle = {
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', fontSize: 12, padding: '7px 10px', width: '100%',
  boxSizing: 'border-box', outline: 'none',
}
const labelStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--text2)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  display: 'block', marginBottom: 5,
}

function FieldRow({ label, count, rawData, children }) {
  const [showRaw, setShowRaw] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: count === 0 ? '#f97316' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
            {count} encontrado{count !== 1 ? 's' : ''}
          </span>
          {rawData !== null && (
            <button onClick={() => setShowRaw(v => !v)} style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
              background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)',
            }}>
              {showRaw ? 'ocultar' : 'raw'}
            </button>
          )}
        </div>
      </div>
      {children}
      {showRaw && (
        <pre style={{
          marginTop: 6, padding: '6px 8px', borderRadius: 6, fontSize: 9,
          background: 'var(--bg)', color: 'var(--text2)', overflow: 'auto',
          maxHeight: 120, border: '1px solid var(--border)', fontFamily: 'var(--mono)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {JSON.stringify(rawData, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function RunModal({ connection, sessionId, orchNodes = [], onConfirm, onClose }) {
  const PRESETS_KEY = `ibp-presets-${connection.id}`
  const [agents,     setAgents]     = useState([])
  const [configs,    setConfigs]    = useState([])
  const [rawAgents,  setRawAgents]  = useState(null)
  const [rawConfigs, setRawConfigs] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [presets,    setPresets]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') } catch { return [] }
  })

  const [selectedAgent,   setSelectedAgent]  = useState('')
  const [selectedConfig,  setSelectedConfig] = useState('')
  const [manualAgent,     setManualAgent]    = useState('')
  const [manualConfig,    setManualConfig]   = useState('')
  const [useManual,       setUseManual]      = useState(false)

  // Orchestration-level global variables
  const [globalVariables, setGlobalVariables] = useState([])
  const [availableVars,   setAvailableVars]   = useState([]) // [{name, defaultValue, description}]
  const [varsStatus,      setVarsStatus]      = useState('idle') // idle | loading | loaded | error

  function addGlobalVar() {
    setGlobalVariables(v => [...v, { name: '', value: '' }])
  }
  function removeGlobalVar(i) {
    setGlobalVariables(v => v.filter((_, j) => j !== i))
  }
  function patchGlobalVar(i, field, val) {
    setGlobalVariables(v => v.map((row, j) => {
      if (j !== i) return row
      const next = { ...row, [field]: val }
      if (field === 'name') next.value = ''
      return next
    }))
  }

  // Load agents + system configs
  useEffect(() => {
    async function load() {
      // eslint-disable-next-line no-console
      console.log('[ibp-runmodal-debug] mount/load', {
        connId: connection?.id,
        hciUrl: connection?.hciUrl,
        orgName: connection?.orgName,
        isProduction: connection?.isProduction,
        sessionId,
      })
      try {
        const [agentGroups, profs] = await Promise.all([
          soapCall(connection, sessionId, 'getAgents', { activeOnly: false }),
          soapCall(connection, sessionId, 'getSystemConfigurations'),
        ])
        // eslint-disable-next-line no-console
        console.log('[ibp-runmodal-debug] response', {
          isProduction: connection?.isProduction,
          sessionId,
          agentGroupsCount: Array.isArray(agentGroups) ? agentGroups.length : 'not-array',
          configsCount:     Array.isArray(profs) ? profs.length : 'not-array',
          firstAgent:       Array.isArray(agentGroups) && agentGroups[0]?.agents?.[0]?.name,
          firstConfig:      Array.isArray(profs) && profs[0]?.name,
        })
        setRawAgents(agentGroups)
        setRawConfigs(profs)
        const flat = (Array.isArray(agentGroups) ? agentGroups : [])
          .flatMap(g => Array.isArray(g.agents) ? g.agents : [])
        setAgents(flat)
        setConfigs(Array.isArray(profs) ? profs : [])
        if (flat.length === 0) setUseManual(true)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[ibp-runmodal-debug] error', e.message)
        setError(e.message)
        setUseManual(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [connection, sessionId])

  // Load available variables from all tasks in the orchestration
  useEffect(() => {
    const taskNodes = orchNodes.filter(n => (n.type === 'task' || n.type === 'orchTask') && n.data?.taskGuid)
    const guids = [...new Set(taskNodes.map(n => n.data.taskGuid))]
    if (guids.length === 0) { setVarsStatus('idle'); return }

    setVarsStatus('loading')
    let cancelled = false

    Promise.allSettled(guids.map(guid => soapCall(connection, sessionId, 'getTaskInfo', { taskGuid: guid })))
      .then(results => {
        if (cancelled) return
        const seen = new Map()
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          for (const v of (r.value?.globalVariables || [])) {
            if (!seen.has(v.name)) seen.set(v.name, v)
          }
        }
        const merged = [...seen.values()]
        setAvailableVars(merged)
        // Pre-populate variable NAMES with empty values: an empty value means
        // "don't override" — each node falls back to its own configured value,
        // and if the node has none, SAP uses the system default.
        setGlobalVariables(merged.map(v => ({ name: v.name, value: '' })))
        setVarsStatus(merged.length > 0 ? 'loaded' : 'loaded')
      })
      .catch(() => { if (!cancelled) setVarsStatus('error') })

    return () => { cancelled = true }
  }, [orchNodes, connection, sessionId])

  function savePreset() {
    const label = prompt('Nombre del preset:')?.trim()
    if (!label) return
    const agent  = useManual ? manualAgent.trim()  : selectedAgent
    const config = useManual ? manualConfig.trim() : selectedConfig
    const vars   = globalVariables.filter(v => v.name.trim() && v.value !== '')
    const next = [...presets, { id: crypto.randomUUID(), label, agentName: agent || null, profileName: config || null, globalVariables: vars }]
    setPresets(next)
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  }

  function deletePreset(e, id) {
    e.stopPropagation()
    const next = presets.filter(p => p.id !== id)
    setPresets(next)
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  }

  function handleConfirm() {
    const agent  = useManual ? (manualAgent.trim() || null)  : (selectedAgent  || null)
    const config = useManual ? (manualConfig.trim() || null) : (selectedConfig || null)
    // Only send variables with a non-empty value. Empty rows mean
    // "no override" — node value or SAP default will be used.
    const vars   = globalVariables.filter(v => v.name.trim() && v.value !== '')
    onConfirm(agent, config, vars)
  }

  const varsHeader = varsStatus === 'loading'
    ? 'Variables globales — cargando…'
    : varsStatus === 'error'
      ? 'Variables globales — error al cargar'
      : `Variables globales (${availableVars.length} disponibles en sistema)`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 10, width: 440, maxHeight: '88vh',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Iniciar orquestación</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              Agente y configuración por defecto para nodos sin valores propios
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {/* Presets de ejecución rápida */}
          {presets.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ejecución rápida</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {presets.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <button
                      onClick={() => onConfirm(p.agentName, p.profileName, p.globalVariables || [])}
                      style={{
                        fontSize: 10, padding: '4px 8px', borderRadius: '4px 0 0 4px', cursor: 'pointer',
                        background: '#34d39922', border: '1px solid #34d39944', color: '#34d399', fontWeight: 600,
                      }}
                    >▶ {p.label}</button>
                    <button
                      onClick={e => deletePreset(e, p.id)}
                      style={{
                        fontSize: 10, padding: '4px 5px', borderRadius: '0 4px 4px 0', cursor: 'pointer',
                        background: 'var(--bg3)', border: '1px solid var(--border)', borderLeft: 'none',
                        color: 'var(--text3)',
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12, padding: '24px 0' }}>
              Cargando agentes y configuraciones…
            </div>
          )}

          {!loading && error && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                padding: '8px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.2)',
                color: 'var(--red)', lineHeight: 1.5, marginBottom: 8,
              }}>
                Error al cargar desde SAP: {error}
              </div>
            </div>
          )}

          {!loading && (
            <>
              {/* Toggle manual / dropdown */}
              {!error && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <button onClick={() => setUseManual(v => !v)} style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                    background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)',
                  }}>
                    {useManual ? '← Usar dropdown' : 'Escribir manualmente →'}
                  </button>
                </div>
              )}

              {/* Agente */}
              <FieldRow label="Agente" count={agents.length} rawData={rawAgents}>
                {useManual ? (
                  <input
                    style={inputStyle}
                    value={manualAgent}
                    onChange={e => setManualAgent(e.target.value)}
                    placeholder="Nombre del agente (dejar vacío para default)"
                  />
                ) : (
                  <select style={selectStyle} value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
                    <option value="">— Sin agente específico —</option>
                    {agents.map(a => (
                      <option key={a.guid || a.name} value={a.name}>
                        {a.name}{a.agentStatus && !a.agentStatus.includes('CONNECTED') ? ` (${a.agentStatus})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </FieldRow>

              {/* Configuración */}
              <FieldRow label="Configuración de sistema" count={configs.length} rawData={rawConfigs}>
                {useManual ? (
                  <input
                    style={inputStyle}
                    value={manualConfig}
                    onChange={e => setManualConfig(e.target.value)}
                    placeholder="Nombre del perfil (dejar vacío para default)"
                  />
                ) : (
                  <select style={selectStyle} value={selectedConfig} onChange={e => setSelectedConfig(e.target.value)}>
                    <option value="">— Sin configuración específica —</option>
                    {configs.map(c => (
                      <option key={c.guid || c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                )}
              </FieldRow>

              {/* Variables globales de orquestación */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <label style={labelStyle}>
                    {varsHeader}
                    {varsStatus === 'loading' && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text3)' }}>⏳</span>}
                    {varsStatus === 'error' && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--red)' }}>Error SAP</span>}
                  </label>
                  <button onClick={addGlobalVar} style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                    background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)',
                    flexShrink: 0,
                  }}>+ Variable</button>
                </div>

                {globalVariables.length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>
                    {varsStatus === 'loading'
                      ? 'Cargando variables del sistema…'
                      : varsStatus === 'error'
                        ? 'No se pudieron cargar las variables del sistema.'
                        : 'Sin variables globales — se usarán las de cada task individual.'}
                  </div>
                )}

                {globalVariables.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    {varsStatus === 'loading' ? (
                      <div style={{ ...inputStyle, flex: 1, color: 'var(--text3)', fontSize: 11 }}>Cargando…</div>
                    ) : (
                      <select
                        style={{ ...selectStyle, flex: 1, padding: '6px 8px' }}
                        value={v.name}
                        onChange={e => patchGlobalVar(i, 'name', e.target.value)}
                      >
                        <option value="">— Seleccionar —</option>
                        {v.name && !availableVars.some(a => a.name === v.name) && (
                          <option value={v.name}>{v.name}</option>
                        )}
                        {availableVars.map(a => (
                          <option key={a.name} value={a.name}>
                            {a.name}{a.description ? ` — ${a.description}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      style={{ ...inputStyle, flex: 1, padding: '6px 8px' }}
                      value={v.value}
                      onChange={e => patchGlobalVar(i, 'value', e.target.value)}
                      placeholder="vacío = usar valor del nodo"
                      disabled={varsStatus === 'loading'}
                    />
                    <button onClick={() => removeGlobalVar(i)} style={{
                      background: 'none', border: 'none', color: 'var(--red)',
                      cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0,
                    }}>×</button>
                  </div>
                ))}

                {globalVariables.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.5, marginTop: 4 }}>
                    Si escribes un valor, se aplica a TODOS los nodos que usen esa variable (pisa lo del nodo).
                    Si lo dejas vacío, cada nodo usa el valor configurado en su panel; si tampoco tiene, SAP usa el default del sistema.
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>
                Si dejas agente y configuración vacíos, SAP usará los valores por defecto del sistema.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: 'var(--bg3)', color: 'var(--text2)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={savePreset} disabled={loading} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: 'var(--bg3)', color: loading ? 'var(--text3)' : 'var(--text2)',
            border: '1px solid var(--border)', cursor: loading ? 'default' : 'pointer',
          }}>
            Guardar preset
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: '6px 18px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: loading ? 'var(--bg3)' : '#34d39922',
              color: loading ? 'var(--text2)' : '#34d399',
              border: `1px solid ${loading ? 'var(--border)' : '#34d39944'}`,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            ▶ Iniciar
          </button>
        </div>
      </div>
    </div>
  )
}
