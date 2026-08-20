import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Tests del motor de ejecución completo: el bucle de tick, el ciclo de vida de
// un run (start/resume/cancel) y el lock. Todo el I/O sale por fetch — Redis por
// el REST de Upstash y SAP por SOAP —, así que se finge con un doble en memoria
// y se ejercita el handler real de principio a fin.

const REDIS_URL = 'https://redis.test'
const API_TOKEN = 'a'.repeat(32)
const CONNECTION = { hciUrl: 'https://sap.test/webservices', orgName: 'org', isProduction: false }
const SESSION = 'SID-1'

// ─── Doubles ─────────────────────────────────────────────────────────────────

function execRedis(store, [cmd, key, value, ...rest]) {
  if (cmd === 'GET') return store.has(key) ? store.get(key) : null
  if (cmd === 'DEL') { store.delete(key); return 1 }
  if (cmd === 'SET') {
    if (rest.includes('NX') && store.has(key)) return null
    store.set(key, value)
    return 'OK'
  }
  throw new Error(`Comando de Redis no soportado en el doble: ${cmd}`)
}

const tagOf = (xml, tag) => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1]

function harness({ orchestrations = [], runs = {} } = {}) {
  const store = new Map()
  store.set('cids:orchestrations', JSON.stringify(orchestrations))
  for (const [id, run] of Object.entries(runs)) {
    store.set(`cids:orch_run:${id}`, JSON.stringify(run))
  }

  const state = {
    store,
    soap: [],                 // historial de llamadas SOAP
    statusByRunId: {},        // runId de SAP -> estado que devuelve el poll
    failRunTask: 0,           // cuántas veces debe fallar runTask antes de andar
    launched: [],             // taskNames lanzados, en orden
  }

  const fetchMock = vi.fn(async (url, init) => {
    if (String(url).startsWith(REDIS_URL)) {
      const results = JSON.parse(init.body).map(cmd => ({ result: execRedis(store, cmd) }))
      return { ok: true, status: 200, json: async () => results }
    }

    const action = init.headers.SOAPAction
    const envelope = init.body
    state.soap.push({ action, envelope })

    if (action === 'function=runTask') {
      if (state.failRunTask > 0) {
        state.failRunTask--
        return { ok: false, status: 500, text: async () => '<faultstring>SAP ocupado</faultstring>' }
      }
      const taskName = tagOf(envelope, 'taskName')
      state.launched.push(taskName)
      const runId = `sap-${taskName}`
      state.statusByRunId[runId] ??= { code: 'RUNNING' }
      return { ok: true, status: 200, text: async () => `<RunID>${runId}</RunID>` }
    }

    if (action === 'function=getTaskStatusByRunId2') {
      const runId = tagOf(envelope, 'runId')
      const s = state.statusByRunId[runId] || { code: 'RUNNING' }
      return {
        ok: true, status: 200,
        text: async () => `<statusCode>TASK:${s.code}</statusCode>` +
          (s.endTime ? `<endTime>${s.endTime}</endTime>` : '') +
          (s.statusMsg ? `<statusMsg>${s.statusMsg}</statusMsg>` : ''),
      }
    }

    if (action === 'function=cancelTask') {
      return { ok: true, status: 200, text: async () => '<status>CANCELLED</status>' }
    }

    throw new Error(`SOAPAction no soportada en el doble: ${action}`)
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    ...state,
    fetch: fetchMock,
    readRun: id => JSON.parse(store.get(`cids:orch_run:${id}`)),
    writeRun: (id, run) => store.set(`cids:orch_run:${id}`, JSON.stringify(run)),
    finish: (taskName, code = 'SUCCESS', extra = {}) => {
      state.statusByRunId[`sap-${taskName}`] = { code, ...extra }
    },
    // failRunTask es un primitivo: hay que tocarlo sobre el state, no sobre la
    // copia que deja el spread de arriba.
    failNextRunTasks: n => { state.failRunTask = n },
    // Adelanta el reintento pendiente para no depender del reloj.
    expireRetry: (id, nodeId) => {
      const run = JSON.parse(store.get(`cids:orch_run:${id}`))
      run.nodes[nodeId].retryAt = new Date(Date.now() - 1000).toISOString()
      store.set(`cids:orch_run:${id}`, JSON.stringify(run))
    },
    soapActions: () => state.soap.map(c => c.action),
  }
}

function mockRes() {
  const res = {
    statusCode: 200, body: null,
    status: vi.fn(c => { res.statusCode = c; return res }),
    json: vi.fn(b => { res.body = b; return res }),
    setHeader: vi.fn(), end: vi.fn(() => res),
  }
  return res
}

// ─── Fixtures de grafo ───────────────────────────────────────────────────────

const task = (id, data = {}) => ({
  id, type: 'task', position: { x: 0, y: 0 },
  data: { taskName: id, ...data },
})
const child = (id, parentId, data = {}) => ({ ...task(id, data), parentId })
const group = (id) => ({ id, type: 'group', position: { x: 0, y: 0 }, data: { label: id } })
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target })

