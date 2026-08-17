import { describe, it, expect } from 'vitest'
import {
  validateStep, validateNode, validateNodeData, validateEdge,
} from '../../api/orchestrations.js'

describe('validateStep', () => {
  it('exige taskName', () => {
    expect(() => validateStep({})).toThrow('taskName requerido en cada step')
    expect(() => validateStep({ taskName: '   ' })).toThrow('taskName requerido en cada step')
  })

  it('recorta el taskName', () => {
    expect(validateStep({ taskName: '  T1  ' }).taskName).toBe('T1')
  })

  it('genera un id cuando no viene', () => {
    expect(validateStep({ taskName: 'T1' }).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('conserva el id existente', () => {
    expect(validateStep({ id: 'fijo', taskName: 'T1' }).id).toBe('fijo')
  })

  it('aplica los valores por defecto', () => {
    expect(validateStep({ taskName: 'T1' })).toMatchObject({
      agentName: null, profileName: null, globalVariables: [],
      errorStrategy: 'stop', maxRetries: 0, retryDelaySec: 30,
    })
  })

  it.each(['stop', 'continue', 'retry'])('acepta la estrategia %s', (errorStrategy) => {
    expect(validateStep({ taskName: 'T1', errorStrategy }).errorStrategy).toBe(errorStrategy)
  })

  it('rechaza una estrategia desconocida', () => {
    expect(() => validateStep({ taskName: 'T1', errorStrategy: 'explotar' }))
      .toThrow('errorStrategy debe ser: stop, continue o retry')
  })

  it.each([
    [10, 5], [-3, 0], [2.7, 2], ['3', 3],
  ])('limita maxRetries %s a %s', (input, expected) => {
    expect(validateStep({ taskName: 'T1', maxRetries: input }).maxRetries).toBe(expected)
  })

  it.each([
    [99999, 3600], [-5, 0], [60, 60],
  ])('limita retryDelaySec %s a %s', (input, expected) => {
    expect(validateStep({ taskName: 'T1', retryDelaySec: input }).retryDelaySec).toBe(expected)
  })

  it('coacciona las variables globales a strings', () => {
    const step = validateStep({
      taskName: 'T1',
      globalVariables: [{ name: 'V1', value: 42 }, { name: 'V2' }],
    })
    expect(step.globalVariables).toEqual([
      { name: 'V1', value: '42' },
      { name: 'V2', value: '' },
    ])
  })

  it('normaliza globalVariables no-array a lista vacía', () => {
    expect(validateStep({ taskName: 'T1', globalVariables: 'nada' }).globalVariables).toEqual([])
  })
})

describe('validateNodeData', () => {
  it('aplica los valores por defecto sin datos', () => {
    expect(validateNodeData()).toEqual({
      taskName: null, taskGuid: null, taskType: null, label: 'Sin nombre',
      agentName: null, profileName: null, globalVariables: [],
      errorStrategy: 'stop', maxRetries: 0, retryDelaySec: 30,
      executionMode: 'parallel', children: [], runStatus: undefined,
    })
  })

  it('usa el taskName como label cuando no hay label', () => {
    expect(validateNodeData({ taskName: 'T1' }).label).toBe('T1')
  })

  it('prefiere el label explícito', () => {
    expect(validateNodeData({ taskName: 'T1', label: 'Mi paso' }).label).toBe('Mi paso')
  })

  it('cae a stop ante una estrategia inválida en vez de lanzar', () => {
    expect(validateNodeData({ errorStrategy: 'explotar' }).errorStrategy).toBe('stop')
  })

  it('solo acepta serial como alternativa a parallel', () => {
    expect(validateNodeData({ executionMode: 'serial' }).executionMode).toBe('serial')
    expect(validateNodeData({ executionMode: 'cualquiera' }).executionMode).toBe('parallel')
  })

  it('limita maxRetries y retryDelaySec', () => {
    expect(validateNodeData({ maxRetries: 99 }).maxRetries).toBe(5)
    expect(validateNodeData({ retryDelaySec: 99999 }).retryDelaySec).toBe(3600)
  })

  it('descarta el runStatus que venga del cliente', () => {
    expect(validateNodeData({ runStatus: 'success' }).runStatus).toBeUndefined()
  })
})

describe('validateNode', () => {
  it('exige id', () => {
    expect(() => validateNode({ type: 'task' })).toThrow('Cada nodo requiere id')
  })

  it('normaliza los tipos internos de React Flow', () => {
    expect(validateNode({ id: 'a', type: 'orchTask' }).type).toBe('task')
    expect(validateNode({ id: 'a', type: 'orchGroup' }).type).toBe('group')
  })

  it('acepta los tipos de almacenamiento tal cual', () => {
    expect(validateNode({ id: 'a', type: 'task' }).type).toBe('task')
    expect(validateNode({ id: 'a', type: 'group' }).type).toBe('group')
  })

  it('rechaza un tipo desconocido', () => {
    expect(() => validateNode({ id: 'a', type: 'raro' })).toThrow('Tipo de nodo inválido: raro')
  })

  it('coacciona la posición a números y usa 0 por defecto', () => {
    expect(validateNode({ id: 'a', type: 'task' }).position).toEqual({ x: 0, y: 0 })
    expect(validateNode({ id: 'a', type: 'task', position: { x: '10', y: '20' } }).position)
      .toEqual({ x: 10, y: 20 })
  })

  it('fija extent parent solo cuando hay parentId', () => {
    expect(validateNode({ id: 'a', type: 'task', parentId: 'g1' }))
      .toMatchObject({ parentId: 'g1', extent: 'parent' })
    expect(validateNode({ id: 'a', type: 'task' }).extent).toBeUndefined()
  })

  it('conserva el style cuando existe', () => {
    expect(validateNode({ id: 'g', type: 'group', style: { width: 320 } }).style)
      .toEqual({ width: 320 })
    expect(validateNode({ id: 'g', type: 'group' }).style).toBeUndefined()
  })

  it('valida también el data del nodo', () => {
    expect(validateNode({ id: 'a', type: 'task', data: { taskName: 'T1' } }).data)
      .toMatchObject({ taskName: 'T1', label: 'T1', errorStrategy: 'stop' })
  })
})

describe('validateEdge', () => {
  it('acepta un edge completo y descarta campos extra', () => {
    expect(validateEdge({ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }))
      .toEqual({ id: 'e1', source: 'a', target: 'b' })
  })

  it.each([
    [{ source: 'a', target: 'b' }, 'sin id'],
    [{ id: 'e1', target: 'b' }, 'sin source'],
    [{ id: 'e1', source: 'a' }, 'sin target'],
  ])('rechaza un edge %#: %s', (edge) => {
    expect(() => validateEdge(edge)).toThrow('Cada edge requiere id, source y target')
  })
})
