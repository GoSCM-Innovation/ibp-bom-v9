import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildWaves, migrateStepsToNodes, resolveGraph, initNodeState,
  mergeVariables, applyTaskResult,
} from '../../api/orchestrate.js'

const node = (id, extra = {}) => ({ id, type: 'task', data: {}, ...extra })
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target })

describe('buildWaves', () => {
  it('devuelve una sola ola con los nodos sin dependencias', () => {
    expect(buildWaves([node('a'), node('b')], [])).toEqual([['a', 'b']])
  })

  it('devuelve lista vacía sin nodos', () => {
    expect(buildWaves([], [])).toEqual([])
  })

  it('serializa una cadena lineal en una ola por nodo', () => {
    const nodes = [node('a'), node('b'), node('c')]
    expect(buildWaves(nodes, [edge('a', 'b'), edge('b', 'c')])).toEqual([['a'], ['b'], ['c']])
  })

  it('agrupa en la misma ola las ramas paralelas de un diamante', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    expect(buildWaves(nodes, edges)).toEqual([['a'], ['b', 'c'], ['d']])
  })

  it('mantiene separadas dos cadenas independientes', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    expect(buildWaves(nodes, [edge('a', 'b'), edge('c', 'd')]))
      .toEqual([['a', 'c'], ['b', 'd']])
  })

  it('ignora los edges que apuntan fuera de la lista de nodos', () => {
    expect(buildWaves([node('a'), node('b')], [edge('a', 'externo'), edge('externo', 'b')]))
      .toEqual([['a', 'b']])
  })

  // Un ciclo deja a sus nodos con in-degree > 0 para siempre: nunca entran a una ola.
  it('deja fuera de las olas a los nodos de un ciclo', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const waves = buildWaves(nodes, [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')])
    expect(waves).toEqual([])
  })

  it('devuelve solo la parte acíclica cuando el ciclo es parcial', () => {
    const nodes = [node('raiz'), node('a'), node('b')]
    const waves = buildWaves(nodes, [edge('a', 'b'), edge('b', 'a')])
    expect(waves).toEqual([['raiz']])
  })
})

describe('migrateStepsToNodes', () => {
  it('devuelve grafo vacío sin steps', () => {
    expect(migrateStepsToNodes([])).toEqual({ nodes: [], edges: [] })
  })

  it('convierte un step suelto en un nodo sin edges', () => {
    const { nodes, edges } = migrateStepsToNodes([{ id: 's1', taskName: 'T1' }])
    expect(edges).toEqual([])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ id: 's1', type: 'task', parentId: null })
    expect(nodes[0].data).toMatchObject({ taskName: 'T1', label: 'T1' })
  })

  it('encadena los steps en secuencia', () => {
    const steps = [{ id: 's1', taskName: 'A' }, { id: 's2', taskName: 'B' }, { id: 's3', taskName: 'C' }]
    const { nodes, edges } = migrateStepsToNodes(steps)
    expect(nodes.map(n => n.id)).toEqual(['s1', 's2', 's3'])
    expect(edges.map(e => [e.source, e.target])).toEqual([['s1', 's2'], ['s2', 's3']])
  })

  it('separa los nodos verticalmente', () => {
    const { nodes } = migrateStepsToNodes([{ id: 's1' }, { id: 's2' }])
    expect(nodes[0].position.y).toBeLessThan(nodes[1].position.y)
  })
})

describe('resolveGraph', () => {
  it('prefiere nodes/edges cuando la orquestación ya los tiene', () => {
    const orch = { nodes: [node('a')], edges: [edge('a', 'b')], steps: [{ id: 's1' }] }
    expect(resolveGraph(orch)).toEqual({ nodes: orch.nodes, edges: orch.edges })
  })

  it('normaliza edges ausentes a lista vacía', () => {
    expect(resolveGraph({ nodes: [node('a')] })).toEqual({ nodes: [node('a')], edges: [] })
  })

  it('migra los steps cuando nodes está vacío', () => {
    const { nodes } = resolveGraph({ nodes: [], steps: [{ id: 's1', taskName: 'T' }] })
    expect(nodes.map(n => n.id)).toEqual(['s1'])
  })

  it('devuelve grafo vacío cuando no hay ni nodes ni steps', () => {
    expect(resolveGraph({})).toEqual({ nodes: [], edges: [] })
  })
})

