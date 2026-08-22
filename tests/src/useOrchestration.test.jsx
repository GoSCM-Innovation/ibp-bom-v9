// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useOrchestration } from '../../src/components/Orchestrations/useOrchestration'

// Tests de caracterizacion: fijan el comportamiento del hook TAL COMO ES antes
// de separarlo en hooks por responsabilidad (#5). No juzgan si el
// comportamiento es bueno; existen para que la separacion no lo cambie.

const CONN = { id: 'c1', name: 'Conexion Demo', hciUrl: 'https://h.example.com', orgName: 'ORG', isProduction: false }

let routes, calls

function ok(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

// Al frente: la ultima ruta registrada gana, para que un test pueda pisar el
// default del beforeEach.
function route(method, pathIncludes, handler) {
  routes.unshift({ method, pathIncludes, handler })
}

function mockFetch(input, init = {}) {
  const url = String(input)
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body ? JSON.parse(init.body) : null
  calls.push({ url, method, body })
  const r = routes.find(r => r.method === method && url.includes(r.pathIncludes))
  if (!r) return Promise.resolve(ok({ error: `sin ruta para ${method} ${url}` }, 404))
  return Promise.resolve(r.handler({ url, method, body }))
}

function callsTo(pathIncludes, method) {
  return calls.filter(c => c.url.includes(pathIncludes) && (!method || c.method === method))
}

beforeEach(() => {
  routes = []
  calls = []
  vi.stubGlobal('fetch', vi.fn(mockFetch))
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('prompt', vi.fn(() => 'Nueva'))
  // Notification no se stubea por defecto: jsdom no la define, que es el mismo
  // caso que un navegador sin soporte. Stubearla como undefined haria que
  // `'Notification' in window` diera true con valor undefined, un estado que no
  // existe en ningun navegador.
  route('GET', '/api/orchestrations', () => ok([]))
  route('GET', '/api/orchestrate', () => ok(null))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function render(sessionId = 'sid-1', onSessionExpired = vi.fn()) {
  const r = renderHook(() => useOrchestration(CONN, sessionId, onSessionExpired))
  return { ...r, onSessionExpired }
}

async function settle(result) {
  await waitFor(() => expect(result.current.loading).toBe(false))
}

// Variante para los tests con timers falsos: waitFor se apoya en timers, asi
// que bajo fake timers hay que vaciar la cola de microtareas a mano.
async function flush() {
  await act(async () => {})
}

// Selecciona y espera a que aterrice el GET del estado de corrida. Sin esto,
// ese fetch puede resolver despues de un start y pisar el run recien puesto.
async function seleccionar(result, id) {
  act(() => result.current.setSelectedId(id))
  await waitFor(() => expect(result.current.selectedId).toBe(id))
  await act(async () => {})
}

// Deja el hook cargado y con `o1` seleccionado, con los timers ya falsos para
// que el setInterval del polling nazca mockeado. Activarlos despues no sirve:
// el intervalo ya quedo registrado contra el timer real.
async function renderCorriendo() {
  vi.useFakeTimers()
  const r = render()
  await flush()
  act(() => r.result.current.setSelectedId('o1'))
  await flush()
  expect(r.result.current.isRunning).toBe(true)
  return r
}

describe('carga inicial', () => {
  it('pide las orquestaciones de la conexion y apaga loading', async () => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Uno' }]))
    const { result } = render()
    expect(result.current.loading).toBe(true)
    await settle(result)
    expect(callsTo('/api/orchestrations', 'GET')[0].url).toContain('connectionId=c1')
    expect(result.current.orchs).toHaveLength(1)
    expect(result.current.error).toBe(null)
  })

  it('migra steps a grafo al cargar', async () => {
    route('GET', '/api/orchestrations', () => ok([
      { id: 'o1', name: 'Uno', steps: [{ id: 's1', taskName: 'T1' }, { id: 's2', taskName: 'T2' }] },
    ]))
    const { result } = render()
    await settle(result)
    const o = result.current.orchs[0]
    expect(o.nodes).toHaveLength(2)
    expect(o.edges).toHaveLength(1)
    expect(o._migrated).toBe(true)
  })

  it('un HTTP no-ok deja error y apaga loading', async () => {
    route('GET', '/api/orchestrations', () => ok({}, 500))
    const { result } = render()
    await settle(result)
    expect(result.current.error).toBe('HTTP 500')
    expect(result.current.orchs).toEqual([])
  })
})

describe('seleccion y estado de corrida', () => {
  beforeEach(() => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Uno' }, { id: 'o2', name: 'Dos' }]))
  })

  it('selected se deriva de selectedId', async () => {
    const { result } = render()
    await settle(result)
    expect(result.current.selected).toBe(null)
    act(() => result.current.setSelectedId('o2'))
    await waitFor(() => expect(result.current.selected?.name).toBe('Dos'))
  })

  it('al seleccionar pide el estado de corrida', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'success' }))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await waitFor(() => expect(result.current.run?.status).toBe('success'))
    expect(callsTo('/api/orchestrate', 'GET')[0].url).toContain('orchestrationId=o1')
  })

  it('deseleccionar limpia la corrida sin pedir nada', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'success' }))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await waitFor(() => expect(result.current.run).toBeTruthy())
    const antes = callsTo('/api/orchestrate', 'GET').length
    act(() => result.current.setSelectedId(null))
    await waitFor(() => expect(result.current.run).toBe(null))
    expect(callsTo('/api/orchestrate', 'GET')).toHaveLength(antes)
  })

  it('isRunning solo es true con status running', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'running' }))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await waitFor(() => expect(result.current.isRunning).toBe(true))
  })
})

