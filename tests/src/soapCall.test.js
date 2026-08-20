// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { soapCall, isSoapDebug } from '../../src/api/soapCall.js'

const CONN = {
  id: 'c1',
  name: 'Mi conexión',
  hciUrl: 'https://tenant.ondemand.com/soap',
  orgName: 'ORG',
  isProduction: false,
  user: 'usuario',
  password: 'secreto',
}

// Respuesta mínima con la superficie que consume soapCall.
function mockFetchResponse({ status = 200, body = '{}' } = {}) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  localStorage.clear()
  // Bajo Vitest import.meta.env.DEV es true, lo que activaría el modo debug en
  // todos los casos; se apaga salvo en los tests que lo prueban explícitamente.
  vi.stubEnv('DEV', false)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isSoapDebug', () => {
  it('es false con DEV apagado y sin la clave en localStorage', () => {
    expect(isSoapDebug()).toBe(false)
  })

  it('es true cuando import.meta.env.DEV está activo', () => {
    vi.stubEnv('DEV', true)
    expect(isSoapDebug()).toBe(true)
  })

  it('es true cuando localStorage.ibpSoapDebug vale "1"', () => {
    localStorage.setItem('ibpSoapDebug', '1')
    expect(isSoapDebug()).toBe(true)
  })

  it('es false con cualquier otro valor en localStorage', () => {
    localStorage.setItem('ibpSoapDebug', '0')
    expect(isSoapDebug()).toBe(false)
  })
})

describe('soapCall · request', () => {
  it('hace POST a /api/soap con Content-Type JSON', async () => {
    const fetchMock = mockFetchResponse({ body: '{"ok":true}' })
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'ping')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/soap')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  // Solo se envían los tres campos que el backend necesita: nunca las credenciales.
  it('reenvía solo hciUrl, orgName e isProduction de la conexión', async () => {
    const fetchMock = mockFetchResponse()
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'ping')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.connection).toEqual({
      hciUrl: 'https://tenant.ondemand.com/soap',
      orgName: 'ORG',
      isProduction: false,
    })
    expect(JSON.stringify(body)).not.toContain('secreto')
  })

  it('incluye sessionId, operation y params', async () => {
    const fetchMock = mockFetchResponse()
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'getTaskInfo', { taskGuid: 'G1' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      sessionId: 'SID', operation: 'getTaskInfo', params: { taskGuid: 'G1' },
    })
  })

  it('usa params vacío cuando no se pasan', async () => {
    const fetchMock = mockFetchResponse()
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'ping')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params).toEqual({})
  })

  it('no envía el flag _debug fuera del modo debug', async () => {
    const fetchMock = mockFetchResponse()
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'ping', { a: 1 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params).toEqual({ a: 1 })
  })
})

describe('soapCall · respuestas', () => {
  it('devuelve el JSON parseado en caso exitoso', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: '[{"name":"P1"}]' }))
    expect(await soapCall(CONN, 'SID', 'getProjects')).toEqual([{ name: 'P1' }])
  })

  it('marca la sesión expirada ante un 401', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ status: 401, body: '{"error":"SESSION_EXPIRED"}' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toMatchObject({
      message: 'Sesión SAP expirada',
      isSessionExpired: true,
    })
  })

  it('usa el campo error del cuerpo cuando la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ status: 500, body: '{"error":"SOAP error HTTP 500"}' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('SOAP error HTTP 500')
  })

  it('usa el texto crudo cuando la respuesta de error no es JSON', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ status: 502, body: '<html>Bad Gateway</html>' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('<html>Bad Gateway</html>')
  })

  it('trunca el texto crudo de error a 240 caracteres', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ status: 500, body: 'x'.repeat(1000) }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow(/^x{240}$/)
  })

  it('cae al código HTTP cuando el error viene sin cuerpo', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ status: 503, body: '' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('HTTP 503')
  })

  it('rechaza una respuesta 200 con cuerpo vacío', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: '' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('Respuesta inválida del servidor')
  })

  it('rechaza una respuesta 200 con cuerpo no-JSON', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: 'no soy json' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('no soy json')
  })

  it('lanza cuando un 200 trae el campo error', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: '{"error":"Task no encontrada"}' }))
    await expect(soapCall(CONN, 'SID', 'ping')).rejects.toThrow('Task no encontrada')
  })
})

describe('soapCall · modo debug', () => {
  beforeEach(() => {
    localStorage.setItem('ibpSoapDebug', '1')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('agrega _debug a los params', async () => {
    const fetchMock = mockFetchResponse({ body: '{"_result":[]}' })
    vi.stubGlobal('fetch', fetchMock)

    await soapCall(CONN, 'SID', 'ping', { a: 1 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params).toEqual({ a: 1, _debug: true })
  })

  it('desenvuelve _result para que la forma coincida con producción', async () => {
    const payload = JSON.stringify({
      _result: [{ name: 'P1' }],
      _operation: 'getProjects',
      _soapAction: 'function=getAllProjects',
      _rawXml: '<xml/>',
    })
    vi.stubGlobal('fetch', mockFetchResponse({ body: payload }))

    expect(await soapCall(CONN, 'SID', 'getProjects')).toEqual([{ name: 'P1' }])
    expect(console.log).toHaveBeenCalled()
  })

  it('devuelve el cuerpo tal cual si el backend no manda _result', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: '{"message":"pong"}' }))
    expect(await soapCall(CONN, 'SID', 'ping')).toEqual({ message: 'pong' })
  })

  it('desenvuelve también un _result nulo', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ body: '{"_result":null}' }))
    expect(await soapCall(CONN, 'SID', 'ping')).toBeNull()
  })
})
