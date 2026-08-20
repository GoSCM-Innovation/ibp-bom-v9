import { describe, it, expect, vi, afterEach } from 'vitest'

// _auth.js y _cors.js leen process.env en el top level, así que cada caso tiene
// que volver a importar el módulo después de fijar el entorno.
async function loadAuth(token) {
  vi.resetModules()
  if (token === undefined) vi.stubEnv('API_TOKEN', '')
  else vi.stubEnv('API_TOKEN', token)
  return (await import('../../api/_auth.js')).requireAuth
}

async function loadCors(allowedOrigins) {
  vi.resetModules()
  vi.stubEnv('ALLOWED_ORIGINS', allowedOrigins)
  return (await import('../../api/_cors.js')).applyCors
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status: vi.fn(code => { res.statusCode = code; return res }),
    json: vi.fn(obj => { res.body = obj; return res }),
    setHeader: vi.fn((k, v) => { res.headers[k] = v }),
    end: vi.fn(() => res),
  }
  return res
}

afterEach(() => { vi.unstubAllEnvs() })

describe('requireAuth', () => {
  const VALID = 'a'.repeat(32)

  it('responde 500 cuando API_TOKEN no está configurado', async () => {
    const requireAuth = await loadAuth(undefined)
    const res = mockRes()
    expect(requireAuth({ headers: {} }, res)).toBe(false)
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toMatch(/API_TOKEN/)
  })

  it('responde 500 cuando API_TOKEN tiene menos de 16 caracteres', async () => {
    const requireAuth = await loadAuth('corto')
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: 'Bearer corto' } }, res)).toBe(false)
    expect(res.statusCode).toBe(500)
  })

  it('acepta un token de exactamente 16 caracteres', async () => {
    const token = 'b'.repeat(16)
    const requireAuth = await loadAuth(token)
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: `Bearer ${token}` } }, res)).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('responde 401 cuando falta el header Authorization', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({ headers: {} }, res)).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('responde 401 cuando no hay headers en la request', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({}, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('responde 401 con un esquema distinto de Bearer', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: `Basic ${VALID}` } }, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  // El guard de longitud previo a timingSafeEqual: sin él, comparar buffers de
  // distinto tamaño lanzaría en vez de devolver 401.
  it('responde 401 con un token incorrecto de distinta longitud', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: 'Bearer x' } }, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('responde 401 con un token incorrecto de la misma longitud', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    const wrong = 'z'.repeat(32)
    expect(requireAuth({ headers: { authorization: `Bearer ${wrong}` } }, res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('acepta el token correcto', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: `Bearer ${VALID}` } }, res)).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('acepta el esquema Bearer sin distinguir mayúsculas', async () => {
    const requireAuth = await loadAuth(VALID)
    const res = mockRes()
    expect(requireAuth({ headers: { authorization: `bearer ${VALID}` } }, res)).toBe(true)
  })
})

describe('applyCors', () => {
  const ORIGINS = 'https://app.example.com,https://otro.example.com'

  it('refleja el origen cuando está en la allowlist', async () => {
    const applyCors = await loadCors(ORIGINS)
    const res = mockRes()
    applyCors({ method: 'GET', headers: { origin: 'https://app.example.com' } }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })

  it('no emite Allow-Origin para un origen que no está en la allowlist', async () => {
    const applyCors = await loadCors(ORIGINS)
    const res = mockRes()
    applyCors({ method: 'GET', headers: { origin: 'https://malicioso.example.com' } }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('no emite Allow-Origin cuando no viene el header Origin', async () => {
    const applyCors = await loadCors(ORIGINS)
    const res = mockRes()
    applyCors({ method: 'GET', headers: {} }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('ignora los espacios alrededor de las entradas de la allowlist', async () => {
    const applyCors = await loadCors(' https://app.example.com , https://otro.example.com ')
    const res = mockRes()
    applyCors({ method: 'GET', headers: { origin: 'https://otro.example.com' } }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://otro.example.com')
  })

  it('con ALLOWED_ORIGINS vacío no permite ningún origen', async () => {
    const applyCors = await loadCors('')
    const res = mockRes()
    applyCors({ method: 'GET', headers: { origin: 'https://app.example.com' } }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('emite siempre Vary, Allow-Methods y Allow-Headers', async () => {
    const applyCors = await loadCors(ORIGINS)
    const res = mockRes()
    applyCors({ method: 'GET', headers: {} }, res)
    expect(res.headers['Vary']).toBe('Origin')
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization')
  })

  it('usa los métodos por defecto y respeta los que se pasen', async () => {
    const applyCors = await loadCors(ORIGINS)
    const def = mockRes()
    applyCors({ method: 'GET', headers: {} }, def)
    expect(def.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS')

    const custom = mockRes()
    applyCors({ method: 'GET', headers: {} }, custom, 'POST,OPTIONS')
    expect(custom.headers['Access-Control-Allow-Methods']).toBe('POST,OPTIONS')
  })

  it('corta el preflight OPTIONS con 204 y devuelve true', async () => {
    const applyCors = await loadCors(ORIGINS)
    const res = mockRes()
    expect(applyCors({ method: 'OPTIONS', headers: { origin: 'https://app.example.com' } }, res)).toBe(true)
    expect(res.statusCode).toBe(204)
    expect(res.end).toHaveBeenCalled()
  })

  it('devuelve false en métodos que no son OPTIONS para que el handler siga', async () => {
    const applyCors = await loadCors(ORIGINS)
    expect(applyCors({ method: 'POST', headers: {} }, mockRes())).toBe(false)
  })
})
