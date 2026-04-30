/**
 * dateUtils.js
 * Centraliza todo el manejo de fechas/horas.
 *
 * Regla de oro:
 *  - SAP IBP devuelve timestamps en UTC (confirmado).
 *  - Internamente siempre operamos en UTC.
 *  - El display puede ser UTC, UTC-4 o local según preferencia del usuario.
 *  - Los filtros datetime-local se interpretan en la zona elegida y se
 *    convierten a UTC antes de enviarse a SAP.
 */

// ─── Opciones de zona horaria disponibles ────────────────────────────────────
export const TZ_OPTIONS = [
  { value: 'utc',   label: 'UTC',   offsetH: 0  },
  { value: 'utc-4', label: 'UTC-4', offsetH: -4 },
  { value: 'local', label: 'Local', offsetH: null }, // offset dinámico del navegador
]

const TZ_KEY = 'ibp_tz_mode' // 'utc' | 'utc-4' | 'local'

export function getTzMode() {
  const stored = localStorage.getItem(TZ_KEY)
  return TZ_OPTIONS.some(o => o.value === stored) ? stored : 'utc'
}

export function setTzMode(mode) {
  localStorage.setItem(TZ_KEY, mode)
}

/** Offset en horas para un modo dado. Para 'local' usa el offset del navegador. */
export function getTzOffsetHours(mode) {
  const m = mode ?? getTzMode()
  if (m === 'local') return -new Date().getTimezoneOffset() / 60
  return TZ_OPTIONS.find(o => o.value === m)?.offsetH ?? 0
}

/** Etiqueta legible de la zona activa, ej. "UTC", "UTC-4", "UTC-3" */
export function getTzLabel(mode) {
  const m = mode ?? getTzMode()
  if (m === 'local') {
    const off = getTzOffsetHours('local')
    const sign = off >= 0 ? '+' : '-'
    const abs  = Math.abs(off)
    const h    = Math.floor(abs)
    const min  = Math.round((abs - h) * 60)
    return min === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(min).padStart(2, '0')}`
  }
  return TZ_OPTIONS.find(o => o.value === m)?.label ?? 'UTC'
}

// ─── Helper interno: partes de display ───────────────────────────────────────
function _parts(d, mode) {
  const resolvedMode = mode ?? getTzMode()
  if (resolvedMode === 'local') {
    return {
      day: d.getDate(),       month: d.getMonth() + 1, year: d.getFullYear(),
      hh:  d.getHours(),      mm: d.getMinutes(),      ss: d.getSeconds(),
    }
  }
  const offsetH = getTzOffsetHours(resolvedMode)
  const shifted = new Date(d.getTime() + offsetH * 3600000)
  return {
    day:   shifted.getUTCDate(),       month: shifted.getUTCMonth() + 1, year: shifted.getUTCFullYear(),
    hh:    shifted.getUTCHours(),      mm:    shifted.getUTCMinutes(),   ss:   shifted.getUTCSeconds(),
  }
}

// ─── Conversión de Date → formato SAP (siempre UTC) ──────────────────────────
export function toSapTs(date) {
  const p = n => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}` +
    `${p(date.getUTCMonth() + 1)}` +
    `${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}` +
    `${p(date.getUTCMinutes())}` +
    `${p(date.getUTCSeconds())}` +
    `.0000000`
  )
}

// ─── Parseo de timestamp SAP → Date (interpreta como UTC) ────────────────────
export function parseSapTs(ts) {
  if (!ts || ts.length < 8) return null
  return new Date(Date.UTC(
    parseInt(ts.slice(0, 4)),
    parseInt(ts.slice(4, 6)) - 1,
    parseInt(ts.slice(6, 8)),
    parseInt(ts.slice(8, 10)  || 0),
    parseInt(ts.slice(10, 12) || 0),
    parseInt(ts.slice(12, 14) || 0),
  ))
}

// ─── Formato para display de timestamp SAP ───────────────────────────────────
export function formatSapTs(ts, mode) {
  if (!ts || ts.length < 14) return '—'
  const d = parseSapTs(ts)
  if (!d) return '—'
  const { day, month, year, hh, mm, ss } = _parts(d, mode)
  const p = n => String(n).padStart(2, '0')
  return `${p(day)}/${p(month)}/${year} ${p(hh)}:${p(mm)}:${p(ss)}`
}

/** Versión corta sin segundos — para dashboards/charts */
export function formatSapTsShort(ts, mode) {
  if (!ts || ts.length < 12) return '—'
  const d = parseSapTs(ts)
  if (!d) return '—'
  const { day, month, year, hh, mm } = _parts(d, mode)
  const p = n => String(n).padStart(2, '0')
  return `${p(day)}/${p(month)}/${year} ${p(hh)}:${p(mm)}`
}

/** Etiqueta de día "DD/MM" para ejes de gráficos */
export function dayLabel(ts, mode) {
  const d = parseSapTs(ts)
  if (!d) return '?'
  const { day, month } = _parts(d, mode)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

// ─── Formato de epoch ms (usado en TaskMonitor / Resumen) ────────────────────
export function formatEpochMs(epochMs, mode) {
  if (!epochMs) return '—'
  const d = new Date(parseInt(epochMs))
  if (isNaN(d.getTime())) return '—'
  const { day, month, year, hh, mm, ss } = _parts(d, mode)
  const p = n => String(n).padStart(2, '0')
  return `${p(day)}/${p(month)}/${year} ${p(hh)}:${p(mm)}:${p(ss)}`
}

/** "DD/MM" de epoch ms para ejes de gráficos */
export function dayLabelEpoch(epochMs, mode) {
  if (!epochMs) return '?'
  const d = new Date(parseInt(epochMs))
  if (isNaN(d.getTime())) return '?'
  const { day, month } = _parts(d, mode)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

// ─── Conversión para inputs datetime-local ───────────────────────────────────
/**
 * Convierte un Date al string que espera <input type="datetime-local">.
 * El valor mostrado refleja la hora en la zona seleccionada.
 */
export function toInputDate(date, mode) {
  const resolvedMode = mode ?? getTzMode()
  const offsetH = getTzOffsetHours(resolvedMode)
  // Desplazar el Date por el offset para obtener la hora de esa zona
  const shifted = new Date(date.getTime() + offsetH * 3600000)
  return shifted.toISOString().slice(0, 16)
}

/**
 * Convierte el string de un datetime-local a un Date en UTC.
 * El input representa la hora en la zona seleccionada.
 */
export function inputDateToDate(value, mode) {
  if (!value) return null
  const resolvedMode = mode ?? getTzMode()
  const offsetH = getTzOffsetHours(resolvedMode)
  // Parsear como UTC, luego restar el offset para obtener el UTC real
  const asUtc = new Date(value + ':00.000Z')
  return new Date(asUtc.getTime() - offsetH * 3600000)
}