const orch = (id, nodes, edges = []) => ({ id, connectionId: 'c1', name: id, nodes, edges })

// ─── Carga del módulo bajo prueba ────────────────────────────────────────────

let handler, tick

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('KV_REST_API_URL', REDIS_URL)
  vi.stubEnv('KV_REST_API_TOKEN', 'token')
  vi.stubEnv('API_TOKEN', API_TOKEN)
  const mod = await import('../../api/orchestrate.js')
  handler = mod.default
  tick = mod.tick
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const call = async (req) => {
  const res = mockRes()
  await handler({ headers: { authorization: `Bearer ${API_TOKEN}` }, query: {}, body: {}, ...req }, res)
  return res
}

const start = (orchestrationId, extra = {}) => call({
  method: 'POST',
  body: { orchestrationId, action: 'start', connection: CONNECTION, sessionId: SESSION, ...extra },
})

const doTick = id => tick(id)

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('start de un run', () => {
  it('crea el run, deja los nodos pendientes y lanza la primera ola', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })

    const res = await start('o1')

    expect(res.statusCode).toBe(201)
    expect(res.body.status).toBe('running')
    expect(res.body.runId).toMatch(/^[0-9a-f-]{36}$/)
    // A no tiene predecesores: arranca. B espera.
    expect(h.launched).toEqual(['A'])
    expect(res.body.nodes.A).toMatchObject({ status: 'running', sapRunId: 'sap-A' })
    expect(res.body.nodes.B.status).toBe('pending')
  })

  it('persiste el run en Redis', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    expect(h.readRun('o1')).toMatchObject({ orchestrationId: 'o1', status: 'running' })
  })

  it('lanza en paralelo los nodos sin predecesores', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B'), task('C')])] })
    await start('o1')
    expect(h.launched.sort()).toEqual(['A', 'B', 'C'])
  })

  it('propaga el agente y las variables globales por defecto al runTask', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A', { globalVariables: [{ name: 'V1', value: 'x' }] })])] })

    await start('o1', { defaultAgent: 'AG1', defaultProfile: 'PRF1', globalVariables: [{ name: 'V1', value: 'nuevo' }] })

    const envelope = h.soap.find(c => c.action === 'function=runTask').envelope
    expect(envelope).toContain('<agentName>AG1</agentName>')
    expect(envelope).toContain('<profileName>PRF1</profileName>')
    // La global pisa el valor de la variable que la task ya declara.
    expect(envelope).toContain('<variable name="V1">nuevo</variable>')
  })

  it('rechaza una orquestación inexistente', async () => {
    harness({ orchestrations: [] })
    const res = await start('fantasma')
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toMatch(/no encontrada/i)
  })

  it('rechaza una orquestación sin nodos', async () => {
    harness({ orchestrations: [orch('o1', [])] })
    const res = await start('o1')
    expect(res.body.error).toMatch(/no tiene nodos/i)
  })

  it('rechaza un grafo con ciclo', async () => {
    harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B'), edge('B', 'A')])] })
    const res = await start('o1')
    expect(res.body.error).toMatch(/ciclo/i)
  })

  it('devuelve 409 si ya hay una ejecución activa', async () => {
    harness({
      orchestrations: [orch('o1', [task('A')])],
      runs: { o1: { orchestrationId: 'o1', status: 'running', nodes: {} } },
    })
    const res = await start('o1')
    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/ya hay una ejecución activa/i)
  })
})

