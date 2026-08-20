import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  validateProxyUrl, validateService, validateEntityPath, extractSapError,
} from '../../api/ibp-proxy.js'

afterEach(() => { vi.unstubAllEnvs() })

describe('validateProxyUrl', () => {
  const OK = 'https://mi-tenant.ondemand.com/'

  it('acepta un host https con el sufijo permitido', () => {
    expect(validateProxyUrl(OK)).toBeNull()
  })

  it('rechaza una URL inválida', () => {
    expect(validateProxyUrl('no-es-url')).toBe('URL inválida')
  })

  it('rechaza cualquier esquema que no sea https', () => {
    expect(validateProxyUrl('http://mi-tenant.ondemand.com/')).toBe('Solo se permite HTTPS')
  })

  it('rechaza un host que no termina con el sufijo permitido', () => {
    expect(validateProxyUrl('https://evil.example.com/')).toBe('Host no permitido')
  })

  it.each([
    'https://localhost/',
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://169.254.169.254/',
    'https://172.16.0.1/',
    'https://172.31.0.1/',
    'https://192.168.1.1/',
  ])('rechaza %s por privado o loopback', (url) => {
    expect(validateProxyUrl(url)).toBe('Host no permitido')
  })

  it('acepta rangos vecinos que no son privados si cumplen el sufijo', () => {
    expect(validateProxyUrl('https://172-15.ondemand.com/')).toBeNull()
  })

  it('respeta ALLOWED_HOST_SUFFIX cuando está configurado', () => {
    vi.stubEnv('ALLOWED_HOST_SUFFIX', '.miempresa.net')
    expect(validateProxyUrl('https://tenant.miempresa.net/')).toBeNull()
    expect(validateProxyUrl(OK)).toBe('Host no permitido')
  })
})

describe('validateService', () => {
  it.each(['MASTER_DATA_API_SRV', 'PLANNING_DATA_API_SRV', 'BC_EXT_APPJOB_MANAGEMENT'])(
    'acepta el servicio permitido %s', (service) => {
      expect(validateService(service)).toBeNull()
    })

  it('acepta la variante con parámetros después del punto y coma', () => {
    expect(validateService('MASTER_DATA_API_SRV;v=2')).toBeNull()
  })

  it('rechaza un servicio que no está en la allowlist', () => {
    expect(validateService('OTRO_SRV')).toBe('Servicio no permitido')
  })

  it('rechaza un servicio vacío o ausente', () => {
    expect(validateService('')).toBe('Servicio no permitido')
    expect(validateService(undefined)).toBe('Servicio no permitido')
  })

  it('rechaza un intento de colar el servicio permitido como parámetro', () => {
    expect(validateService('EVIL_SRV;MASTER_DATA_API_SRV')).toBe('Servicio no permitido')
  })
})

describe('validateEntityPath', () => {
  it.each(['ProductHeader', 'A', 'Entidad_1', '$metadata'])('acepta %s', (path) => {
    expect(validateEntityPath(path)).toBeNull()
  })

  it('rechaza un path vacío', () => {
    expect(validateEntityPath('')).toBe('Path requerido')
    expect(validateEntityPath(undefined)).toBe('Path requerido')
  })

  it.each([
    '../secreto',
    'Producto/Sub',
    'con espacio',
    "Producto'",
    '1Empieza',
    'Producto?$filter=1',
    'Producto;drop',
  ])('rechaza %s', (path) => {
    expect(validateEntityPath(path)).toBe('Path de entidad inválido')
  })
})

describe('extractSapError', () => {
  it('devuelve string vacío sin entrada', () => {
    expect(extractSapError('')).toBe('')
    expect(extractSapError(null)).toBe('')
  })

  it('extrae code y message.value de un error OData V2', () => {
    const body = JSON.stringify({ error: { code: 'SY/530', message: { value: 'Entidad no existe' } } })
    expect(extractSapError(body)).toBe('SY/530: Entidad no existe')
  })

  it('acepta message como string plano', () => {
    const body = JSON.stringify({ error: { code: 'E1', message: 'texto simple' } })
    expect(extractSapError(body)).toBe('E1: texto simple')
  })

  it('omite las partes que faltan', () => {
    expect(extractSapError(JSON.stringify({ error: { message: { value: 'solo mensaje' } } })))
      .toBe('solo mensaje')
    expect(extractSapError(JSON.stringify({ error: { code: 'SOLO_CODE' } }))).toBe('SOLO_CODE')
  })

  it('devuelve string vacío para un JSON sin la forma esperada', () => {
    expect(extractSapError(JSON.stringify({ otra: 'cosa' }))).toBe('')
  })

  it('devuelve el texto crudo cuando no es JSON', () => {
    expect(extractSapError('<html>500 Internal Server Error</html>'))
      .toBe('<html>500 Internal Server Error</html>')
  })

  it('trunca a 400 caracteres tanto el texto plano como el mensaje parseado', () => {
    expect(extractSapError('x'.repeat(1000))).toHaveLength(400)
    const body = JSON.stringify({ error: { code: 'E', message: { value: 'y'.repeat(1000) } } })
    expect(extractSapError(body)).toHaveLength(400)
  })
})