describe('polling', () => {
  beforeEach(() => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Uno' }]))
  })

  it('arranca al entrar en running y hace tick cada 5s', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'running' }))
    await renderCorriendo()

    const antes = callsTo('action=tick').length
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(callsTo('action=tick').length).toBe(antes + 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(callsTo('action=tick').length).toBe(antes + 2)
  })

  it('se detiene al llegar a un estado terminal', async () => {
    let tickStatus = 'running'
    route('GET', '/api/orchestrate', ({ url }) => ok({ status: url.includes('tick') ? tickStatus : 'running' }))
    const { result } = await renderCorriendo()

    tickStatus = 'success'
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.run.status).toBe('success')
    const trasTerminal = callsTo('action=tick').length
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(callsTo('action=tick').length).toBe(trasTerminal)
  })

  it('no deja el intervalo vivo al desmontar', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'running' }))
    const { unmount } = await renderCorriendo()

    unmount()
    const antes = callsTo('action=tick').length
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(callsTo('action=tick').length).toBe(antes)
  })

  it('un tick que falla no rompe el hook', async () => {
    let falla = false
    route('GET', '/api/orchestrate', ({ url }) => {
      if (url.includes('tick') && falla) return Promise.reject(new Error('red caida'))
      return ok({ status: 'running' })
    })
    const { result } = await renderCorriendo()
    falla = true
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.run?.status).toBe('running')
  })
})

describe('notificaciones', () => {
  beforeEach(() => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Mi Orquestacion' }]))
  })

  function stubNotification(permission) {
    const ctor = vi.fn()
    ctor.permission = permission
    ctor.requestPermission = vi.fn()
    vi.stubGlobal('Notification', ctor)
    return ctor
  }

  async function correrHastaTerminal(ctor, terminal) {
    let tickStatus = 'running'
    route('GET', '/api/orchestrate', ({ url }) => ok({ status: url.includes('tick') ? tickStatus : 'running' }))
    const { result } = await renderCorriendo()
    // Primer tick en running: es el que fija prevStatus. Sin el, la transicion
    // a terminal no se detecta y no hay aviso.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    tickStatus = terminal
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.run.status).toBe(terminal)
    return ctor
  }

  it('avisa al pasar de running a terminal, con el nombre de la orquestacion', async () => {
    const ctor = stubNotification('granted')
    await correrHastaTerminal(ctor, 'success')
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor.mock.calls[0][0]).toBe('Mi Orquestacion')
    expect(ctor.mock.calls[0][1].body).toBe('Completada correctamente')
  })

  it('usa un texto distinto por estado terminal', async () => {
    const ctor = stubNotification('granted')
    await correrHastaTerminal(ctor, 'error')
    expect(ctor.mock.calls[0][1].body).toBe('Finalizó con error')
  })

  it('no avisa si el permiso no esta concedido', async () => {
    const ctor = stubNotification('denied')
    await correrHastaTerminal(ctor, 'success')
    expect(ctor).not.toHaveBeenCalled()
  })
})

