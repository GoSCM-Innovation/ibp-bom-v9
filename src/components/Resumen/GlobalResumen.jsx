import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ProgressBar from '../ui/ProgressBar'
import ConnectionAvatar from '../Connections/ConnectionAvatar'
import { getTzMode, setTzMode, toInputDate, inputDateToDate, dayLabelEpoch, TZ_OPTIONS } from '../../utils/dateUtils'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { soapCall } from '../../api/soapCall'
import { taskStatus, TASK_STATUS } from '../../constants/status'
import { filterInputStyle as inputStyle } from '../../styles/forms'
import { toolbarBtn } from '../../styles/buttons'
import { alpha, color, hex, radius, withAlpha } from '../../styles/tokens'

const REFRESH_MS = 5 * 60 * 1000

function computeRate(success, warnings, total) {
  if (total <= 0) return null
  const ok = success + warnings
  if (ok === total) return 100
  if (ok === 0) return 0
  // Never round to 100 when there's at least one non-success row, never to 0 when there's at least one success
  const raw = (ok / total) * 100
  return Math.min(99, Math.max(1, Math.round(raw)))
}

function connMiniStats(rows) {
  const total    = rows.length
  const running  = rows.filter(r => r.statusCode === 'RUNNING').length
  const success  = rows.filter(r => r.statusCode === 'SUCCESS').length
  const failed   = rows.filter(r => ['ERROR', 'TERMINATION_FAILED'].includes(r.statusCode)).length
  const warnings = rows.filter(r => ['SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'].includes(r.statusCode)).length
  const rate     = computeRate(success, warnings, total)
  return { total, running, success, failed, warnings, rate }
}

function buildChartData(rows, tzMode) {
  const statusCount = {}
  rows.forEach(r => { statusCount[r.statusCode] = (statusCount[r.statusCode] || 0) + 1 })
  const donutData = Object.entries(statusCount)
    .map(([code, count]) => ({ name: taskStatus(code).chartLabel, value: count, code }))
    .sort((a, b) => b.value - a.value)

  const dayMap = {}
  rows.forEach(r => {
    const d = dayLabelEpoch(r.startDate, tzMode)
    if (!dayMap[d]) dayMap[d] = { day: d, Exitosas: 0, Fallidas: 0, Otras: 0 }
    if (r.statusCode === 'SUCCESS') dayMap[d].Exitosas++
    else if (r.statusCode === 'ERROR' || r.statusCode === 'TERMINATION_FAILED') dayMap[d].Fallidas++
    else dayMap[d].Otras++
  })
  const barData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)).slice(-14)

  return { donutData, barData }
}

