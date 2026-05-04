import { useState, useEffect, useCallback, useRef } from 'react'
import ProgressBar from '../ui/ProgressBar'
import ConnectionAvatar from '../Connections/ConnectionAvatar'
import { getTzMode, setTzMode, toInputDate, inputDateToDate, dayLabelEpoch, TZ_OPTIONS } from '../../utils/dateUtils'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'

const REFRESH_MS = 5 * 60 * 1000

const STATUS_COLORS = {
  'RUNNING':               '#3b82f6',
  'SUCCESS':               '#34d399',
  'SUCCESS_WITH_ERRORS_D': '#fbbf24',
  'SUCCESS_WITH_ERRORS_E': '#f97316',
  'ERROR':                 '#ff6b6b',
  'QUEUEING':              '#8b5cf6',
  'IMPORTED':              '#06b6d4',
  'FETCHED':               '#22d3ee',
  'TERMINATED':            '#9ca3af',
  'TERMINATION_FAILED':    '#ef4444',
  'UNKNOWN':               '#6b7280',
}

const STATUS_LABELS = {
  'RUNNING': 'Running', 'SUCCESS': 'Success',
  'SUCCESS_WITH_ERRORS_D': 'Success w/err D', 'SUCCESS_WITH_ERRORS_E': 'Success w/err E',
  'ERROR': 'Error', 'QUEUEING': 'Queueing', 'IMPORTED': 'Imported',
  'FETCHED': 'Fetched', 'TERMINATED': 'Terminated',
  'TERMINATION_FAILED': 'Termination failed', 'UNKNOWN': 'Unknown',
}

async function soapCall(connection, sessionId, operation, params = {}) {
  const res = await fetch('/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: { hciUrl: connection.hciUrl, orgName: connection.orgName, isProduction: connection.isProduction },
      sessionId, operation, params,
    }),
  })
  const raw = await res.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch {}
  if (res.status === 401) throw Object.assign(new Error('Sesión SAP expirada'), { isSessionExpired: true })
  if (!res.ok) {
    const msg = data?.error || raw?.slice(0, 240) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (!data) throw new Error(raw?.slice(0, 240) || 'Respuesta inválida del servidor')
  if (data.error) throw new Error(data.error)
  return data
}

function connMiniStats(rows) {
  const total    = rows.length
  const running  = rows.filter(r => r.statusCode === 'RUNNING').length
  const success  = rows.filter(r => r.statusCode === 'SUCCESS').length
  const failed   = rows.filter(r => ['ERROR', 'TERMINATION_FAILED'].includes(r.statusCode)).length
  const warnings = rows.filter(r => ['SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'].includes(r.statusCode)).length
  const rate     = total > 0 ? Math.round(((success + warnings) / total) * 100) : null
  return { total, running, success, failed, warnings, rate }
}