describe('CRUD', () => {
  beforeEach(() => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Uno' }]))
  })

  it('crear pide nombre, hace POST y selecciona la nueva', async () => {
    route('POST', '/api/orchestrations', ({ body }) => ok({ id: 'o9', name: body.name }))
    const { result } = render()
    await settle(result)
    await act(async () => { await result.current.createOrch() })
    const post = callsTo('/api/orchestrations', 'POST')[0]
    expect(post.body).toEqual({ connectionId: 'c1', name: 'Nueva' })
    expect(result.current.orchs.map(o => o.id)).toEqual(['o1', 'o9'])
    expect(result.current.selectedId).toBe('o9')
  })

  it('crear sin nombre no llama a la API', async () => {
    vi.stubGlobal('prompt', vi.fn(() => '   '))
    const { result } = render()
    await settle(result)
    await act(async () => { await result.current.createOrch() })
    expect(callsTo('/api/orchestrations', 'POST')).toHaveLength(0)
  })

  it('duplicar manda action duplicate y selecciona la copia', async () => {
    route('POST', '/api/orchestrations', () => ok({ id: 'o1-copia', name: 'Uno (copia)' }))
    const { result } = render()
    await settle(result)
    await act(async () => { await result.current.duplicateOrch('o1') })
    expect(callsTo('/api/orchestrations', 'POST')[0].body).toEqual({ action: 'duplicate', id: 'o1' })
    expect(result.current.selectedId).toBe('o1-copia')
  })

  it('eliminar pide confirmacion y saca la orquestacion de la lista', async () => {
    route('DELETE', '/api/orchestrations', () => ok({}))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await act(async () => { await result.current.deleteOrch('o1') })
    expect(result.current.orchs).toEqual([])
    expect(result.current.selectedId).toBe(null)
  })

  it('eliminar cancelado no llama a la API', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { result } = render()
    await settle(result)
    await act(async () => { await result.current.deleteOrch('o1') })
    expect(callsTo('/api/orchestrations', 'DELETE')).toHaveLength(0)
    expect(result.current.orchs).toHaveLength(1)
  })

  it('guardar el grafo actualiza el estado local antes de que responda el PUT', async () => {
    let resolvePut
    route('PUT', '/api/orchestrations', () => new Promise(r => { resolvePut = () => r(ok({})) }))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    const nodes = [{ id: 'n1' }]
    let pending
    act(() => { pending = result.current.saveGraph(nodes, []) })
    // Optimista: el estado local ya cambio con el PUT en vuelo.
    expect(result.current.orchs[0].nodes).toEqual(nodes)
    expect(result.current.saving).toBe(true)
    await act(async () => { resolvePut(); await pending })
    expect(result.current.saving).toBe(false)
  })

  it('renombrar hace PUT y refleja el nombre nuevo', async () => {
    route('PUT', '/api/orchestrations', () => ok({}))
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await act(async () => { await result.current.commitName('Renombrada') })
    expect(callsTo('/api/orchestrations', 'PUT')[0].body).toEqual({ id: 'o1', name: 'Renombrada' })
    expect(result.current.orchs[0].name).toBe('Renombrada')
  })

  it('renombrar con vacio no llama a la API', async () => {
    const { result } = render()
    await settle(result)
    act(() => result.current.setSelectedId('o1'))
    await act(async () => { await result.current.commitName('   ') })
    expect(callsTo('/api/orchestrations', 'PUT')).toHaveLength(0)
  })
})