describe('avance del grafo entre ticks', () => {
  it('encadena A → B cuando A termina bien', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })
    await start('o1')

    h.finish('A', 'SUCCESS')
    const run = await doTick('o1')

    expect(run.nodes.A.status).toBe('success')
    expect(run.nodes.B).toMatchObject({ status: 'running', sapRunId: 'sap-B' })
  })

  it('no lanza el sucesor mientras el predecesor sigue corriendo', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })
    await start('o1')

    const run = await doTick('o1')

    expect(run.nodes.A.status).toBe('running')
    expect(run.nodes.B.status).toBe('pending')
    expect(h.launched).toEqual(['A'])
  })

  it('espera a todos los predecesores en un diamante', async () => {
    const nodes = [task('A'), task('B'), task('C'), task('D')]
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]
    const h = harness({ orchestrations: [orch('o1', nodes, edges)] })
    await start('o1')

    h.finish('A', 'SUCCESS')
    await doTick('o1')
    expect(h.launched.sort()).toEqual(['A', 'B', 'C'])

    h.finish('B', 'SUCCESS')
    let run = await doTick('o1')
    expect(run.nodes.D.status).toBe('pending')

    h.finish('C', 'SUCCESS')
    run = await doTick('o1')
    expect(run.nodes.D.status).toBe('running')
  })

  // Dos cadenas sin relación entre sí no deben esperarse mutuamente.
  it('avanza cadenas independientes en paralelo', async () => {
    const nodes = [task('A'), task('B'), task('C'), task('D')]
    const edges = [edge('A', 'B'), edge('C', 'D')]
    const h = harness({ orchestrations: [orch('o1', nodes, edges)] })
    await start('o1')

    h.finish('A', 'SUCCESS')      // la cadena C→D sigue en su primer paso
    const run = await doTick('o1')

    expect(run.nodes.B.status).toBe('running')
    expect(run.nodes.C.status).toBe('running')
    expect(run.nodes.D.status).toBe('pending')
  })

  it('marca el run como success cuando todos terminan', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })
    await start('o1')

    h.finish('A', 'SUCCESS')
    await doTick('o1')
    h.finish('B', 'SUCCESS')
    const run = await doTick('o1')

    expect(run.status).toBe('success')
    expect(run.finishedAt).toBeTruthy()
  })

  it('no vuelve a tocar un run en estado terminal', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.finish('A', 'SUCCESS')
    await doTick('o1')

    const antes = h.soap.length
    const run = await doTick('o1')

    expect(run.status).toBe('success')
    expect(h.soap.length).toBe(antes)
  })

  it('marca el run como error si la orquestación desaparece a mitad', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.store.set('cids:orchestrations', JSON.stringify([]))

    const run = await doTick('o1')

    expect(run.status).toBe('error')
    expect(run.finishedAt).toBeTruthy()
  })
})

