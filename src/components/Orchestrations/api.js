// Cliente de los dos endpoints de orquestacion.
//
// Antes cada operacion repetia el mismo bloque dentro del hook: fetch con
// headers, res.json(), y un `if (!res.ok) throw`. Eran seis copias, y la de
// importacion masiva ademas difería: usaba `data.error || HTTP ${status}`
// mientras las otras solo `data.error`, que deja el mensaje en undefined si el
// backend responde un error sin cuerpo. Acá se unifica en la forma completa.
//
// El token de auth no se pone acá: lo inyecta el interceptor de src/apiFetch.js
// en toda llamada a /api/* del mismo origen.

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// ── /api/orchestrations ─────────────────────────────────────────────────────

// Falla antes de parsear el cuerpo: el listado no devuelve `error` en el body,
// asi que el status es toda la informacion que hay.
export async function listOrchestrations(connectionId) {
  const res = await fetch(`/api/orchestrations?connectionId=${connectionId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function createOrchestration(payload) {
  return send('/api/orchestrations', 'POST', payload)
}

export function duplicateOrchestration(id) {
  return send('/api/orchestrations', 'POST', { action: 'duplicate', id })
}

export function updateOrchestration(payload) {
  return send('/api/orchestrations', 'PUT', payload)
}

export function deleteOrchestration(id) {
  return send('/api/orchestrations', 'DELETE', { id })
}

// ── /api/orchestrate ────────────────────────────────────────────────────────

export function fetchRun(orchestrationId) {
  return fetch(`/api/orchestrate?orchestrationId=${orchestrationId}`).then(r => r.json())
}

export function tickRun(orchestrationId) {
  return fetch(`/api/orchestrate?orchestrationId=${orchestrationId}&action=tick`).then(r => r.json())
}

// Un 401 acá significa sesion SAP expirada, no falta de auth de la API, y el
// llamador tiene que poder distinguirlo para pedir un login nuevo en vez de
// mostrar un error. Por eso se marca en vez de lanzar un Error generico.
export async function startRun(body) {
  const res = await fetch('/api/orchestrate', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
  const data = await res.json()
  if (res.status === 401) return { sessionExpired: true }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return { run: data }
}

export function cancelRun(orchestrationId) {
  return send('/api/orchestrate', 'DELETE', { orchestrationId })
}
