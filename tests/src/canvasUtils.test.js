import { describe, it, expect } from 'vitest'
import {
  migrateStepsToGraph, computeWaves, autoLayout, hasCycle,
} from '../../src/components/Orchestrations/canvasUtils.js'

const node = (id, extra = {}) => ({ id, type: 'orchTask', position: { x: 0, y: 0 }, data: {}, ...extra })
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target })

describe('migrateStepsToGraph', () => {
  it('devuelve la orquestación intacta cuando ya tiene nodos', () => {
    const orch = { id: 'o1', nodes: [node('a')], edges: [], steps: [{ id: 's1' }] }
    expect(migrateStepsToGraph(orch)).toBe(orch)
  })

  it('agrega nodes y edges vacíos cuando no hay steps', () => {
    expect(migrateStepsToGraph({ id: 'o1' })).toEqual({ id: 'o1', nodes: [], edges: [] })
  })

  it('trata nodes vacío como no migrado', () => {
    const r = migrateStepsToGraph({ id: 'o1', nodes: [], steps: [{ id: 's1', taskName: 'T1' }] })
    expect(r.nodes).toHaveLength(1)
    expect(r._migrated).toBe(true)
  })

  it('convierte cada step en un nodo orchTask con runStatus pending', () => {
    const r = migrateStepsToGraph({ steps: [{ id: 's1', taskName: 'T1', errorStrategy: 'retry' }] })
    expect(r.nodes[0]).toMatchObject({ id: 's1', type: 'orchTask' })
    expect(r.nodes[0].data).toMatchObject({ taskName: 'T1', label: 'T1', errorStrategy: 'retry', runStatus: 'pending' })
  })

  it('encadena los steps en secuencia con edges smoothstep', () => {
    const steps = [{ id: 's1', taskName: 'A' }, { id: 's2', taskName: 'B' }, { id: 's3', taskName: 'C' }]
    const r = migrateStepsToGraph({ steps })
    expect(r.edges.map(e => [e.source, e.target])).toEqual([['s1', 's2'], ['s2', 's3']])
    expect(r.edges.every(e => e.type === 'smoothstep')).toBe(true)
  })

  it('no genera edges con un único step', () => {
    expect(migrateStepsToGraph({ steps: [{ id: 's1', taskName: 'A' }] }).edges).toEqual([])
  })

  it('apila los nodos verticalmente', () => {
    const r = migrateStepsToGraph({ steps: [{ id: 's1' }, { id: 's2' }] })
    expect(r.nodes[1].position.y - r.nodes[0].position.y).toBe(200)
    expect(r.nodes[0].position.x).toBe(r.nodes[1].position.x)
  })
})

describe('computeWaves', () => {
  it('pone en la columna 0 todo lo que no tiene entrada', () => {
    const { colOf, byCol, cols } = computeWaves([node('a'), node('b')], [])
    expect(colOf).toEqual({ a: 0, b: 0 })
    expect(byCol).toEqual({ 0: ['a', 'b'] })
    expect(cols).toBe(1)
  })

  it('asigna una columna por nivel en una cadena', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const { colOf, cols } = computeWaves(nodes, [edge('a', 'b'), edge('b', 'c')])
    expect(colOf).toEqual({ a: 0, b: 1, c: 2 })
    expect(cols).toBe(3)
  })

  it('agrupa las ramas paralelas de un diamante', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    const { byCol } = computeWaves(nodes, edges)
    expect(byCol).toEqual({ 0: ['a'], 1: ['b', 'c'], 2: ['d'] })
  })

  // Los hijos de un grupo se posicionan relativos a su padre, no en las olas globales.
  it('excluye los nodos que tienen parentId', () => {
    const nodes = [node('g1'), node('hijo', { parentId: 'g1' }), node('suelto')]
    const { colOf } = computeWaves(nodes, [])
    expect(Object.keys(colOf).sort()).toEqual(['g1', 'suelto'])
  })

  it('ignora los edges que referencian nodos desconocidos', () => {
    const { colOf } = computeWaves([node('a'), node('b')], [edge('fantasma', 'b'), edge('a', 'fantasma')])
    expect(colOf).toEqual({ a: 0, b: 0 })
  })

  it('deja fuera los nodos de un ciclo', () => {
    const nodes = [node('a'), node('b')]
    const { colOf, cols } = computeWaves(nodes, [edge('a', 'b'), edge('b', 'a')])
    expect(colOf).toEqual({})
    expect(cols).toBe(0)
  })

  it('devuelve estructura vacía sin nodos', () => {
    expect(computeWaves([], [])).toEqual({ colOf: {}, byCol: {}, cols: 0 })
  })
})

describe('autoLayout', () => {
  it('posiciona los nodos por columna y fila', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const laid = autoLayout(nodes, [edge('a', 'b'), edge('a', 'c')])
    const byId = Object.fromEntries(laid.map(n => [n.id, n.position]))
    expect(byId.a).toEqual({ x: 40, y: 60 })
    expect(byId.b.x).toBe(300)
    expect(byId.c.x).toBe(300)
    expect(byId.c.y).toBeGreaterThan(byId.b.y)
  })

  it('deja intactos los nodos hijos de un grupo', () => {
    const hijo = node('hijo', { parentId: 'g1', position: { x: 7, y: 9 } })
    const laid = autoLayout([node('g1'), hijo], [])
    expect(laid.find(n => n.id === 'hijo')).toBe(hijo)
  })

  it('conserva el resto de propiedades del nodo', () => {
    const [laid] = autoLayout([node('a', { data: { taskName: 'T1' } })], [])
    expect(laid.data).toEqual({ taskName: 'T1' })
    expect(laid.type).toBe('orchTask')
  })

  it('devuelve la misma cantidad de nodos', () => {
    const nodes = [node('a'), node('b'), node('c')]
    expect(autoLayout(nodes, [edge('a', 'b')])).toHaveLength(3)
  })
})

describe('hasCycle', () => {
  it('es false en un grafo sin edges', () => {
    expect(hasCycle([node('a'), node('b')], [])).toBe(false)
  })

  it('es false en una cadena y en un diamante', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    expect(hasCycle(nodes, [edge('a', 'b'), edge('b', 'c')])).toBe(false)
    expect(hasCycle(nodes, [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')])).toBe(false)
  })

  it('detecta un ciclo de dos nodos', () => {
    expect(hasCycle([node('a'), node('b')], [edge('a', 'b'), edge('b', 'a')])).toBe(true)
  })

  it('detecta un ciclo largo', () => {
    const nodes = [node('a'), node('b'), node('c')]
    expect(hasCycle(nodes, [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')])).toBe(true)
  })

  it('detecta un ciclo aunque haya nodos alcanzables fuera de él', () => {
    const nodes = [node('raiz'), node('a'), node('b')]
    expect(hasCycle(nodes, [edge('a', 'b'), edge('b', 'a')])).toBe(true)
  })

  it('ignora los hijos de un grupo', () => {
    const nodes = [node('g1'), node('hijo', { parentId: 'g1' })]
    expect(hasCycle(nodes, [edge('g1', 'hijo'), edge('hijo', 'g1')])).toBe(false)
  })

  it('es false sin nodos', () => {
    expect(hasCycle([], [])).toBe(false)
  })
})