describe('propagación de fallos', () => {
  it('con estrategia stop marca el sucesor como skipped y el run como error', async () => {
    const nodes = [task('A', { errorStrategy: 'stop' }), task('B')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('A', 'B')])] })
    await start('o1')

    h.finish('A', 'ERROR')
    const run = await doTick('o1')

    expect(run.nodes.A.status).toBe('error')
    expect(run.nodes.B.status).toBe('skipped')
    expect(run.status).toBe('error')
    expect(h.launched).toEqual(['A'])
  })

  it('con estrategia continue lanza igual el sucesor', async () => {
    const nodes = [task('A', { errorStrategy: 'continue' }), task('B')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('A', 'B')])] })
    await start('o1')

    h.finish('A', 'ERROR')
    const run = await doTick('o1')

    expect(run.nodes.A.status).toBe('error')
    expect(run.nodes.B.status).toBe('running')
  })

  it('el skip se propaga en cadena', async () => {
    const nodes = [task('A', { errorStrategy: 'stop' }), task('B'), task('C')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('A', 'B'), edge('B', 'C')])] })
    await start('o1')

    h.finish('A', 'ERROR')
    await doTick('o1')
    const run = await doTick('o1')

    expect(run.nodes.B.status).toBe('skipped')
    expect(run.nodes.C.status).toBe('skipped')
    expect(run.status).toBe('error')
  })

  it('un SUCCESS_WITH_ERRORS no bloquea al sucesor', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })
    await start('o1')

    h.finish('A', 'SUCCESS_WITH_ERRORS_D')
    const run = await doTick('o1')

    expect(run.nodes.A.status).toBe('success_with_errors')
    expect(run.nodes.B.status).toBe('running')
  })

  it('cierra el run como success si nadie termino en error', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.finish('A', 'SUCCESS_WITH_ERRORS_E')
    const run = await doTick('o1')
    expect(run.status).toBe('success')
  })
})

describe('reintentos', () => {
  it('vuelve a pending y relanza cuando vence el retryAt', async () => {
    const nodes = [task('A', { errorStrategy: 'retry', maxRetries: 1, retryDelaySec: 30 })]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    await start('o1')

    h.finish('A', 'ERROR')
    let run = await doTick('o1')
    expect(run.nodes.A).toMatchObject({ status: 'pending', retryCount: 1, sapRunId: null })
    expect(run.nodes.A.retryAt).toBeTruthy()
    expect(h.launched).toEqual(['A'])

    // Antes de que venza el retryAt no se relanza.
    run = await doTick('o1')
    expect(h.launched).toEqual(['A'])

    // Se fuerza el vencimiento y el siguiente tick lo relanza.
    h.expireRetry('o1', 'A')
    h.statusByRunId['sap-A'] = { code: 'RUNNING' }

    run = await doTick('o1')
    expect(run.nodes.A.status).toBe('running')
    expect(h.launched).toEqual(['A', 'A'])
  })

  it('falla definitivamente cuando se agotan los reintentos', async () => {
    const nodes = [task('A', { errorStrategy: 'retry', maxRetries: 1, retryDelaySec: 30 })]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    await start('o1')

    h.finish('A', 'ERROR')
    await doTick('o1')            // primer error -> reintento programado
    h.expireRetry('o1', 'A')
    await doTick('o1')            // relanza
    const run = await doTick('o1')  // segundo error -> sin reintentos disponibles

    expect(run.nodes.A.status).toBe('error')
    expect(run.nodes.A.retryCount).toBe(1)
    expect(run.status).toBe('error')
  })

  // retryDelaySec se lee con `|| 30`, así que un 0 explícito cae al valor por
  // defecto en vez de reintentar de inmediato.
  it('trata retryDelaySec 0 como los 30 s por defecto', async () => {
    const nodes = [task('A', { errorStrategy: 'retry', maxRetries: 1, retryDelaySec: 0 })]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    const t0 = Date.now()
    await start('o1')

    h.finish('A', 'ERROR')
    const run = await doTick('o1')

    const espera = new Date(run.nodes.A.retryAt).getTime() - t0
    expect(espera).toBeGreaterThan(25_000)
  })
})

