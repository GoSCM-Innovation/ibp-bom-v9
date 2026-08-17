const API_TOKEN = import.meta.env.VITE_API_TOKEN || ''

const originalFetch = window.fetch.bind(window)

// Solo las llamadas a /api/* del propio origen llevan el token. Se resuelven las
// tres formas de input contra el origin antes de comparar: mirar solo el pathname
// dejaba pasar una URL o un Request absolutos a otro host con path /api/, que se
// llevaban el Authorization puesto.
function isInternalApi(input) {
  const raw = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input && typeof input.url === 'string') ? input.url
    : null
  if (raw === null) return false
  try {
    const url = new URL(raw, window.location.origin)
    return url.origin === window.location.origin && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

window.fetch = function patchedFetch(input, init = {}) {
  if (!isInternalApi(input)) return originalFetch(input, init)
  const headers = new Headers(init.headers || (input && input.headers) || {})
  if (API_TOKEN && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`)
  }
  return originalFetch(input, { ...init, headers })
}