export default function GlobalResumen({ connections, onOpenConnection }) {
  const [connData, setConnData]         = useState({})
  const [tzMode, setTzModeState]        = useState(() => getTzMode())
  const [fromDate, setFromDate]         = useState(() => toInputDate(new Date(Date.now() - 7 * 86400000), getTzMode()))
  const [toDate,   setToDate]           = useState(() => toInputDate(new Date(), getTzMode()))
  const [loadingAll, setLoadingAll]     = useState(false)
  const [lastRefresh, setLastRefresh]   = useState(null)
  const [activeChartIdx, setActiveChartIdx] = useState(0)
  const [selectedIds, setSelectedIds]   = useState(() => new Set())
  const timerRef = useRef(null)
  const connectionsRef = useRef(connections)
  useEffect(() => { connectionsRef.current = connections }, [connections])

  // Stable key: only changes when the set of connection IDs changes (not when reordering or editing metadata)
  const connIdsKey = useMemo(
    () => [...connections.map(c => c.id)].sort().join('|'),
    [connections]
  )

  // Prune stale connData entries for connections that were deleted
  useEffect(() => {
    setConnData(prev => {
      const validIds = new Set(connections.map(c => c.id))
      const next = {}
      let changed = false
      for (const [id, v] of Object.entries(prev)) {
        if (validIds.has(id)) next[id] = v
        else changed = true
      }
      return changed ? next : prev
    })
  }, [connIdsKey, connections])

  // Empty set = no filter (everything visible). Non-empty = filter to those.
  const isFiltered = selectedIds.size > 0
  const isInFilter = id => !isFiltered || selectedIds.has(id)
  const visibleConns = connections.filter(c => isInFilter(c.id))

  function toggleConnFilter(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setActiveChartIdx(0) // reset chart slide when filter changes
  }

  function clearConnFilter() {
    setSelectedIds(new Set())
    setActiveChartIdx(0)
  }

  function handleTzChange(newMode) {
    const from = inputDateToDate(fromDate, tzMode)
    const to   = inputDateToDate(toDate,   tzMode)
    setFromDate(toInputDate(from, newMode))
    setToDate(toInputDate(to,   newMode))
    setTzModeState(newMode)
    setTzMode(newMode)
  }

  const loadAll = useCallback(async () => {
    const conns = connectionsRef.current
    if (conns.length === 0) {
      setLoadingAll(false)
      setLastRefresh(new Date())
      return
    }
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
        // Expired tokens stay in sessionStorage and waste a request on every refresh.
        // Drop them so the next tick recognizes the conn as "no-session" immediately.
        if (e.isSessionExpired) sessionStorage.removeItem(`sap_${conn.id}`)
        const status = e.isSessionExpired ? 'session-expired' : 'error'
        setConnData(prev => ({ ...prev, [conn.id]: { status, rows: [], agents: [], error: e.isSessionExpired ? null : e.message } }))
      }
    }

    await Promise.allSettled(conns.map(loadOne))
    setLoadingAll(false)
    setLastRefresh(new Date())
    // connIdsKey no se usa en el cuerpo (las conexiones se leen de
    // connectionsRef), pero es lo que hace que loadAll se recree cuando cambia
    // el conjunto de conexiones. Depender del array `connections` recargaria
    // cada vez que el padre lo rearma con el mismo contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connIdsKey es el disparador deliberado
  }, [connIdsKey, fromDate, toDate, tzMode])

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

  // Aggregates — computed from connections with status 'ok' only, respecting the filter
  const okConns = visibleConns.filter(c => connData[c.id]?.status === 'ok')
  const allRows  = okConns.flatMap(c => connData[c.id].rows)

  const total         = allRows.length
  const running       = allRows.filter(r => r.statusCode === 'RUNNING').length
  const queued        = allRows.filter(r => ['QUEUEING', 'IMPORTED', 'FETCHED'].includes(r.statusCode)).length
  const success       = allRows.filter(r => r.statusCode === 'SUCCESS').length
  const failed        = allRows.filter(r => ['ERROR', 'TERMINATION_FAILED'].includes(r.statusCode)).length
  const warningsCount = allRows.filter(r => ['SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'].includes(r.statusCode)).length
  const successRate   = computeRate(success, warningsCount, total) ?? 0
  const rateColor     = total === 0 ? 'var(--text2)' : successRate >= 90 ? 'var(--green)' : successRate >= 70 ? 'var(--accent)' : 'var(--red)'

  // Chart slide: 0 = global, 1..N = okConns index
  const safeIdx   = Math.min(activeChartIdx, okConns.length)
  const chartRows = safeIdx === 0 ? allRows : (connData[okConns[safeIdx - 1]?.id]?.rows || [])
  const { donutData, barData } = buildChartData(chartRows, tzMode)

  // Stats (always global) — key by (connId, taskName) so the same task on prod+sandbox is shown as two rows
  const taskMap = {}
  okConns.forEach(c => {
    connData[c.id].rows.forEach(r => {
      const taskName = r.taskName || '—'
      const k = `${c.id}|${taskName}`
      if (!taskMap[k]) taskMap[k] = { taskName, conn: c, count: 0 }
      taskMap[k].count++
    })
  })
  const topTasks = Object.values(taskMap).sort((a, b) => b.count - a.count).slice(0, 5)

  const recentFailed = okConns
    .flatMap(c => connData[c.id].rows
      .filter(r => r.statusCode === 'ERROR' || r.statusCode === 'TERMINATION_FAILED')
      .map(r => ({ ...r, _connName: c.name, _isProduction: c.isProduction }))
    )
    .sort((a, b) => (parseInt(b.startDate) || 0) - (parseInt(a.startDate) || 0))
    .slice(0, 5)

  // Validation breakdown across the visible set
  const counts = { ok: 0, loading: 0, noSession: 0, expired: 0, error: 0, idle: 0 }
  visibleConns.forEach(c => {
    const s = connData[c.id]?.status
    if      (s === 'ok')              counts.ok++
    else if (s === 'loading')         counts.loading++
    else if (s === 'no-session')      counts.noSession++
    else if (s === 'session-expired') counts.expired++
    else if (s === 'error')           counts.error++
    else                              counts.idle++
  })
  const needLogin    = counts.noSession + counts.expired + counts.idle
  const hasErrors    = counts.error > 0
  const allNoSession = !loadingAll && visibleConns.length > 0 && (counts.ok + counts.loading) === 0

  return (
    <div style={{ padding: 28, overflowY: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
      <ProgressBar loading={loadingAll} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: color.white }}>Resumen Global</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            {isFiltered
              ? <>{selectedIds.size} de {connections.length} conexión(es) · <strong style={{ color: 'var(--accent)' }}>filtro activo</strong> · {total} ejecuciones</>
              : <>{connections.length} conexión(es) · {total} ejecuciones totales</>
            }
            {lastRefresh && !loadingAll && <span style={{ marginLeft: 8, opacity: .6 }}>· {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
            {TZ_OPTIONS.filter(o => o.value !== 'local').map(opt => (
              <button key={opt.value} onClick={() => handleTzChange(opt.value)} style={{
                padding: '4px 8px', fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tzMode === opt.value ? 'var(--accent)' : 'var(--bg3)',
                color:      tzMode === opt.value ? color.onAccent          : 'var(--text2)',
                transition: 'background .15s',
              }}>{opt.label}</button>
            ))}
          </div>
          <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          <span style={{ color: 'var(--text2)', fontSize: 11 }}>→</span>
          <input type="datetime-local" value={toDate}   onChange={e => setToDate(e.target.value)}   style={inputStyle} />
          <button onClick={loadAll} disabled={loadingAll} style={toolbarBtn}>↺ Refresh</button>
          <span style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>Auto-refresh 5 min</span>
        </div>
      </div>

      {/* Client filter bar — only when there's more than one connection */}
      {connections.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          marginBottom: 16, padding: '10px 14px',
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>
            Filtrar por cliente
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {connections.map(conn => {
              const active = isInFilter(conn.id)
              return (
                <button
                  key={conn.id}
                  onClick={() => toggleConnFilter(conn.id)}
                  title={active ? `Quitar ${conn.name} del filtro` : `Agregar ${conn.name} al filtro`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: radius.pill,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', flexShrink: 0,
                    background: active ? 'var(--accent)' : 'var(--bg3)',
                    color:      active ? color.onAccent          : 'var(--text2)',
                    fontSize: 11, fontWeight: active ? 700 : 500,
                    whiteSpace: 'nowrap',
                    transition: 'background .15s, color .15s, border-color .15s',
                  }}
                >
                  <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={16} />
                  {conn.name}
                  <EnvBadge isProduction={conn.isProduction} inverted={active} />
                </button>
              )
            })}
          </div>
          {isFiltered && (
            <button
              onClick={clearConnFilter}
              style={{
                background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
                color: 'var(--text2)', fontSize: 11, fontWeight: 600,
                padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
              }}
            >
              Limpiar ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Validation banner — shows refresh result for the visible set */}
      {visibleConns.length > 0 && !loadingAll && lastRefresh && (counts.ok < visibleConns.length) && (
        <div style={{
          background: allNoSession ? alpha.accent(.08) : alpha.white(.03),
          border: `1px solid ${allNoSession ? alpha.accent(.25) : 'var(--border)'}`,
          borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text)' }}>
            Refresh: <strong style={{ color: 'var(--green)' }}>{counts.ok} OK</strong>
            {needLogin > 0   && <> · <strong style={{ color: 'var(--accent)' }}>{needLogin} requieren login</strong></>}
            {hasErrors       && <> · <strong style={{ color: 'var(--red)' }}>{counts.error} con error</strong></>}
          </span>
          {allNoSession && (
            <span style={{ color: 'var(--text2)' }}>
              · Abre cada conexión para iniciar sesión SAP
            </span>
          )}
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
        <div style={cardTitle}>
          Estado por conexión
          {isFiltered && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent)', textTransform: 'none', letterSpacing: 0 }}>· filtrado</span>}
        </div>
        {visibleConns.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>Sin conexiones en el filtro</div>
        ) : visibleConns.map((conn, i) => {
          const state = connData[conn.id] || { status: 'idle', rows: [], agents: [], error: null }
          const stats = state.status === 'ok' ? connMiniStats(state.rows) : null
          const needsLogin = state.status === 'no-session' || state.status === 'session-expired' || state.status === 'idle'
          return (
            <div key={conn.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < visibleConns.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{conn.isProduction ? 'Producción' : 'Sandbox'}</span>
                  <EnvBadge isProduction={conn.isProduction} />
                </div>
              </div>
              <StatusBadge status={state.status} error={state.error} />
              {stats && <MiniStats stats={stats} />}
              {needsLogin && onOpenConnection && (
                <button
                  onClick={() => onOpenConnection(conn.id)}
                  title="Abrir conexión para iniciar sesión SAP"
                  style={{
                    background: alpha.accent(.12), border: `1px solid ${alpha.accent(.35)}`,
                    borderRadius: 6, color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                    padding: '4px 8px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                  }}
                >
                  Iniciar sesión
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Charts — only when there's aggregated data */}
      {allRows.length > 0 && (
        <div style={{ marginBottom: 24 }}>

          {/* Slide navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => setActiveChartIdx(p => Math.max(0, p - 1))}
              disabled={safeIdx === 0}
              style={arrowBtnStyle(safeIdx === 0)}
            >‹</button>

            <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
              {/* Global pill */}
              <ChartPill
                active={safeIdx === 0}
                onClick={() => setActiveChartIdx(0)}
                label="Global"
                count={allRows.length}
              />
              {/* Per-connection pills — only connections with data */}
              {okConns.map((conn, i) => (
                <ChartPill
                  key={conn.id}
                  active={safeIdx === i + 1}
                  onClick={() => setActiveChartIdx(i + 1)}
                  label={conn.name}
                  count={connData[conn.id].rows.length}
                  conn={conn}
                />
              ))}
            </div>

            <button
              onClick={() => setActiveChartIdx(p => Math.min(okConns.length, p + 1))}
              disabled={safeIdx === okConns.length}
              style={arrowBtnStyle(safeIdx === okConns.length)}
            >›</button>
          </div>

          {/* Chart context label */}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {safeIdx === 0 ? (
              <span>Todas las conexiones · <strong style={{ color: 'var(--text)' }}>{allRows.length}</strong> ejecuciones</span>
            ) : (
              <>
                <ConnectionAvatar name={okConns[safeIdx - 1].name} logoUrl={okConns[safeIdx - 1].logoUrl} size={16} />
                <span>{okConns[safeIdx - 1].name} · <strong style={{ color: 'var(--text)' }}>{chartRows.length}</strong> ejecuciones</span>
                <span style={{ color: 'var(--text3)' }}>· {okConns[safeIdx - 1].isProduction ? 'Producción' : 'Sandbox'}</span>
              </>
            )}
            <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 10 }}>{safeIdx + 1} / {okConns.length + 1}</span>
          </div>

          {/* Charts grid — key forces recharts entry animation on each slide switch */}
          <div className="grid-charts" key={safeIdx}>
            <div style={cardStyle}>
              <div style={cardTitle}>Distribución por estado</div>
              {donutData.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {donutData.map((entry, i) => <Cell key={i} fill={taskStatus(entry.code).color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text2)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: taskStatus(d.code).color, flexShrink: 0 }} />
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
                    <Bar dataKey="Exitosas" stackId="a" fill={TASK_STATUS.SUCCESS.color} />
                    <Bar dataKey="Fallidas" stackId="a" fill={TASK_STATUS.ERROR.color} />
                    <Bar dataKey="Otras"    stackId="a" fill={TASK_STATUS.UNKNOWN.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats grid — global, only when there's data */}
      {allRows.length > 0 && (
        <div className="grid-stats">
          <div style={cardStyle}>
            <div style={cardTitle}>Top tasks ejecutadas</div>
            {topTasks.length === 0 ? <Empty /> : topTasks.map((t, i) => (
              <RankRow
                key={`${t.conn.id}|${t.taskName}`}
                rank={i + 1}
                label={t.taskName}
                count={t.count}
                max={topTasks[0].count}
                color="var(--cyan)"
                conn={t.conn}
              />
            ))}
          </div>

          <div style={cardStyle}>
            <div style={cardTitle}>Últimas fallidas</div>
            {recentFailed.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 8 }}>✓ Sin fallos en el período</div>
              : recentFailed.map((r, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < recentFailed.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.taskName || '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{r._connName}</span>
                    <EnvBadge isProduction={r._isProduction} />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function ChartPill({ active, onClick, label, count, conn }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 12px', borderRadius: radius.pill, border: active ? 'none' : '1px solid var(--border)',
      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', transition: 'background .15s, color .15s',
      background: active ? 'var(--accent)' : 'var(--bg3)',
      color:      active ? color.onAccent          : 'var(--text2)',
      fontSize: 11, fontWeight: active ? 700 : 400,
    }}>
      {conn && <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={16} />}
      {label}
      {conn && <EnvBadge isProduction={conn.isProduction} inverted={active} />}
      <span style={{ opacity: .65, fontSize: 10 }}>{count}</span>
    </button>
  )
}

function EnvBadge({ isProduction, inverted = false }) {
  const prod = !!isProduction
  const bg   = prod ? alpha.green(.18) : alpha.accent(.18)
  const fg   = prod ? hex.green : hex.accent
  // When sitting on an accent (yellow) background, swap to a darker readable style
  const style = inverted
    ? { background: alpha.black(.18), color: color.onAccent, border: `1px solid ${alpha.black(.25)}` }
    : { background: bg, color: fg, border: `1px solid ${withAlpha(fg, .2)}` }
  return (
    <span style={{
      ...style,
      fontSize: 9, fontWeight: 700, letterSpacing: '.04em',
      padding: '1px 4px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0,
    }}>
      {prod ? 'PROD' : 'SAND'}
    </span>
  )
}

function arrowBtnStyle(disabled) {
  return {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 6, color: disabled ? 'var(--text3)' : 'var(--text)',
    fontSize: 20, fontWeight: 700, padding: '2px 10px', cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0, lineHeight: 1.4, opacity: disabled ? .35 : 1, transition: 'opacity .15s',
  }
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
    <div title={error || undefined} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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

function RankRow({ rank, label, count, max, color, conn }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ color: 'var(--text3)', fontWeight: 700, flexShrink: 0 }}>#{rank}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{count}</span>
      </div>
      {conn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontSize: 10, color: 'var(--text3)' }}>
          <ConnectionAvatar name={conn.name} logoUrl={conn.logoUrl} size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</span>
          <EnvBadge isProduction={conn.isProduction} />
        </div>
      )}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

function Empty() {
  return <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0' }}>Sin datos en el período</div>
}

const cardStyle  = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 16px' }
const cardTitle  = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }
