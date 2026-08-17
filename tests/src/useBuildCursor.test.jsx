// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useBuildCursor } from '../../src/components/Orchestrations/mobile/useBuildCursor.js'

afterEach(cleanup)

// El hook es controlado: onChange devuelve el grafo nuevo y el caller lo reinyecta.
// Este harness replica ese ciclo para poder encadenar operaciones.
function setupCursor(initial = { nodes: [], edges: [] }) {
  const state = { nodes: initial.nodes, edges: initial.edges }
  const onChange = vi.fn((nodes, edges) => { state.nodes = nodes; state.edges = edges })
  const view = renderHook(
    ({ nodes, edges }) => useBuildCursor({ nodes, edges, onChange }),
    { initialProps: state },
  )
  const sync = () => view.rerender({ nodes: state.nodes, edges: state.edges })
  const run = fn => { act(() => { fn(view.result.current) }); sync() }
  return { state, onChange, result: view.result, run }
}

const task = name => ({ taskName: name, taskGuid: `guid-${name}`, type: 'batch' })
const edgePairs = state => state.edges.map(e => [e.source, e.target])
const idOf = (state, taskName) => state.nodes.find(n => n.data?.taskName === taskName)?.id

describe('useBuildCursor · estado inicial', () => {
  it('arranca en el contexto raíz sin poder deshacer ni cerrar', () => {
    const { result } = setupCursor()
    expect(result.current.cursorPath).toEqual([null])
    expect(result.current.currentContext).toBeNull()
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canClose).toBe(false)
  })
})

describe('addTasksSequential', () => {
  it('agrega una task suelta sin edges', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]).toMatchObject({ type: 'task', position: { x: 0, y: 0 } })
    expect(state.nodes[0].data).toMatchObject({
      taskName: 'A', taskGuid: 'guid-A', taskType: 'batch', label: 'A',
      errorStrategy: 'stop', maxRetries: 1, retryDelaySec: 30, globalVariables: [],
    })
    expect(state.edges).toEqual([])
  })

  it('encadena las tasks de una misma llamada', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential([task('A'), task('B'), task('C')]))
    expect(edgePairs(state)).toEqual([
      [idOf(state, 'A'), idOf(state, 'B')],
      [idOf(state, 'B'), idOf(state, 'C')],
    ])
  })

  it('encadena desde la última hoja en llamadas sucesivas', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.addTasksSequential(task('B')))
    expect(edgePairs(state)).toEqual([[idOf(state, 'A'), idOf(state, 'B')]])
  })

  it('ignora una lista vacía', () => {
    const { onChange, run } = setupCursor()
    run(c => c.addTasksSequential([]))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('addTasksParallel', () => {
  it('agrega las tasks sin crear edges', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksParallel([task('A'), task('B')]))
    expect(state.nodes).toHaveLength(2)
    expect(state.edges).toEqual([])
  })

  it('no conecta con la hoja previa', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.addTasksParallel(task('B')))
    expect(state.edges).toEqual([])
  })

  it('ignora una lista vacía', () => {
    const { onChange, run } = setupCursor()
    run(c => c.addTasksParallel([]))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('openGroup y closeBranch', () => {
  it('crea el grupo y mueve el cursor adentro', () => {
    const { state, result, run } = setupCursor()
    run(c => c.openGroup())

    const group = state.nodes[0]
    expect(group).toMatchObject({ type: 'group', data: { label: 'Grupo' } })
    expect(result.current.cursorPath).toEqual([null, group.id])
    expect(result.current.currentContext).toBe(group.id)
    expect(result.current.canClose).toBe(true)
  })

  it('conecta el grupo con la hoja previa del contexto', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.openGroup())
    const group = state.nodes.find(n => n.type === 'group')
    expect(edgePairs(state)).toEqual([[idOf(state, 'A'), group.id]])
  })

  it('agrega las tasks dentro del grupo cuando el cursor está adentro', () => {
    const { state, run } = setupCursor()
    run(c => c.openGroup())
    const group = state.nodes[0]
    run(c => c.addTasksSequential([task('A'), task('B')]))

    const hijos = state.nodes.filter(n => n.parentId === group.id)
    expect(hijos).toHaveLength(2)
    expect(hijos.every(n => n.extent === 'parent')).toBe(true)
    expect(edgePairs(state)).toEqual([[idOf(state, 'A'), idOf(state, 'B')]])
  })

  it('closeBranch vuelve al contexto padre', () => {
    const { result, run } = setupCursor()
    run(c => c.openGroup())
    run(c => c.closeBranch())
    expect(result.current.cursorPath).toEqual([null])
    expect(result.current.canClose).toBe(false)
  })

  it('closeBranch en la raíz no hace nada', () => {
    const { result, run } = setupCursor()
    run(c => c.closeBranch())
    expect(result.current.cursorPath).toEqual([null])
  })

  it('permite anidar grupos', () => {
    const { state, result, run } = setupCursor()
    run(c => c.openGroup())
    const externo = state.nodes[0]
    run(c => c.openGroup())
    const interno = state.nodes.find(n => n.id !== externo.id)

    expect(result.current.cursorPath).toEqual([null, externo.id, interno.id])
    expect(interno.parentId).toBe(externo.id)
  })

  it('al cerrar el grupo la siguiente task se encadena en el contexto padre', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.openGroup())
    const group = state.nodes.find(n => n.type === 'group')
    run(c => c.closeBranch())
    run(c => c.addTasksSequential(task('B')))

    // La hoja del contexto raíz es el grupo, no la task A.
    expect(edgePairs(state)).toContainEqual([group.id, idOf(state, 'B')])
  })
})

