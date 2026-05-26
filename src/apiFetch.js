const API_TOKEN = import.meta.env.VITE_API_TOKEN || ''

const originalFetch = window.fetch.bind(window)

function isInternalApi(input) {
  if (typeof input === 'string') return input.startsWith('/api/')
  if (input instanceof URL) return input.pathname.startsWith('/api/')
  if (input && typeof input.url === 'string') {
    try { return new URL(input.url, window.location.origin).pathname.startsWith('/api/') }
    catch { return false }
  }
  return false
}

window.fetch = function patchedFetch(input, init = {}) {
  if (!isInternalApi(input)) return originalFetch(input, init)
  const headers = new Headers(init.headers || (input && input.headers) || {})
  if (API_TOKEN && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`)
  }
  return originalFetch(input, { ...init, headers })
}