describe('initNodeState', () => {
  it('inicializa un nodo de tipo task', () => {
    expect(initNodeState(node('a'), [node('a')])).toEqual({
      nodeId: 'a', type: 'task', status: 'pending',
      startedAt: null, finishedAt: null, error: null,
      sapRunId: null, sapStatusCode: null, retryCount: 0, retryAt: null,
    })
  })

  it('inicializa un grupo con el mapa de hijos tomado de parentId', () => {
    const all = [
      { id: 'g1', type: 'group', data: {} },
      node('c1', { parentId: 'g1' }),
      node('c2', { parentId: 'g1' }),
      node('suelto'),
    ]
    const ns = initNodeState(all[0], all)
    expect(ns).toMatchObject({ nodeId: 'g1', type: 'group', status: 'pending', currentGroupWave: 0 })
    expect(Object.keys(ns.children)).toEqual(['c1', 'c2'])
    expect(ns.children.c1).toMatchObject({ nodeId: 'c1', status: 'pending', retryCount: 0 })
  })

  it('inicializa un grupo sin hijos con el mapa vacío', () => {
    const g = { id: 'g1', type: 'group', data: {} }
    expect(initNodeState(g, [g]).children).toEqual({})
  })
})

describe('mergeVariables', () => {
  it('devuelve las variables de la task cuando no hay globales', () => {
    const taskVars = [{ name: 'V1', value: '1' }]
    expect(mergeVariables(taskVars, [])).toBe(taskVars)
    expect(mergeVariables(taskVars, null)).toBe(taskVars)
  })

  it('pisa el valor de una variable que la task ya declara', () => {
    const merged = mergeVariables([{ name: 'V1', value: '1' }], [{ name: 'V1', value: '99' }])
    expect(merged).toEqual([{ name: 'V1', value: '99' }])
  })

  // La global solo aplica si la task declara esa variable: no se inyectan nombres nuevos.
  it('ignora las globales que la task no declara', () => {
    const merged = mergeVariables([{ name: 'V1', value: '1' }], [{ name: 'DESCONOCIDA', value: 'x' }])
    expect(merged).toEqual([{ name: 'V1', value: '1' }])
  })

  it('conserva el resto de campos de la variable de la task', () => {
    const merged = mergeVariables(
      [{ name: 'V1', value: '1', dataType: 'varchar' }],
      [{ name: 'V1', value: '99' }],
    )
    expect(merged[0]).toEqual({ name: 'V1', value: '99', dataType: 'varchar' })
  })

  it('aplica solo las globales coincidentes cuando hay varias variables', () => {
    const merged = mergeVariables(
      [{ name: 'A', value: '1' }, { name: 'B', value: '2' }],
      [{ name: 'B', value: '20' }, { name: 'C', value: '30' }],
    )
    expect(merged).toEqual([{ name: 'A', value: '1' }, { name: 'B', value: '20' }])
  })

  it('sin variables en la task no hay nada que pisar', () => {
    expect(mergeVariables([], [{ name: 'V1', value: '1' }])).toEqual([])
  })
})

