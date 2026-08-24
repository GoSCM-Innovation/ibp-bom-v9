import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listOrchestrations, createOrchestration, duplicateOrchestration,
  updateOrchestration, deleteOrchestration,
  fetchRun, tickRun, startRun, cancelRun,
} from '../../src/components/Orchestrations/api.js'

let last

function respond(body, status = 200) {
  vi.stubGlobal('fetch', vi.fn((url, init = {}) => {
    last = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, headers: init.headers }
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  }))
}

beforeEach(() => { last = undefined })
afterEach(() => { vi.unstubAllGlobals() })

describe('/api/orchestrations', () => {
  it('listar pasa el connectionId en la query', async () => {
    respond([{ id: 'o1' }])
    await expect(listOrchestrations('c1')).resolves.toEqual([{ id: 'o1' }])
    expect(last.url).toBe('/api/orchestrations?connectionId=c1')
    expect(last.method).toBe('GET')
  })

  it('listar falla con el status, sin mirar el cuerpo', async () => {
    // El listado no devuelve `error` en el body: el status es toda la
    // informacion disponible, y parsear un 500 sin JSON romperia.
    respond(null, 500)
    await expect(listOrchestrations('c1')).rejects.toThrow('HTTP 500')
  })

  it('crear manda POST con el cuerpo tal cual', async () => {
    respond({ id: 'o9' })
    await createOrchestration({ connectionId: 'c1', name: 'X' })
    expect(last.method).toBe('POST')
    expect(last.body).toEqual({ connectionId: 'c1', name: 'X' })
    expect(last.headers['Content-Type']).toBe('application/json')
  })

  it('duplicar arma el cuerpo con action duplicate', async () => {
    respond({ id: 'o1-copia' })
    await duplicateOrchestration('o1')
    expect(last.body).toEqual({ action: 'duplicate', id: 'o1' })
  })

  it('actualizar es PUT y borrar es DELETE con el id', async () => {
    respond({})
    await updateOrchestration({ id: 'o1', name: 'N' })
    expect(last.method).toBe('PUT')
    respond({})
    await deleteOrchestration('o1')
    expect(last.method).toBe('DELETE')
    expect(last.body).toEqual({ id: 'o1' })
  })

  it('un error del backend viaja en el mensaje', async () => {
    respond({ error: 'nombre duplicado' }, 400)
    await expect(createOrchestration({})).rejects.toThrow('nombre duplicado')
  })

  it('un error sin cuerpo cae al status en vez de dejar el mensaje vacio', async () => {
    // Antes cada sitio hacia `throw new Error(data.error)` a secas, asi que un
    // 500 sin campo error producia un Error con mensaje undefined.
    respond({}, 500)
    await expect(createOrchestration({})).rejects.toThrow('HTTP 500')
  })
})

describe('/api/orchestrate', () => {
  it('fetchRun y tickRun se distinguen por action=tick', async () => {
    respond({ status: 'running' })
    await fetchRun('o1')
    expect(last.url).toBe('/api/orchestrate?orchestrationId=o1')
    respond({ status: 'running' })
    await tickRun('o1')
    expect(last.url).toBe('/api/orchestrate?orchestrationId=o1&action=tick')
  })

  it('start devuelve la corrida envuelta', async () => {
    respond({ status: 'running' })
    await expect(startRun({ action: 'start' })).resolves.toEqual({ run: { status: 'running' } })
  })

  it('un 401 se marca como sesion expirada en vez de lanzar', async () => {
    // Un 401 acá es la sesion SAP, no la auth de la API: el llamador tiene que
    // poder pedir login nuevo en vez de mostrar un error generico.
    respond({ error: 'Unauthorized' }, 401)
    await expect(startRun({})).resolves.toEqual({ sessionExpired: true })
  })

  it('cualquier otro error de start si lanza', async () => {
    respond({ error: 'ya esta corriendo' }, 409)
    await expect(startRun({})).rejects.toThrow('ya esta corriendo')
  })

  it('cancelar manda DELETE con el orchestrationId', async () => {
    respond({ status: 'cancelled' })
    await expect(cancelRun('o1')).resolves.toEqual({ status: 'cancelled' })
    expect(last.method).toBe('DELETE')
    expect(last.body).toEqual({ orchestrationId: 'o1' })
  })
})
