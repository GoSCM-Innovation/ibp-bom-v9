import { hex, withAlpha } from '../styles/tokens'

// Fuente de verdad de los estados de ejecución que devuelve SAP CI-DS.
//
// Antes vivía triplicado: `STATUS_COLORS`/`STATUS_LABELS` en Resumen.jsx y en
// GlobalResumen.jsx (copias idénticas) y `STATUS_META` en TaskMonitor.jsx con
// sus propios rgba() escritos a mano. Esa tercera copia había derivado, ver
// las notas de conflicto más abajo.
//
// Ojo: NO es el mismo vocabulario que los estados de nodo del canvas de
// orquestación (`pending`/`running`/`skipped`/…, en canvasUtils.js). Aquellos
// describen el avance de un nodo dentro de una corrida propia; estos son los
// códigos que reporta SAP para una task. Comparten paleta, no dominio, así que
// siguen siendo dos mapas.
//
// - `label`: texto completo, para badges y filtros donde hay espacio.
// - `chartLabel`: versión corta, para la leyenda del donut.
// - `bg`/`border`: derivados de `color` con withAlpha, no escritos a mano.

function status(code, color, label, chartLabel) {
  return [code, { code, color, label, chartLabel: chartLabel || label, bg: withAlpha(color, 0.15), border: withAlpha(color, 0.3) }]
}

export const TASK_STATUS = Object.fromEntries([
  status('RUNNING',               hex.info, 'Running'),
  status('SUCCESS',               hex.green, 'Success'),
  status('SUCCESS_WITH_ERRORS_D', hex.warning, 'Success w/ errors D', 'Success w/err D'),
  status('SUCCESS_WITH_ERRORS_E', '#f97316', 'Success w/ errors E', 'Success w/err E'),
  status('ERROR',                 hex.red, 'Error'),
  status('QUEUEING',              hex.violet, 'Queueing'),
  status('IMPORTED',              '#06b6d4', 'Imported'),
  status('FETCHED',               '#22d3ee', 'Fetched'),
  status('TERMINATED',            '#9ca3af', 'Terminated'),
  status('TERMINATION_FAILED',    '#ef4444', 'Termination failed'),
  status('UNKNOWN',               '#6b7280', 'Unknown'),
])

export const UNKNOWN_STATUS = TASK_STATUS.UNKNOWN

// Nunca devuelve undefined: un código que SAP agregue mañana cae en UNKNOWN
// conservando su texto original, que es lo que hacían los `|| code` sueltos.
export function taskStatus(code) {
  return TASK_STATUS[code] || { ...UNKNOWN_STATUS, code, label: code || UNKNOWN_STATUS.label, chartLabel: code || UNKNOWN_STATUS.chartLabel }
}