describe('applyTaskResult', () => {
  const running = () => ({ status: 'running', sapRunId: 'R1', retryCount: 0, error: null })

  afterEach(() => { vi.useRealTimers() })

  it('marca success con SUCCESS', () => {
    const ns = running()
    applyTaskResult(ns, { code: 'SUCCESS' }, 'stop', 0, 30)
    expect(ns).toMatchObject({ status: 'success', sapStatusCode: 'SUCCESS' })
    expect(ns.finishedAt).toBeTruthy()
  })

  it.each(['SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'])(
    'marca success_with_errors con %s', (code) => {
      const ns = running()
      applyTaskResult(ns, { code }, 'stop', 0, 30)
      expect(ns).toMatchObject({ status: 'success_with_errors', sapStatusCode: code })
    })

  it.each(['COMPLETED', 'FINISHED', 'DONE'])('trata %s como success', (code) => {
    const ns = running()
    applyTaskResult(ns, { code }, 'stop', 0, 30)
    expect(ns).toMatchObject({ status: 'success', sapStatusCode: code })
  })

  it('normaliza el código a mayúsculas', () => {
    const ns = running()
    applyTaskResult(ns, { code: 'success' }, 'stop', 0, 30)
    expect(ns.status).toBe('success')
  })

  it.each(['ERROR', 'TERMINATED', 'TERMINATION_FAILED', 'UNKNOWN'])(
    'marca error con %s y estrategia stop', (code) => {
      const ns = running()
      applyTaskResult(ns, { code }, 'stop', 0, 30)
      expect(ns).toMatchObject({ status: 'error', sapStatusCode: code })
      expect(ns.error).toBe(`SAP: ${code}`)
    })

  it('incluye el statusMsg en el mensaje de error', () => {
    const ns = running()
    applyTaskResult(ns, { code: 'ERROR', statusMsg: 'tabla bloqueada' }, 'stop', 0, 30)
    expect(ns.error).toBe('SAP: ERROR - tabla bloqueada')
  })

  it('no toca el nodo mientras el estado es no terminal', () => {
    for (const code of ['RUNNING', 'QUEUEING', 'IMPORTED', 'FETCHED']) {
      const ns = running()
      applyTaskResult(ns, { code }, 'stop', 0, 30)
      expect(ns.status).toBe('running')
    }
  })

  it('no cambia el estado ante un código desconocido sin endTime', () => {
    const ns = running()
    applyTaskResult(ns, { code: 'RARO' }, 'stop', 0, 30)
    expect(ns.status).toBe('running')
  })

  describe('estrategia retry', () => {
    it('vuelve a pending y programa el reintento', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const ns = running()
      applyTaskResult(ns, { code: 'ERROR' }, 'retry', 2, 30)
      expect(ns).toMatchObject({ status: 'pending', sapRunId: null, sapStatusCode: null, retryCount: 1 })
      expect(ns.retryAt).toBe('2026-01-01T00:00:30.000Z')
      expect(ns.error).toBe('SAP: ERROR (intento 1/2)')
    })

    it('marca error cuando se agotaron los reintentos', () => {
      const ns = { ...running(), retryCount: 2 }
      applyTaskResult(ns, { code: 'ERROR' }, 'retry', 2, 30)
      expect(ns).toMatchObject({ status: 'error', retryCount: 2 })
      expect(ns.error).toBe('SAP: ERROR')
    })

    it('con maxRetries 0 falla en el primer error', () => {
      const ns = running()
      applyTaskResult(ns, { code: 'ERROR' }, 'retry', 0, 30)
      expect(ns.status).toBe('error')
    })
  })

  // Algunos tenants devuelven códigos no documentados; el fallback usa endTime.
  describe('fallback por endTime', () => {
    it('asume success con endTime y código desconocido', () => {
      const ns = running()
      applyTaskResult(ns, { code: 'RARO', endTime: '20260101010000' }, 'stop', 0, 30)
      expect(ns).toMatchObject({ status: 'success', sapStatusCode: 'RARO' })
    })

    it('usa ENDTIME_ONLY cuando ni siquiera hay código', () => {
      const ns = running()
      applyTaskResult(ns, { code: '', endTime: '20260101010000' }, 'stop', 0, 30)
      expect(ns).toMatchObject({ status: 'success', sapStatusCode: 'ENDTIME_ONLY' })
    })

    it.each(['job failed', 'Error al cargar', 'FAILURE detected'])(
      'marca error si el statusMsg dice "%s"', (statusMsg) => {
        const ns = running()
        applyTaskResult(ns, { code: 'RARO', endTime: '20260101010000', statusMsg }, 'stop', 0, 30)
        expect(ns.status).toBe('error')
        expect(ns.error).toContain('RARO')
      })

    it('no aplica el fallback a un código no terminal aunque haya endTime', () => {
      const ns = running()
      applyTaskResult(ns, { code: 'RUNNING', endTime: '20260101010000' }, 'stop', 0, 30)
      expect(ns.status).toBe('running')
    })
  })

  it('tolera un sapStatus nulo sin romper', () => {
    const ns = running()
    expect(() => applyTaskResult(ns, null, 'stop', 0, 30)).not.toThrow()
    expect(ns.status).toBe('running')
  })
})