export default function GlobalResumen({ connections }) {
  const [connData, setConnData]         = useState({})
  const [tzMode, setTzModeState]        = useState(() => getTzMode())
  const [fromDate, setFromDate]         = useState(() => toInputDate(new Date(Date.now() - 7 * 86400000), getTzMode()))
  const [toDate,   setToDate]           = useState(() => toInputDate(new Date(), getTzMode()))
  const [loadingAll, setLoadingAll]     = useState(false)
  const [lastRefresh, setLastRefresh]   = useState(null)
  const timerRef = useRef(null)

  function handleTzChange(newMode) {
    const from = inputDateToDate(fromDate, tzMode)
    const to   = inputDateToDate(toDate,   tzMode)
    setFromDate(toInputDate(from, newMode))
    setToDate(toInputDate(to,   newMode))
    setTzModeState(newMode)
    setTzMode(newMode)
  }

  const loadAll = useCallback(async () => {
    setLoadingAll(true)

    async function loadOne(conn) {
      const sessionId = sessionStorage.getItem(`sap_${conn.id}`)
      if (!sessionId) {
        setConnData(prev => ({ ...prev, [conn.id]: { status: 'no-session', rows: [], agents: [], error: null } }))
        return
      }
      setConnData(prev => ({
        ...prev,
        [conn.id]: { status: 'loading', rows: prev[conn.id]?.rows || [], agents: prev[conn.id]?.agents || [], error: null },
      }))
      try {
        const [tasks, agentGroups] = await Promise.all([
          soapCall(conn, sessionId, 'getAllExecutedTasks2', {
            startDateFrom: inputDateToDate(fromDate, tzMode)?.toISOString(),
            startDateTo:   inputDateToDate(toDate,   tzMode)?.toISOString(),
          }),
          soapCall(conn, sessionId, 'getAgents', { activeOnly: false }),
        ])
        const flatAgents = (Array.isArray(agentGroups) ? agentGroups : [])
          .flatMap(g => Array.isArray(g.agents) ? g.agents : [])
        setConnData(prev => ({
          ...prev,
          [conn.id]: { status: 'ok', rows: Array.isArray(tasks) ? tasks : [], agents: flatAgents, error: null },
        }))
      } catch (e) {
        const status = e.isSessionExpired ? 'session-expired' : 'error'
        setConnData(prev => ({ ...prev, [conn.id]: { status, rows: [], agents: [], error: e.isSessionExpired ? null : e.message } }))
      }
    }

    await Promise.allSettled(connections.map(loadOne))
    setLoadingAll(false)
    setLastRefresh(new Date())
  }, [connections, fromDate, toDate, tzMode])

  useEffect(() => {
    loadAll()
    timerRef.current = setInterval(loadAll, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [loadAll])

  if (connections.length === 0) return (
    <div style={{ padding: 32, color: 'var(--text2)', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: .4 }}>⊘</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>No hay conexiones configuradas</div>
      <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text3)' }}>Añade conexiones desde la pantalla de Conexiones.</div>
    </div>
  )

  // Aggregates — computed from connections with status 'ok' only
  const okConns  = connections.filter(c => connData[c.id]?.status === 'ok')
  const allRows   = okConns.flatMap(c => connData[c.id].rows)

  const total         = allRows.length
  const running       = allRows.filter(r => r.statusCode === 'RUNNING').length
  const queued        = allRows.filter(r => ['QUEUEING', 'IMPORTED', 'FETCHED'].includes(r.statusCode)).length
  const success       = allRows.filter(r => r.statusCode === 'SUCCESS').length
  const failed        = allRows.filter(r => r.statusCode === 'ERROR').length
  const warningsCount = allRows.filter(r => ['SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'].includes(r.statusCode)).length
  const successRate   = total > 0 ? Math.round(((success + warningsCount) / total) * 100) : 0

  const statusCount = {}
  allRows.forEach(r => { statusCount[r.statusCode] = (statusCount[r.statusCode] || 0) + 1 })
  const donutData = Object.entries(statusCount)
    .map(([code, count]) => ({ name: STATUS_LABELS[code] || code, value: count, code }))
    .sort((a, b) => b.value - a.value)

  const dayMap = {}
  allRows.forEach(r => {
    const d = dayLabelEpoch(r.startDate, tzMode)
    if (!dayMap[d]) dayMap[d] = { day: d, Exitosas: 0, Fallidas: 0, Otras: 0 }
    if (r.statusCode === 'SUCCESS') dayMap[d].Exitosas++
    else if (r.statusCode === 'ERROR' || r.statusCode === 'TERMINATION_FAILED') dayMap[d].Fallidas++
    else dayMap[d].Otras++
  })
  const barData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)).slice(-14)

  const taskMap = {}
  allRows.forEach(r => { const k = r.taskName || '—'; taskMap[k] = (taskMap[k] || 0) + 1 })
  const topTasks = Object.entries(taskMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const recentFailed = okConns
    .flatMap(c => connData[c.id].rows
      .filter(r => r.statusCode === 'ERROR' || r.statusCode === 'TERMINATION_FAILED')
      .map(r => ({ ...r, _connName: c.name }))
    )
    .sort((a, b) => (parseInt(b.startDate) || 0) - (parseInt(a.startDate) || 0))
    .slice(0, 5)

  const allNoSession = !loadingAll && connections.every(c => {
    const s = connData[c.id]?.status
    return !s || s === 'no-session' || s === 'session-expired'
  })

  const rateColor = total === 0 ? 'var(--text2)' : successRate >= 90 ? 'var(--green)' : successRate >= 70 ? 'var(--accent)' : 'var(--red)'

  return (
    <div style={{ padding: 28, overflowY: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
      <ProgressBar loading={loadingAll} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Resumen Global</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            {connections.length} conexión(es) · {total} ejecuciones totales
            {lastRefresh && !loadingAll && <span style={{ marginLeft: 8, opacity: .6 }}>· {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
            {TZ_OPTIONS.filter(o => o.value !== 'local').map(opt => (
              <button key={opt.value} onClick={() => handleTzChange(opt.value)} style={{
                padding: '5px 9px', fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tzMode === opt.value ? 'var(--accent)' : 'var(--bg3)',
                color:      tzMode === opt.value ? '#000'          : 'var(--text2)',
                transition: 'background .15s',
              }}>{opt.label}</button>
            ))}
          </div>
          <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          <span style={{ color: 'var(--text2)', fontSize: 11 }}>→</span>
          <input type="datetime-local" value={toDate}   onChange={e => setToDate(e.target.value)}   style={inputStyle} />
          <button onClick={loadAll} disabled={loadingAll} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text2)', fontSize: 11, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>↺ Refresh</button>
          <span style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>Auto-refresh 5 min</span>
        </div>
      </div>

      {/* No-session banner */}
      {allNoSession && (
        <div style={{ background: 'rgba(247,168,0,.08)', border: '1px solid rgba(247,168,0,.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent)', marginBottom: 20 }}>
          Ninguna conexión tiene sesión activa. Accede a cada conexión para iniciar sesión SAP.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid-kpi">
        <KpiCard label="Total ejecuciones" value={total}              color="var(--text)" />
        <KpiCard label="En ejecución"       value={running}           color="var(--cyan)" />
        <KpiCard label="En cola"            value={queued}            color="var(--purple)" />
        <KpiCard label="Exitosas"           value={success}           color="var(--green)" />
        <KpiCard label="Fallidas"           value={failed}            color="var(--red)" />
        <KpiCard label="Tasa de éxito"      value={`${successRate}%`} color={rateColor} />
      </div>

      {/* Connection status table */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={cardTitle}>Estado por conexión</div>
        {connections.map((conn, i) => {
          const state = connData[conn.id] || { status: 'idle', rows: [], agents: [], error: null }
          const stats = state.status === 'ok' ? connMiniStats(state.rows) : null
          return (
            <div key={conn.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < connections.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{conn.isProduction ? 'Producción' : 'Sandbox'}</div>
              </div>
              <StatusBadge status={state.status} error={state.error} />
              {stats && <MiniStats stats={stats} />}
            </div>
          )
        })}
      </div>

      {/* Charts — only when there's aggregated data */}
      {allRows.length > 0 && (
        <div className="grid-charts">
          <div style={cardStyle}>
            <div style={cardTitle}>Distribución por estado</div>
            {donutData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {donutData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.code] || '#6b7280'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
              {donutData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text2)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[d.code] || '#6b7280', flexShrink: 0 }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={cardTitle}>Ejecuciones por día</div>
            {barData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text2)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text2)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text2)' }} />
                  <Bar dataKey="Exitosas" stackId="a" fill="#34d399" />
                  <Bar dataKey="Fallidas" stackId="a" fill="#ff6b6b" />
                  <Bar dataKey="Otras"    stackId="a" fill="#6b7280" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Stats grid — only when there's aggregated data */}
      {allRows.length > 0 && (
        <div className="grid-stats">
          <div style={cardStyle}>
            <div style={cardTitle}>Top tasks ejecutadas</div>
            {topTasks.length === 0 ? <Empty /> : topTasks.map(([name, count], i) => (
              <RankRow key={i} rank={i + 1} label={name} count={count} max={topTasks[0][1]} color="var(--cyan)" />
            ))}
          </div>

          <div style={cardStyle}>
            <div style={cardTitle}>Últimas fallidas</div>
            {recentFailed.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 8 }}>✓ Sin fallos en el período</div>
              : recentFailed.map((r, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: i < recentFailed.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.taskName || '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{r._connName}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, error }) {
  const configs = {
    'ok':              { color: 'var(--green)',  label: 'OK' },
    'loading':         { color: 'var(--accent)', label: 'Cargando…' },
    'no-session':      { color: 'var(--text3)',  label: 'Sin sesión' },
    'session-expired': { color: 'var(--red)',    label: 'Sesión expirada' },
    'error':           { color: 'var(--red)',    label: error ? error.slice(0, 30) : 'Error' },
    'idle':            { color: 'var(--text3)',  label: '—' },
  }
  const { color, label } = configs[status] || configs['idle']
  return (
    <div title={error || undefined} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

function MiniStats({ stats }) {
  const rateColor = stats.rate === null ? 'var(--text3)' : stats.rate >= 90 ? 'var(--green)' : stats.rate >= 70 ? 'var(--accent)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', gap: 10, flexShrink: 0, fontSize: 11, color: 'var(--text2)', alignItems: 'center' }}>
      <span style={{ color: 'var(--text)' }}>{stats.total}</span>
      {stats.running > 0 && <span style={{ color: 'var(--cyan)' }}>{stats.running} run</span>}
      {stats.failed  > 0 && <span style={{ color: 'var(--red)' }}>{stats.failed} err</span>}
      {stats.rate !== null && <span style={{ color: rateColor, fontWeight: 700 }}>{stats.rate}%</span>}
    </div>
  )
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function RankRow({ rank, label, count, max, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 11, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <span style={{ color: 'var(--text3)', fontWeight: 700, flexShrink: 0 }}>#{rank}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>{count}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

function Empty() {
  return <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0' }}>Sin datos en el período</div>
}

const cardStyle  = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }
const cardTitle  = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }
const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11, padding: '6px 10px', outline: 'none' }