describe('undo', () => {
  it('deshace la última operación', () => {
    const { state, result, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    expect(result.current.canUndo).toBe(true)

    run(c => c.undo())

    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(result.current.canUndo).toBe(false)
  })

  it('deshace de a un paso por vez', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.addTasksSequential(task('B')))
    run(c => c.undo())

    expect(state.nodes.map(n => n.data.taskName)).toEqual(['A'])
  })

  it('restaura también la posición del cursor', () => {
    const { result, run } = setupCursor()
    run(c => c.openGroup())
    expect(result.current.cursorPath).toHaveLength(2)

    run(c => c.undo())

    expect(result.current.cursorPath).toEqual([null])
  })

  it('sin nada que deshacer no llama a onChange', () => {
    const { onChange, run } = setupCursor()
    run(c => c.undo())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('vuelve a encadenar desde la hoja correcta después de deshacer', () => {
    const { state, run } = setupCursor()
    run(c => c.addTasksSequential(task('A')))
    run(c => c.addTasksSequential(task('B')))
    run(c => c.undo())
    run(c => c.addTasksSequential(task('C')))

    expect(edgePairs(state)).toEqual([[idOf(state, 'A'), idOf(state, 'C')]])
  })
})

describe('setCursorToContext', () => {
  it('vuelve a la raíz con null', () => {
    const { result, run } = setupCursor()
    run(c => c.openGroup())
    run(c => c.setCursorToContext(null))
    expect(result.current.cursorPath).toEqual([null])
  })

  it('reconstruye la cadena de padres de un grupo anidado', () => {
    const { state, result, run } = setupCursor()
    run(c => c.openGroup())
    const externo = state.nodes[0]
    run(c => c.openGroup())
    const interno = state.nodes.find(n => n.id !== externo.id)
    run(c => c.setCursorToContext(null))

    run(c => c.setCursorToContext(interno.id))

    expect(result.current.cursorPath).toEqual([null, externo.id, interno.id])
    expect(result.current.currentContext).toBe(interno.id)
  })

  it('apunta a un grupo de primer nivel', () => {
    const { state, result, run } = setupCursor()
    run(c => c.openGroup())
    const group = state.nodes[0]
    run(c => c.setCursorToContext(null))

    run(c => c.setCursorToContext(group.id))

    expect(result.current.cursorPath).toEqual([null, group.id])
  })
})

describe('reconstrucción de la hoja desde un grafo existente', () => {
  it('encadena desde la hoja del grafo recibido por props', () => {
    const nodes = [
      { id: 'n1', type: 'task', position: { x: 0, y: 0 }, data: { taskName: 'A' } },
      { id: 'n2', type: 'task', position: { x: 0, y: 0 }, data: { taskName: 'B' } },
    ]
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    const { state, run } = setupCursor({ nodes, edges })

    run(c => c.addTasksSequential(task('C')))

    expect(edgePairs(state)).toContainEqual(['n2', idOf(state, 'C')])
  })

  it('mantiene hojas independientes por contexto', () => {
    const nodes = [
      { id: 'g1', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Grupo' } },
      { id: 'c1', type: 'task', parentId: 'g1', position: { x: 0, y: 0 }, data: { taskName: 'Hijo' } },
      { id: 'n1', type: 'task', position: { x: 0, y: 0 }, data: { taskName: 'Suelta' } },
    ]
    const { state, run } = setupCursor({ nodes, edges: [] })

    run(c => c.setCursorToContext('g1'))
    run(c => c.addTasksSequential(task('NuevoHijo')))

    expect(edgePairs(state)).toEqual([['c1', idOf(state, 'NuevoHijo')]])
  })
})
