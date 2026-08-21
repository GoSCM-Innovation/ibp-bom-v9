import { useState, useMemo } from 'react'
import { alpha, color, hex, withAlpha } from '../../styles/tokens'

function isDuplicate(incoming, existing) {
  return (incoming.name || '').trim().toLowerCase() === (existing.name || '').trim().toLowerCase()
}

export default function ImportOrchestrationsModal({ parsed, existing, fileName, currentConnection, onConfirm, onCancel }) {
  const [replaceDuplicates, setReplaceDuplicates] = useState(false)

  const classified = useMemo(
    () => parsed.orchestrations.map(o => ({
      ...o,
      _dup:       existing.some(e => isDuplicate(o, e)),
      _nodeCount: Array.isArray(o.nodes) ? o.nodes.length : 0,
      _edgeCount: Array.isArray(o.edges) ? o.edges.length : 0,
    })),
    [parsed.orchestrations, existing]
  )

  const newCount = classified.filter(o => !o._dup).length
  const dupCount = classified.filter(o =>  o._dup).length
  const willImport = newCount + (replaceDuplicates ? dupCount : 0)

  const hasInvalid = parsed.invalid && parsed.invalid.length > 0
  const empty = parsed.orchestrations.length === 0

  // Cross-tenant warning: source org differs from current connection's org
  const srcOrg = parsed.sourceConnection?.orgName
  const curOrg = currentConnection?.orgName
  const tenantMismatch = srcOrg && curOrg && srcOrg.trim().toLowerCase() !== curOrg.trim().toLowerCase()

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: alpha.black(.6), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12,
        width: 'min(680px, 95vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: `0 8px 32px ${alpha.black(.5)}`, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: color.white }}>Importar orquestaciones</div>
          {fileName && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              {fileName}
              {parsed.sourceConnection?.name && (
                <span style={{ marginLeft: 8, color: 'var(--text2)' }}>
                  · origen: {parsed.sourceConnection.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Summary pills */}
        <div style={{ padding: '14px 22px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <Pill color={hex.info} label={`${parsed.orchestrations.length} en archivo`} />
          <Pill color={hex.green} label={`${newCount} nuevas`} />
          <Pill color={hex.warning} label={`${dupCount} ya existen`} />
          {hasInvalid && <Pill color={hex.red} label={`${parsed.invalid.length} inválidas`} />}
        </div>

        {/* Cross-tenant warning */}
        {tenantMismatch && (
          <div style={{
            margin: '12px 22px 0', padding: '10px 14px',
            background: alpha.accent(.08), border: `1px solid ${alpha.accent(.30)}`,
            borderRadius: 8, fontSize: 11, color: 'var(--accent)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 700 }}>Tenant SAP distinto</div>
              <div style={{ color: 'var(--text2)', marginTop: 2 }}>
                Origen: <span style={{ fontFamily: 'var(--mono)' }}>{srcOrg}</span> ·
                Actual: <span style={{ fontFamily: 'var(--mono)' }}>{curOrg}</span>.
                Algunos task GUIDs no se resolverán en este tenant — los nodos afectados aparecerán como huérfanos
                y podrás reasignarlos manualmente desde el panel de configuración.
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px' }}>
          {empty ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              El archivo no contiene orquestaciones válidas
            </div>
          ) : (
            classified.map((o, i) => (
              <div key={i} style={{
                padding: '10px 0', borderBottom: '1px solid var(--border)',
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: color.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.name || <em style={{ color: 'var(--text3)' }}>(sin nombre)</em>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {o._nodeCount} nodo{o._nodeCount === 1 ? '' : 's'} · {o._edgeCount} conexion{o._edgeCount === 1 ? '' : 'es'}
                  </div>
                </div>
                <Tag dup={o._dup} willSkip={o._dup && !replaceDuplicates} />
              </div>
            ))
          )}

          {hasInvalid && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: alpha.red(.08), border: `1px solid ${alpha.red(.25)}`, borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>
                Entradas omitidas ({parsed.invalid.length})
              </div>
              {parsed.invalid.slice(0, 5).map((e, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text3)' }}>
                  #{e.index + 1}: {e.reason}
                </div>
              ))}
              {parsed.invalid.length > 5 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  …y {parsed.invalid.length - 5} más
                </div>
              )}
            </div>
          )}
        </div>

        {/* Strategy */}
        {dupCount > 0 && (
          <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceDuplicates}
                onChange={e => setReplaceDuplicates(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Reemplazar las {dupCount} orquestacion{dupCount === 1 ? '' : 'es'} ya existente{dupCount === 1 ? '' : 's'} con los datos del archivo
            </label>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, paddingLeft: 22 }}>
              Si está desmarcado, las duplicadas se omiten y se conservan las actuales
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button onClick={onCancel} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
            color: 'var(--text2)', fontSize: 12, fontWeight: 600, padding: '7px 18px', cursor: 'pointer',
          }}>Cancelar</button>
          <button
            onClick={() => onConfirm({ replaceDuplicates })}
            disabled={willImport === 0}
            style={{
              background: willImport === 0 ? 'var(--bg3)' : 'var(--accent)',
              border: 'none', borderRadius: 6,
              color: willImport === 0 ? 'var(--text3)' : color.onAccent,
              fontSize: 12, fontWeight: 700, padding: '7px 18px',
              cursor: willImport === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Importar {willImport > 0 ? willImport : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// Gris del estado TERMINATED: no esta en la paleta, es un tono propio del
// listado de importacion para lo que se omite.
const GRAY = '#9ca3af'

function Pill({ color, label }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
      background: withAlpha(color, .133), color, border: `1px solid ${withAlpha(color, .267)}`,
    }}>
      {label}
    </span>
  )
}

function Tag({ dup, willSkip }) {
  if (!dup) return <Pill color={hex.green} label="NUEVA" />
  if (willSkip) return <Pill color={GRAY} label="OMITIR" />
  return <Pill color={hex.warning} label="REEMPLAZAR" />
}
