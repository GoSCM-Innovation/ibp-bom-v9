// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TOKEN = 'token-de-prueba'

// apiFetch.js lee VITE_API_TOKEN y captura window.fetch en el top level, así que
// hay que reinstalar el fetch base y reimportar el módulo en cada caso.
async function installInterceptor(token = TOKEN) {
  const base = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  window.fetch = base
  vi.resetModules()
  vi.stubEnv('VITE_API_TOKEN', token)
  await import('../../src/apiFetch.js')
  return base
}

const authOf = base => base.mock.calls[0][1].headers.get('Authorization')

beforeEach(() => { vi.unstubAllEnvs() })
afterEach(() => { vi.unstubAllEnvs() })

describe('interceptor de fetch', () => {
  it('reemplaza window.fetch', async () => {
    const base = await installInterceptor()
    expect(window.fetch).not.toBe(base)
  })

  it('inyecta el Bearer en rutas /api/ pasadas como string', async () => {
    const base = await installInterceptor()
    await window.fetch('/api/soap', { method: 'POST' })
    expect(authOf(base)).toBe(`Bearer ${TOKEN}`)
  })

  it('acepta una instancia de URL', async () => {
    const base = await installInterceptor()
    await window.fetch(new URL('/api/orchestrations', window.location.origin))
    expect(authOf(base)).toBe(`Bearer ${TOKEN}`)
  })

  it('acepta una instancia de Request', async () => {
    const base = await installInterceptor()
    await window.fetch(new Request(`${window.location.origin}/api/soap`, { method: 'POST' }))
    expect(authOf(base)).toBe(`Bearer ${TOKEN}`)
  })

  it('conserva el resto de las opciones de init', async () => {
    const base = await installInterceptor()
    await window.fetch('/api/soap', { method: 'POST', body: '{"a":1}' })
    const [, init] = base.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
  })

  it('conserva los headers previos y agrega el Authorization', async () => {
    const base = await installInterceptor()
    await window.fetch('/api/soap', { headers: { 'Content-Type': 'application/json' } })
    const headers = base.mock.calls[0][1].headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('no pisa un Authorization ya presente', async () => {
    const base = await installInterceptor()
    await window.fetch('/api/soap', { headers: { Authorization: 'Bearer propio' } })
    expect(authOf(base)).toBe('Bearer propio')
  })

  it('devuelve la respuesta del fetch original', async () => {
    await installInterceptor()
    await expect(window.fetch('/api/soap')).resolves.toMatchObject({ ok: true, status: 200 })
  })
})

describe('rutas que no se interceptan', () => {
  it.each([
    'https://externo.example.com/data',
    '/otra-ruta',
    '/apixyz/soap',
  ])('deja pasar %s sin tocar el init', async (input) => {
    const base = await installInterceptor()
    await window.fetch(input, { method: 'GET' })
    expect(base).toHaveBeenCalledWith(input, { method: 'GET' })
  })

  // Las rutas relativas se resuelven como lo haría el navegador: desde la raíz,
  // "api/soap" es la API interna; desde una subruta, no.
  it('resuelve las rutas relativas contra la URL de la página', async () => {
    const base = await installInterceptor()
    await window.fetch('api/soap')
    expect(authOf(base)).toBe(`Bearer ${TOKEN}`)
  })

  // El token no debe viajar a otro host solo porque el path empiece con /api/.
  it.each([
    ['string',  () => 'https://externo.example.com/api/soap'],
    ['URL',     () => new URL('https://externo.example.com/api/soap')],
    ['Request', () => new Request('https://externo.example.com/api/soap')],
  ])('no inyecta el token en una %s absoluta a otro host', async (_label, make) => {
    const base = await installInterceptor()
    await window.fetch(make(), {})
    expect(base.mock.calls[0][1].headers).toBeUndefined()
  })

  it('sí inyecta el token en una URL absoluta del propio origen', async () => {
    const base = await installInterceptor()
    await window.fetch(new URL('/api/soap', window.location.origin))
    expect(authOf(base)).toBe(`Bearer ${TOKEN}`)
  })

  it('no agrega el header cuando VITE_API_TOKEN está vacío', async () => {
    const base = await installInterceptor('')
    await window.fetch('/api/soap')
    expect(base.mock.calls[0][1].headers.has('Authorization')).toBe(false)
  })
})
