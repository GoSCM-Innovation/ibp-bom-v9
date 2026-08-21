import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import TechLogs from '../TechLogs'
import { useTechLogs } from '../../hooks/useTechLogs'
import ProgressBar from '../ui/ProgressBar'
import PromotedBadge from '../ui/PromotedBadge'
import { usePromotedTasksContext, isTaskPromoted } from '../../hooks/usePromotedTasks'
import { getTzMode, setTzMode, toInputDate, inputDateToDate, formatEpochMs, formatSapTs, TZ_OPTIONS } from '../../utils/dateUtils'
import { soapCall } from '../../api/soapCall'
import { taskStatus } from '../../constants/status'
import { filterInputStyle as inputStyle } from '../../styles/forms'
import { toolbarBtn, disabled as btnDisabled } from '../../styles/buttons'

const REFRESH_MS = 30000
const PAGE_SIZE = 50
const ENRICH_CONCURRENCY = 6

// Estados terminales: su detalle (fin/duración) nunca cambia → se cachea permanente.
// Los no-terminales se re-consultan en cada refresh hasta que terminen.
const TERMINAL = new Set(['SUCCESS', 'SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E', 'ERROR', 'TERMINATED', 'TERMINATION_FAILED'])

/** Formatea una duración en segundos a algo legible: "4m 56s", "7h 6m", "12s". */
function formatDuration(sec) {
  if (sec == null || isNaN(sec) || sec <= 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${r}s`
  return `${r}s`
}

/** Copia texto al portapapeles. API moderna con fallback a execCommand. */
function copyText(text) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { return false }
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallback())
  }
  return Promise.resolve(fallback())
}

/** Ejecuta `worker` sobre `items` con un máximo de `limit` en paralelo. */
async function runPool(items, limit, worker) {
  let i = 0
  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx])
    }
  }))
}

const CANCELABLE = new Set(['RUNNING', 'QUEUEING', 'IMPORTED', 'FETCHED'])


export default function TaskMonitor({ connection, sessionId, onSessionExpired, initialSearch, onSearchConsumed }) {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [activeStatus, setActive] = useState('ALL')
  const [search, setSearch]       = useState('')
  const [lastRefresh, setLast]    = useState(null)
  const [selectedRow, setSelected]= useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelMsg, setCancelMsg]   = useState('')
  const [logsModal, setLogsModal]   = useState(null) // runId
  const [colWidths, setColWidths]   = useState({})
  const [page, setPage]             = useState(1)
  const [details, setDetails]       = useState({})  // runId → { end, durSec, done, error }
  const [enriching, setEnriching]   = useState(false) // cargando fin/duración de la página
  const [copyState, setCopyState]   = useState(null) // 'ok' | 'err' | null
  const detailsRef = useRef(details)
  detailsRef.current = details
  const resizing = useRef(null)
  const timerRef = useRef(null)
  const [logs, addLog] = useTechLogs()
  // Callbacks que se invocan desde efectos pero no deben condicionar cuando
  // corren: se leen por ref para que el componente no dependa de que el padre
  // los memoice. Si entraran en los arrays de dependencias, un padre que los
  // recree en cada render dispararia un bucle de llamadas a SAP.
  const addLogRef = useRef(addLog)
  addLogRef.current = addLog
  const onSessionExpiredRef = useRef(onSessionExpired)
  onSessionExpiredRef.current = onSessionExpired
  const onSearchConsumedRef = useRef(onSearchConsumed)
  onSearchConsumedRef.current = onSearchConsumed

  const promotedSet = usePromotedTasksContext()
  const [tzMode, setTzModeState] = useState(() => getTzMode())
  const [fromDate, setFromDate]  = useState(() => toInputDate(new Date(Date.now() - 7 * 86400000), getTzMode()))
  const [toDate,   setToDate]    = useState(() => toInputDate(new Date(), getTzMode()))

  function handleTzChange(newMode) {
    const from = inputDateToDate(fromDate, tzMode)
    const to   = inputDateToDate(toDate,   tzMode)
    setFromDate(toInputDate(from, newMode))
    setToDate(toInputDate(to,   newMode))
    setTzModeState(newMode)
    setTzMode(newMode)
  }

  useEffect(() => {
    if (initialSearch) { setSearch(initialSearch); onSearchConsumedRef.current?.() }
  }, [initialSearch])

  const MAX_DAYS = 90
  const rangeDays = fromDate && toDate
    ? Math.round((new Date(toDate) - new Date(fromDate)) / 86400000)
    : null
  const rangeExceeded = rangeDays !== null && rangeDays > MAX_DAYS

  function handleFromChange(val) {
    setFromDate(val)
    if (val && toDate) {
      const fromMs = inputDateToDate(val, tzMode).getTime()
      const toMs   = inputDateToDate(toDate, tzMode).getTime()
      if (Math.round((toMs - fromMs) / 86400000) > MAX_DAYS)
        setToDate(toInputDate(new Date(fromMs + MAX_DAYS * 86400000), tzMode))
    }
  }

  function handleToChange(val) {
    setToDate(val)
    if (val && fromDate) {
      const fromMs = inputDateToDate(fromDate, tzMode).getTime()
      const toMs   = inputDateToDate(val, tzMode).getTime()
      if (Math.round((toMs - fromMs) / 86400000) > MAX_DAYS)
        setFromDate(toInputDate(new Date(toMs - MAX_DAYS * 86400000), tzMode))
    }
  }

  const loadTasks = useCallback(async () => {
    if (rangeExceeded) { setError(`El rango no puede superar ${MAX_DAYS} días (SAP CI-DS limit)`); return }
    setLoading(true); setError('')
    const start = performance.now()
    try {
      const toDateObj = inputDateToDate(toDate, tzMode)
      if (toDateObj) toDateObj.setSeconds(59, 999)
      const data = await soapCall(connection, sessionId, 'getAllExecutedTasks2', {
        startDateFrom: inputDateToDate(fromDate, tzMode)?.toISOString(),
        startDateTo:   toDateObj?.toISOString(),
      })
      addLogRef.current({ method: 'POST', path: 'getAllExecutedTasks2', status: 200, duration: Math.round(performance.now() - start), detail: `${data.length} tasks` })
      setRows(Array.isArray(data) ? data : [])
      setLast(new Date())
    } catch (e) {
      if (e.isSessionExpired) { onSessionExpiredRef.current?.(); return }
      addLogRef.current({ method: 'POST', path: 'getAllExecutedTasks2', status: 0, duration: Math.round(performance.now() - start), detail: e.message })
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [connection, sessionId, fromDate, toDate, tzMode, rangeExceeded])

  useEffect(() => {
    loadTasks()
    timerRef.current = setInterval(loadTasks, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [loadTasks])

  async function handleCancel() {
    if (!selectedRow) return
    if (!window.confirm(`¿Cancelar la ejecución de "${selectedRow.taskName}"?\n\nRunID: ${selectedRow.runId}`)) return
    setCancelling(true); setCancelMsg('')
    const start = performance.now()
    try {
      const data = await soapCall(connection, sessionId, 'cancelTask', { runId: selectedRow.runId })
      addLog({ method: 'POST', path: 'cancelTask', status: 200, duration: Math.round(performance.now() - start), detail: data.status })
      setCancelMsg('ok')
      await loadTasks()
      setTimeout(() => { setSelected(null); setCancelMsg('') }, 2500)
    } catch (e) {
      addLog({ method: 'POST', path: 'cancelTask', status: 0, duration: Math.round(performance.now() - start), detail: e.message })
      setCancelMsg(e.message)
    } finally {
      setCancelling(false)
    }
  }

  // Copia la página actual como TSV (pegable en Excel). Patrón del Integration Explorer.
  function handleCopyPage() {
    if (paged.length === 0) return
    const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim()
    const header = ['Estado', 'Task', 'Inicio', 'Fin', 'Duración', 'RunID', 'JobID']
    const lines = paged.map(r => {
      const d = details[r.runId]
      const estado = taskStatus(r.statusCode).label
      const inicio = formatEpochMs(r.startDate, tzMode)
      const fin    = d ? (d.end ? formatSapTs(d.end, tzMode) : 'En curso') : ''
      const dur    = d ? formatDuration(d.durSec) : ''
      return [estado, r.taskName, inicio, fin, dur, r.runId, r.jobId].map(clean).join('\t')
    })
    const tsv = [header.join('\t'), ...lines].join('\n')
    copyText(tsv).then(ok => {
      setCopyState(ok ? 'ok' : 'err')
      setTimeout(() => setCopyState(null), 1500)
    })
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = parseInt(a.startDate) || 0, bv = parseInt(b.startDate) || 0
    return bv - av
  }), [rows])

  const filteredBase = useMemo(() => sorted.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (r.taskName || '').toLowerCase().includes(q) ||
           (r.statusCode || '').toLowerCase().includes(q) ||
           String(r.runId || '').includes(q)
  }), [sorted, search])

  const countByStatus = {}
  filteredBase.forEach(r => { countByStatus[r.statusCode] = (countByStatus[r.statusCode] || 0) + 1 })

  const filtered = useMemo(
    () => filteredBase.filter(r => activeStatus === 'ALL' || r.statusCode === activeStatus),
    [filteredBase, activeStatus])

  const presentStatuses = [...new Set(filteredBase.map(r => r.statusCode).filter(Boolean))]

  // ── Paginación (client-side, PAGE_SIZE filas) ──────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page])

  // Volver a página 1 cuando cambian los filtros / búsqueda / rango
  useEffect(() => { setPage(1) }, [search, activeStatus, fromDate, toDate])
  // Clampar si la página actual quedó fuera de rango
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages, page])

  // ── Enriquecimiento perezoso: fin + duración de la página visible ──────────
  const pageKey = paged.map(r => r.runId).join(',')
  useEffect(() => {
    if (!sessionId || paged.length === 0) return
    let cancelled = false
    const toFetch = paged.filter(r => {
      if (!r.runId) return false
      const cached = detailsRef.current[r.runId]
      // Re-consultar si no hay caché, o si el estado no es terminal (aún puede cambiar)
      return !cached?.done || !TERMINAL.has(r.statusCode)
    })
    if (toFetch.length === 0) return
    // Acumulamos todos los resultados y commiteamos UNA sola vez al final, para
    // que la columna Fin/Duración no aparezca "de a poco" (goteo). Mientras tanto
    // se muestra el estado de carga (ProgressBar + "…" en las celdas sin dato).
    setEnriching(true)
    const acc = {}
    runPool(toFetch, ENRICH_CONCURRENCY, async (row) => {
      if (cancelled) return
      try {
        const d = await soapCall(connection, sessionId, 'getTaskStatusByRunId2', { runId: row.runId })
        if (cancelled) return
        acc[row.runId] = {
          end:    (d.endTime || '').replace(/\D/g, '') || null,
          durSec: d.executionTime != null ? parseFloat(d.executionTime) : null,
          done:   true,
        }
      } catch (e) {
        if (cancelled) return
        if (e.isSessionExpired) { onSessionExpiredRef.current?.(); return }
        acc[row.runId] = { end: null, durSec: null, done: true, error: true }
      }
    }).then(() => {
      if (cancelled) return
      setDetails(prev => ({ ...prev, ...acc }))
      setEnriching(false)
    })
    return () => { cancelled = true; setEnriching(false) }
    // lastRefresh: al refrescar, re-consulta solo las no-terminales (las terminales
    // ya cacheadas las descarta el filtro `toFetch`).
    // pageKey es la forma estable de `paged`: la lista se rearma en cada render
    // aunque contenga los mismos runId, y depender de ella recargaria de mas.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pageKey reemplaza a paged a proposito
  }, [pageKey, connection, sessionId, lastRefresh])

  const COLS = useMemo(() => [
    { key: 'statusCode', label: 'Estado',    w: 200, render: v => <StatusBadge code={v} /> },
    { key: 'taskName',   label: 'Task',      w: 280, render: v => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v ?? '—'}</span>
        {isTaskPromoted(promotedSet, v) && <PromotedBadge fontSize={8} />}
      </span>
    ) },
    { key: 'startDate',  label: 'Inicio',    w: 180, render: v => formatEpochMs(v, tzMode) },
    { key: 'endDate',    label: 'Fin',       w: 180, render: (_v, row) => {
      const d = details[row.runId]
      if (!d) return <span style={{ opacity: .4 }}>…</span>
      if (d.end) return formatSapTs(d.end, tzMode)
      return <span style={{ opacity: .6, fontStyle: 'italic', color: 'var(--text2)' }}>En curso</span>
    } },
    { key: 'duration',   label: 'Duración',  w: 110, render: (_v, row) => {
      const d = details[row.runId]
      if (!d) return <span style={{ opacity: .4 }}>…</span>
      return formatDuration(d.durSec)
    } },
    { key: 'runId',      label: 'RunID',     w: 120 },
    { key: 'jobId',      label: 'JobID',     w: 150 },
  ].map(c => ({ ...c, w: colWidths[c.key] ?? c.w })), [colWidths, promotedSet, details, tzMode])

  function onResizeStart(col, e) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colWidths[col] ?? COLS.find(c => c.key === col)?.w ?? 140
    resizing.current = { col, startX, startW }
    function onMove(e) {
      if (!resizing.current) return
      const { col, startX, startW } = resizing.current
      setColWidths(w => ({ ...w, [col]: Math.max(60, startW + e.clientX - startX) }))
    }
    function onUp() {
      resizing.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isCancelable = selectedRow && CANCELABLE.has(selectedRow.statusCode)

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
      <ProgressBar loading={loading || cancelling || enriching} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Task Monitor</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            {loading ? 'Cargando…' : `${filtered.length} de ${rows.length} ejecuciones · pág ${page}/${totalPages}`}
            {enriching && !loading && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· cargando fin/duración…</span>}
            {lastRefresh && !loading && !enriching && <span style={{ marginLeft: 8, opacity: .6 }}>· {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Timezone selector */}
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
          <input type="datetime-local" value={fromDate} onChange={e => handleFromChange(e.target.value)} style={{ ...inputStyle, borderColor: rangeExceeded ? 'var(--red)' : undefined }} />
          <span style={{ color: 'var(--text2)', fontSize: 11 }}>→</span>
          <input type="datetime-local" value={toDate}   onChange={e => handleToChange(e.target.value)}   style={{ ...inputStyle, borderColor: rangeExceeded ? 'var(--red)' : undefined }} />
          {rangeDays !== null && (
            <span style={{ fontSize: 10, color: rangeExceeded ? 'var(--red)' : 'var(--text3)', fontWeight: rangeExceeded ? 700 : 400, whiteSpace: 'nowrap' }}>
              {rangeExceeded ? `⚠ máx ${MAX_DAYS}d` : `${rangeDays}d`}
            </span>
          )}
          <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 180 }} />
          <button onClick={handleCopyPage} disabled={paged.length === 0 || enriching}
            title={enriching ? 'Esperá a que termine de cargar la página' : 'Copiar la página actual (formato tabla, pegable en Excel)'}
            style={{
              background: copyState === 'ok' ? 'rgba(52,211,153,.15)' : copyState === 'err' ? 'rgba(255,107,107,.15)' : 'var(--bg2)',
              border: `1px solid ${copyState === 'ok' ? 'rgba(52,211,153,.4)' : copyState === 'err' ? 'rgba(255,107,107,.4)' : 'var(--border2)'}`,
              borderRadius: 6, color: copyState === 'ok' ? 'var(--green)' : copyState === 'err' ? 'var(--red)' : 'var(--text2)',
              fontSize: 11, fontWeight: 600, padding: '6px 12px', cursor: (paged.length === 0 || enriching) ? 'not-allowed' : 'pointer', opacity: enriching ? .5 : 1,
            }}>
            {copyState === 'ok' ? '✓ Copiado' : copyState === 'err' ? '✕ Error' : '⧉ Copiar'}
          </button>
          <button onClick={loadTasks} disabled={loading} style={toolbarBtn}>↺ Refresh</button>
          <span style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>🔄 Auto {REFRESH_MS / 1000}s</span>
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        <FilterBtn active={activeStatus === 'ALL'} onClick={() => setActive('ALL')} label="Todos" count={filteredBase.length} meta={{ bg: 'rgba(59,130,246,.1)', color: '#3b82f6', border: 'rgba(59,130,246,.3)' }} />
        {presentStatuses.map(s => (
          <FilterBtn key={s} active={activeStatus === s} onClick={() => setActive(s)}
            label={taskStatus(s).label} count={countByStatus[s] || 0} meta={taskStatus(s)} />
        ))}
      </div>

      {error && <div style={{ background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.3)', borderRadius: 8, padding: '12px 16px', color: 'var(--red)', fontSize: 12, marginBottom: 14 }}>✕ {error}</div>}

      {/* Table */}
      {!error && (
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 1 }}>
                {COLS.map(col => (
                  <th key={col.key} style={{ width: col.w, minWidth: col.w, padding: '9px 12px', textAlign: 'left', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', position: 'relative', userSelect: 'none' }}>
                    {col.label}
                    <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize' }} onMouseDown={e => onResizeStart(col.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={COLS.length} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text2)' }}>Cargando…</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={COLS.length} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text2)' }}>Sin resultados</td></tr>
              ) : paged.map((row, i) => {
                const isSel = selectedRow?.runId === row.runId
                return (
                  <tr key={row.runId || i} onClick={() => setSelected(isSel ? null : row)} style={{ background: isSel ? 'rgba(247,168,0,.08)' : i % 2 === 0 ? 'var(--bg)' : 'var(--bg2)', outline: isSel ? '1px solid rgba(247,168,0,.35)' : 'none', cursor: 'pointer' }}>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: '7px 12px', color: isSel ? '#fff' : 'var(--text)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: col.w, maxWidth: col.w }} title={String(row[col.key] ?? '')}>
                        {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!error && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, flexShrink: 0 }}>
          <PageBtn disabled={page === 1} onClick={() => setPage(1)}>« Primera</PageBtn>
          <PageBtn disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</PageBtn>
          <span style={{ fontSize: 11, color: 'var(--text2)', padding: '0 10px', whiteSpace: 'nowrap' }}>
            Página <b style={{ color: 'var(--text)' }}>{page}</b> de {totalPages}
          </span>
          <PageBtn disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente ›</PageBtn>
          <PageBtn disabled={page === totalPages} onClick={() => setPage(totalPages)}>Última »</PageBtn>
        </div>
      )}

      {/* Action bar */}
      {selectedRow && (
        <div style={{ marginTop: 12, padding: '12px 16px', flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>Ejecución seleccionada</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedRow.taskName}
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>RunID: {selectedRow.runId}</span>
            </div>
          </div>

          {cancelMsg === 'ok' && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✓ Cancelación enviada</span>}
          {cancelMsg && cancelMsg !== 'ok' && <span style={{ fontSize: 11, color: 'var(--red)', maxWidth: 280 }}>✕ {cancelMsg}</span>}

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setLogsModal(selectedRow.runId)} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid rgba(6,182,212,.4)', background: 'rgba(6,182,212,.1)', color: 'var(--cyan)', cursor: 'pointer' }}>
              📋 Ver logs
            </button>
            <button onClick={handleCancel} disabled={!isCancelable || cancelling}
              title={!isCancelable ? 'Solo se pueden cancelar tasks en ejecución/cola' : ''}
              style={{ padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,107,107,.4)', background: isCancelable ? 'rgba(255,107,107,.12)' : 'transparent', color: isCancelable ? 'var(--red)' : 'var(--text3)', cursor: isCancelable ? 'pointer' : 'not-allowed', opacity: cancelling ? .6 : 1 }}>
              {cancelling ? 'Cancelando…' : '✕ Cancelar'}
            </button>
            <button onClick={() => { setSelected(null); setCancelMsg('') }} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      <TechLogs logs={logs} />

      {logsModal && (
        <LogsModal
          runId={logsModal}
          connection={connection}
          sessionId={sessionId}
          onClose={() => setLogsModal(null)}
        />
      )}
    </div>
  )
}

function StatusBadge({ code }) {
  const m = taskStatus(code)
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function PageBtn({ disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...toolbarBtn, padding: '5px 11px', whiteSpace: 'nowrap',
      ...(disabled ? { ...btnDisabled, color: 'var(--text3)' } : {}),
    }}>{children}</button>
  )
}

function FilterBtn({ active, onClick, label, count, meta }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${active ? meta.border : 'var(--border)'}`, background: active ? meta.bg : 'transparent', color: active ? meta.color : 'var(--text2)', fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
      {label}
      <span style={{ background: active ? meta.border : 'var(--border)', color: active ? meta.color : 'var(--text2)', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{count}</span>
    </button>
  )
}

function LogsModal({ runId, connection, sessionId, onClose }) {
  const [activeLog, setActiveLog] = useState('monitorLog')
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/soap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection: { hciUrl: connection.hciUrl, orgName: connection.orgName, isProduction: connection.isProduction },
            sessionId, operation: 'getTaskLogs',
            params: { runId, traceLog: { getLog: true }, monitorLog: { getLog: true }, errorLog: { getLog: true } }
          }),
        })
        const d = await res.json()
        if (!res.ok || d.error) throw new Error(d.error || 'Error')
        setData(d)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [runId, connection, sessionId])

  const LOG_TABS = [
    { key: 'monitorLog', label: 'Monitor' },
    { key: 'traceLog',   label: 'Trace'   },
    { key: 'errorLog',   label: 'Error'   },
  ]

  const currentLog = data?.[activeLog]
  const lines = currentLog?.messageLines || []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, width: 'min(720px, 95vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.6)' }}>
        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Logs de ejecución</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>RunID: {runId}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Log type tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
          {LOG_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveLog(t.key)} style={{ padding: '8px 16px', fontSize: 12, background: 'none', border: 'none', borderBottom: activeLog === t.key ? '2px solid var(--accent)' : '2px solid transparent', color: activeLog === t.key ? 'var(--text)' : 'var(--text2)', fontWeight: activeLog === t.key ? 600 : 400, cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Log content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>Cargando logs…</div>
          ) : error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>✕ {error}</div>
          ) : lines.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>Sin contenido en este log</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 11, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {lines.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