describe('ejecucion', () => {
  beforeEach(() => {
    route('GET', '/api/orchestrations', () => ok([{ id: 'o1', name: 'Uno' }]))
  })

  it('start manda la conexion recortada y la sesion', async () => {
    route('POST', '/api/orchestrate', () => ok({ status: 'running' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await act(async () => { await result.current.handleStart({ agentName: 'AG', profileName: 'PF', globalVariables: [{ name: 'V', value: '1' }] }) })
    const post = callsTo('/api/orchestrate', 'POST')[0]
    expect(post.body).toEqual({
      orchestrationId: 'o1', action: 'start',
      connection: { hciUrl: CONN.hciUrl, orgName: CONN.orgName, isProduction: false },
      sessionId: 'sid-1',
      defaultAgent: 'AG', defaultProfile: 'PF',
      globalVariables: [{ name: 'V', value: '1' }],
    })
    expect(post.body.connection.id).toBeUndefined()
    expect(result.current.run.status).toBe('running')
  })

  it('start sin argumentos manda los defaults en null', async () => {
    route('POST', '/api/orchestrate', () => ok({ status: 'running' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await act(async () => { await result.current.handleStart() })
    const b = callsTo('/api/orchestrate', 'POST')[0].body
    expect(b.defaultAgent).toBe(null)
    expect(b.defaultProfile).toBe(null)
    expect(b.globalVariables).toEqual([])
  })

  it('un 401 al arrancar avisa de sesion expirada y no lanza', async () => {
    route('POST', '/api/orchestrate', () => ok({ error: 'Unauthorized' }, 401))
    const { result, onSessionExpired } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await act(async () => { await result.current.handleStart() })
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
    expect(result.current.starting).toBe(false)
    expect(globalThis.alert).not.toHaveBeenCalled()
  })

  it('resume manda action resume sin agente ni variables', async () => {
    route('POST', '/api/orchestrate', () => ok({ status: 'running' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await act(async () => { await result.current.handleResume() })
    const b = callsTo('/api/orchestrate', 'POST')[0].body
    expect(b.action).toBe('resume')
    expect(b.defaultAgent).toBeUndefined()
    expect(b.globalVariables).toBeUndefined()
  })

  it('cancel solo corre si hay una corrida en curso', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'success' }))
    route('DELETE', '/api/orchestrate', () => ok({ status: 'cancelled' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await waitFor(() => expect(result.current.run?.status).toBe('success'))
    await act(async () => { await result.current.handleCancel() })
    expect(callsTo('/api/orchestrate', 'DELETE')).toHaveLength(0)
  })

  it('cancel manda DELETE y refleja el estado nuevo', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'running' }))
    route('DELETE', '/api/orchestrate', () => ok({ status: 'cancelled' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await waitFor(() => expect(result.current.isRunning).toBe(true))
    await act(async () => { await result.current.handleCancel() })
    expect(callsTo('/api/orchestrate', 'DELETE')[0].body).toEqual({ orchestrationId: 'o1' })
    expect(result.current.run.status).toBe('cancelled')
  })

  it('no arranca dos veces si ya esta corriendo', async () => {
    route('GET', '/api/orchestrate', () => ok({ status: 'running' }))
    route('POST', '/api/orchestrate', () => ok({ status: 'running' }))
    const { result } = render()
    await settle(result)
    await seleccionar(result, 'o1')
    await waitFor(() => expect(result.current.isRunning).toBe(true))
    await act(async () => { await result.current.handleStart() })
    expect(callsTo('/api/orchestrate', 'POST')).toHaveLength(0)
  })
})

describe('import y export', () => {
  const DOS = [
    { id: 'o1', name: 'Uno', nodes: [{ id: 'n1' }], edges: [] },
    { id: 'o2', name: 'Dos', nodes: [], edges: [] },
  ]

  it('exportar arma el payload con la conexion origen y dispara la descarga', async () => {
    route('GET', '/api/orchestrations', () => ok(DOS))
    const created = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const el = realCreate(tag)
      if (tag === 'a') { el.click = vi.fn(); created.push(el) }
      return el
    })
    const { result } = render()
    await settle(result)
    act(() => result.current.exportOrchestrations())
    expect(created).toHaveLength(1)
    expect(created[0].click).toHaveBeenCalled()
    expect(created[0].download).toMatch(/^ibp-orquestaciones-Conexion_Demo-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('exportar sin orquestaciones no hace nada', async () => {
    const spy = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: spy, revokeObjectURL: vi.fn() })
    const { result } = render()
    await settle(result)
    act(() => result.current.exportOrchestrations())
    expect(spy).not.toHaveBeenCalled()
  })

  it('importar clasifica en agregadas, reemplazadas y omitidas', async () => {
    route('GET', '/api/orchestrations', () => ok(DOS))
    route('POST', '/api/orchestrations', ({ body }) => ok({ id: 'nuevo', name: body.name }))
    route('PUT', '/api/orchestrations', () => ok({}))
    const { result } = render()
    await settle(result)
    let r
    await act(async () => {
      r = await result.current.bulkImportOrchestrations(
        { orchestrations: [{ name: 'Uno' }, { name: 'Tres' }] },
        { replaceDuplicates: true },
      )
    })
    expect(r).toMatchObject({ added: 1, replaced: 1, skipped: 0, failed: 0 })
  })

  it('sin reemplazar, las duplicadas se omiten y no se llama a la API', async () => {
    route('GET', '/api/orchestrations', () => ok(DOS))
    const { result } = render()
    await settle(result)
    let r
    await act(async () => {
      r = await result.current.bulkImportOrchestrations(
        { orchestrations: [{ name: 'uno' }, { name: 'DOS' }] },
        { replaceDuplicates: false },
      )
    })
    // El match de duplicadas ignora mayusculas y espacios.
    expect(r).toMatchObject({ added: 0, replaced: 0, skipped: 2, failed: 0 })
    expect(callsTo('/api/orchestrations', 'PUT')).toHaveLength(0)
  })

  it('un fallo puntual no aborta el resto y queda en errors', async () => {
    route('GET', '/api/orchestrations', () => ok(DOS))
    route('POST', '/api/orchestrations', ({ body }) =>
      body.name === 'Mala' ? ok({ error: 'nombre invalido' }, 400) : ok({ id: 'x', name: body.name }))
    const { result } = render()
    await settle(result)
    let r
    await act(async () => {
      r = await result.current.bulkImportOrchestrations(
        { orchestrations: [{ name: 'Mala' }, { name: 'Buena' }] },
        { replaceDuplicates: false },
      )
    })
    expect(r.added).toBe(1)
    expect(r.failed).toBe(1)
    expect(r.errors).toEqual([{ name: 'Mala', message: 'nombre invalido' }])
  })

  it('importar recarga la lista al terminar', async () => {
    route('GET', '/api/orchestrations', () => ok(DOS))
    route('POST', '/api/orchestrations', ({ body }) => ok({ id: 'x', name: body.name }))
    const { result } = render()
    await settle(result)
    const antes = callsTo('/api/orchestrations', 'GET').length
    await act(async () => {
      await result.current.bulkImportOrchestrations({ orchestrations: [{ name: 'Tres' }] }, { replaceDuplicates: false })
    })
    expect(callsTo('/api/orchestrations', 'GET').length).toBe(antes + 1)
  })
})

describe('contrato del hook', () => {
  it('expone exactamente las claves que consume Orchestrations.jsx', async () => {
    const { result } = render()
    await settle(result)
    expect(Object.keys(result.current).sort()).toEqual([
      'bulkImportOrchestrations', 'cancelling', 'commitName', 'createOrch', 'deleteOrch',
      'duplicateOrch', 'error', 'exportOrchestrations', 'handleCancel', 'handleResume',
      'handleStart', 'isRunning', 'loading', 'orchs', 'run', 'saveGraph', 'saving',
      'selected', 'selectedId', 'setSelectedId', 'starting',
    ])
  })
})