describe('grupos', () => {
  it('ejecuta los hijos y cierra el grupo al terminar todos', async () => {
    const nodes = [group('G'), child('C1', 'G'), child('C2', 'G')]
    const h = harness({ orchestrations: [orch('o1', nodes)] })

    await start('o1')
    // Los dos hijos no tienen dependencias entre si: arrancan juntos.
    expect(h.launched.sort()).toEqual(['C1', 'C2'])

    h.finish('C1', 'SUCCESS')
    let run = await doTick('o1')
    expect(run.nodes.G.status).toBe('running')

    h.finish('C2', 'SUCCESS')
    run = await doTick('o1')
    expect(run.nodes.G.status).toBe('success')
    expect(run.status).toBe('success')
  })

  it('respeta las dependencias internas del grupo', async () => {
    const nodes = [group('G'), child('C1', 'G'), child('C2', 'G')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('C1', 'C2')])] })

    await start('o1')
    expect(h.launched).toEqual(['C1'])

    h.finish('C1', 'SUCCESS')
    await doTick('o1')
    expect(h.launched).toEqual(['C1', 'C2'])
  })

  it('el grupo queda en error si un hijo falla', async () => {
    const nodes = [group('G'), child('C1', 'G', { errorStrategy: 'stop' })]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    await start('o1')

    h.finish('C1', 'ERROR')
    const run = await doTick('o1')

    expect(run.nodes.G.status).toBe('error')
    expect(run.status).toBe('error')
  })

  it('un grupo vacío se cierra como success', async () => {
    harness({ orchestrations: [orch('o1', [group('G')])] })
    const res = await start('o1')
    expect(res.body.nodes.G.status).toBe('success')
    expect(res.body.status).toBe('success')
  })

  it('encadena un grupo con un nodo posterior', async () => {
    const nodes = [group('G'), child('C1', 'G'), task('B')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('G', 'B')])] })
    await start('o1')

    expect(h.launched).toEqual(['C1'])
    h.finish('C1', 'SUCCESS')
    const run = await doTick('o1')

    expect(run.nodes.G.status).toBe('success')
    expect(run.nodes.B.status).toBe('running')
  })
})

describe('lock de ejecución', () => {
  it('libera el lock al terminar el tick', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    expect(h.store.has('cids:orch_run_lock:o1')).toBe(false)
  })

  // Si otro tick tiene el lock, este devuelve el run guardado sin tocar SAP.
  it('no ejecuta nada cuando el lock está tomado', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A'), task('B')], [edge('A', 'B')])] })
    await start('o1')
    h.finish('A', 'SUCCESS')

    h.store.set('cids:orch_run_lock:o1', 'otro-token')
    const antes = h.soap.length
    const run = await doTick('o1')

    expect(h.soap.length).toBe(antes)
    expect(run.nodes.A.status).toBe('running')  // el estado guardado, sin avanzar
  })

  it('no pisa un lock ajeno al liberar', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')

    h.store.set('cids:orch_run_lock:o1', 'token-ajeno')
    await doTick('o1')

    expect(h.store.get('cids:orch_run_lock:o1')).toBe('token-ajeno')
  })
})

describe('cancelación', () => {
  it('cancela en SAP los nodos corriendo y marca el run', async () => {
    const nodes = [task('A'), task('B')]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('A', 'B')])] })
    await start('o1')

    const res = await call({ method: 'DELETE', body: { orchestrationId: 'o1' } })

    expect(res.body.status).toBe('cancelled')
    expect(res.body.nodes.A.status).toBe('cancelled')
    expect(res.body.nodes.B.status).toBe('skipped')   // pendiente -> skipped
    expect(h.soapActions()).toContain('function=cancelTask')
  })

  it('cancela también los hijos de un grupo', async () => {
    const nodes = [group('G'), child('C1', 'G')]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    await start('o1')

    const res = await call({ method: 'DELETE', body: { orchestrationId: 'o1' } })

    expect(res.body.nodes.G.children.C1.status).toBe('cancelled')
    expect(h.soap.filter(c => c.action === 'function=cancelTask')).toHaveLength(1)
  })

  it('devuelve 409 si el run ya está en estado terminal', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.finish('A', 'SUCCESS')
    await doTick('o1')

    const res = await call({ method: 'DELETE', body: { orchestrationId: 'o1' } })

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/terminal/i)
  })

  it('falla si no hay ejecución registrada', async () => {
    harness({ orchestrations: [orch('o1', [task('A')])] })
    const res = await call({ method: 'DELETE', body: { orchestrationId: 'o1' } })
    expect(res.body.error).toMatch(/no hay ejecución/i)
  })

  // Si un tick tiene el lock, cancelRun reintenta cinco veces cada 500 ms y, si
  // nunca lo consigue, devuelve el run tal como está guardado.
  it('reintenta mientras el lock esté tomado y devuelve el run sin cancelar', async () => {
    vi.useFakeTimers()
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.store.set('cids:orch_run_lock:o1', 'tick-en-curso')

    const pending = call({ method: 'DELETE', body: { orchestrationId: 'o1' } })
    await vi.advanceTimersByTimeAsync(3000)
    const res = await pending

    expect(res.body.status).toBe('running')
    expect(h.soapActions()).not.toContain('function=cancelTask')
  })

  it('cancela en cuanto el lock se libera', async () => {
    vi.useFakeTimers()
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.store.set('cids:orch_run_lock:o1', 'tick-en-curso')

    const pending = call({ method: 'DELETE', body: { orchestrationId: 'o1' } })
    await vi.advanceTimersByTimeAsync(600)
    h.store.delete('cids:orch_run_lock:o1')
    await vi.advanceTimersByTimeAsync(1000)
    const res = await pending

    expect(res.body.status).toBe('cancelled')
    expect(h.soapActions()).toContain('function=cancelTask')
  })
})

describe('resume', () => {
  const resume = id => call({
    method: 'POST',
    body: { orchestrationId: id, action: 'resume', connection: CONNECTION, sessionId: 'SID-2' },
  })

  it('conserva lo exitoso y relanza lo que había fallado', async () => {
    const nodes = [task('A'), task('B', { errorStrategy: 'stop' })]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('A', 'B')])] })
    await start('o1')
    h.finish('A', 'SUCCESS')
    await doTick('o1')
    h.finish('B', 'ERROR')
    await doTick('o1')
    expect(h.readRun('o1').status).toBe('error')

    h.statusByRunId['sap-B'] = { code: 'RUNNING' }
    const res = await resume('o1')

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('running')
    expect(res.body.nodes.A.status).toBe('success')   // no se reejecuta
    expect(res.body.nodes.B.status).toBe('running')
    expect(h.launched).toEqual(['A', 'B', 'B'])
  })

  it('actualiza la sesión SAP del run', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A', { errorStrategy: 'stop' })])] })
    await start('o1')
    h.finish('A', 'ERROR')
    await doTick('o1')

    h.statusByRunId['sap-A'] = { code: 'RUNNING' }
    await resume('o1')

    expect(h.readRun('o1').sessionId).toBe('SID-2')
  })

  it('reinicia el grupo y sus hijos fallidos, conservando los exitosos', async () => {
    const nodes = [
      group('G'),
      child('C1', 'G'),
      child('C2', 'G', { errorStrategy: 'stop' }),
    ]
    const h = harness({ orchestrations: [orch('o1', nodes)] })
    await start('o1')

    h.finish('C1', 'SUCCESS')
    h.finish('C2', 'ERROR')
    await doTick('o1')
    expect(h.readRun('o1').nodes.G.status).toBe('error')

    h.statusByRunId['sap-C2'] = { code: 'RUNNING' }
    const res = await resume('o1')

    expect(res.body.nodes.G.status).toBe('running')
    expect(res.body.nodes.G.children.C1.status).toBe('success')  // no se reejecuta
    expect(res.body.nodes.G.children.C2.status).toBe('running')
    expect(h.launched).toEqual(['C1', 'C2', 'C2'])
  })

  it('no reinicia un grupo que ya había terminado bien', async () => {
    const nodes = [group('G'), child('C1', 'G'), task('B', { errorStrategy: 'stop' })]
    const h = harness({ orchestrations: [orch('o1', nodes, [edge('G', 'B')])] })
    await start('o1')

    h.finish('C1', 'SUCCESS')
    await doTick('o1')
    h.finish('B', 'ERROR')
    await doTick('o1')

    h.statusByRunId['sap-B'] = { code: 'RUNNING' }
    const res = await resume('o1')

    expect(res.body.nodes.G.status).toBe('success')
    expect(h.launched).toEqual(['C1', 'B', 'B'])   // el hijo del grupo no se repite
  })

  it('devuelve 409 si el run ya terminó bien', async () => {
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    await start('o1')
    h.finish('A', 'SUCCESS')
    await doTick('o1')

    const res = await resume('o1')

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/ya finalizó/i)
  })

  it('falla si no hay ejecución registrada', async () => {
    harness({ orchestrations: [orch('o1', [task('A')])] })
    const res = await resume('o1')
    expect(res.body.error).toMatch(/no hay ejecución/i)
  })
})

describe('reintento de lanzamiento ante un fallo transitorio de SAP', () => {
  // Un runTask que no responde 200 garantiza que SAP no arrancó la task, así que
  // el motor reintenta una vez tras una espera breve.
  it('reintenta el runTask una vez y sigue adelante', async () => {
    vi.useFakeTimers()
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    h.failNextRunTasks(1)

    const pending = start('o1')
    await vi.advanceTimersByTimeAsync(2000)
    const res = await pending

    expect(res.body.nodes.A).toMatchObject({ status: 'running', sapRunId: 'sap-A' })
    expect(h.soap.filter(c => c.action === 'function=runTask')).toHaveLength(2)
  })

  it('marca el nodo en error si el reintento también falla', async () => {
    vi.useFakeTimers()
    const h = harness({ orchestrations: [orch('o1', [task('A')])] })
    h.failNextRunTasks(2)

    const pending = start('o1')
    await vi.advanceTimersByTimeAsync(2000)
    const res = await pending

    expect(res.body.nodes.A.status).toBe('error')
    expect(res.body.nodes.A.error).toMatch(/SAP ocupado/)
    expect(res.body.status).toBe('error')
  })
})

describe('contrato del handler', () => {
  beforeEach(() => { harness({ orchestrations: [orch('o1', [task('A')])] }) })

  it('exige autenticación', async () => {
    const res = mockRes()
    await handler({ method: 'GET', headers: {}, query: {}, body: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('corta el preflight OPTIONS', async () => {
    const res = mockRes()
    await handler({ method: 'OPTIONS', headers: {}, query: {}, body: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it.each([
    [{ method: 'POST', body: { action: 'start' } }, /orchestrationId requerido/],
    [{ method: 'POST', body: { orchestrationId: 'o1', action: 'raro' } }, /start.*resume/],
    [{ method: 'POST', body: { orchestrationId: 'o1', action: 'start' } }, /connection y sessionId/],
    [{ method: 'GET', query: {} }, /orchestrationId requerido/],
    [{ method: 'DELETE', body: {} }, /orchestrationId requerido/],
  ])('responde 400 ante entrada inválida %#', async (req, mensaje) => {
    const res = await call(req)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(mensaje)
  })

  it('rechaza métodos no soportados', async () => {
    const res = await call({ method: 'PUT', body: {} })
    expect(res.statusCode).toBe(405)
  })

  it('GET sin action devuelve el run guardado', async () => {
    await start('o1')
    const res = await call({ method: 'GET', query: { orchestrationId: 'o1' } })
    expect(res.body).toMatchObject({ orchestrationId: 'o1', status: 'running' })
  })

  it('GET sin run devuelve null', async () => {
    const res = await call({ method: 'GET', query: { orchestrationId: 'o1' } })
    expect(res.body).toBeNull()
  })

  it('GET con action=tick avanza la ejecución', async () => {
    await start('o1')
    const res = await call({ method: 'GET', query: { orchestrationId: 'o1', action: 'tick' } })
    expect(res.body.status).toBe('running')
  })
})

describe('configuración ausente', () => {
  it('responde 500 si Redis no está configurado', async () => {
    vi.resetModules()
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('API_TOKEN', API_TOKEN)
    const mod = await import('../../api/orchestrate.js')

    const res = mockRes()
    await mod.default(
      { method: 'GET', headers: { authorization: `Bearer ${API_TOKEN}` }, query: {}, body: {} },
      res,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body.error).toMatch(/Redis no configurado/)
  })
})
