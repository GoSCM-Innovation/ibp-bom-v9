// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TaskNode from '../../src/components/Orchestrations/canvas/TaskNode.jsx'
import { PromotedTasksContext } from '../../src/hooks/usePromotedTasks.js'
import { STATUS_ICONS } from '../../src/components/Orchestrations/canvasUtils.js'

// Los Handle de React Flow necesitan el provider del canvas; para probar el
// contenido del nodo alcanza con neutralizarlos.
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}))

afterEach(cleanup)

function setup(data = {}, { promoted = null, selected = false, id = 'n1' } = {}) {
  return render(
    <PromotedTasksContext.Provider value={promoted}>
      <TaskNode id={id} selected={selected} data={{ taskName: 'CARGA', ...data }} />
    </PromotedTasksContext.Provider>,
  )
}

describe('TaskNode · identificacion', () => {
  it('muestra el label cuando existe', () => {
    setup({ label: 'Mi paso', taskName: 'CARGA' })
    expect(screen.getByText('Mi paso')).toBeTruthy()
  })

  it('cae al taskName cuando no hay label', () => {
    setup({ taskName: 'CARGA' })
    expect(screen.getByText('CARGA')).toBeTruthy()
  })
})

describe('TaskNode · estado de ejecucion', () => {
  it('usa el icono de pending por defecto', () => {
    setup()
    expect(screen.getByText(STATUS_ICONS.pending)).toBeTruthy()
  })

  it.each([
    ['running', STATUS_ICONS.running],
    ['success', STATUS_ICONS.success],
    ['success_with_errors', STATUS_ICONS.success_with_errors],
    ['error', STATUS_ICONS.error],
    ['cancelled', STATUS_ICONS.cancelled],
    ['skipped', STATUS_ICONS.skipped],
  ])('muestra el icono de %s', (runStatus, icon) => {
    setup({ runStatus })
    expect(screen.getByText(icon)).toBeTruthy()
  })

  it('muestra el mensaje de error cuando lo hay', () => {
    setup({ runStatus: 'error', error: 'SAP: ERROR - tabla bloqueada' })
    expect(screen.getByText('SAP: ERROR - tabla bloqueada')).toBeTruthy()
  })

  it('no muestra bloque de error cuando no lo hay', () => {
    setup({ runStatus: 'success' })
    expect(screen.queryByText(/SAP:/)).toBeNull()
  })
})

describe('TaskNode · estrategia de error', () => {
  it('muestra detener por defecto', () => {
    setup()
    expect(screen.getByText('error: detener')).toBeTruthy()
  })

  it.each([
    ['stop', 'error: detener'],
    ['continue', 'error: continuar'],
    ['retry', 'error: reintentar'],
  ])('muestra la etiqueta de %s', (errorStrategy, label) => {
    setup({ errorStrategy })
    expect(screen.getByText(new RegExp(label))).toBeTruthy()
  })

  it('agrega el multiplicador de reintentos solo en retry', () => {
    setup({ errorStrategy: 'retry', maxRetries: 3 })
    expect(screen.getByText(/error: reintentar ×3/)).toBeTruthy()
  })

  it('omite el multiplicador cuando maxRetries es 0', () => {
    setup({ errorStrategy: 'retry', maxRetries: 0 })
    expect(screen.getByText('error: reintentar')).toBeTruthy()
  })

  it('no agrega multiplicador si la estrategia no es retry', () => {
    setup({ errorStrategy: 'continue', maxRetries: 3 })
    expect(screen.getByText('error: continuar')).toBeTruthy()
  })
})

describe('TaskNode · detalles', () => {
  it('muestra agente y perfil cuando estan definidos', () => {
    setup({ agentName: 'AG1', profileName: 'PRF1' })
    expect(screen.getByText('agent: AG1')).toBeTruthy()
    expect(screen.getByText('profile: PRF1')).toBeTruthy()
  })

  it('omite la fila cuando no hay ni agente ni perfil', () => {
    setup()
    expect(screen.queryByText(/agent:/)).toBeNull()
    expect(screen.queryByText(/profile:/)).toBeNull()
  })

  it('cuenta solo las variables con nombre', () => {
    setup({ globalVariables: [{ name: 'V1' }, { name: '' }, { name: 'V2' }] })
    expect(screen.getByText('vars: 2')).toBeTruthy()
  })

  it('omite el contador cuando no hay variables con nombre', () => {
    setup({ globalVariables: [{ name: '' }] })
    expect(screen.queryByText(/vars:/)).toBeNull()
  })

  it('muestra los ultimos 6 digitos del runId de SAP', () => {
    setup({ sapRunId: '9876543210' })
    expect(screen.getByText('#543210')).toBeTruthy()
  })

  it('muestra el runId completo si es mas corto que 6', () => {
    setup({ sapRunId: '42' })
    expect(screen.getByText('#42')).toBeTruthy()
  })
})

describe('TaskNode · badge de promovido', () => {
  it('marca PRD cuando la task esta en el repositorio productivo', () => {
    setup({ taskName: 'CARGA' }, { promoted: new Set(['CARGA']) })
    expect(screen.getByText('PRD')).toBeTruthy()
  })

  it('compara sin distinguir mayusculas', () => {
    setup({ taskName: 'carga' }, { promoted: new Set(['CARGA']) })
    expect(screen.getByText('PRD')).toBeTruthy()
  })

  it('no marca cuando la task no esta promovida', () => {
    setup({ taskName: 'OTRA' }, { promoted: new Set(['CARGA']) })
    expect(screen.queryByText('PRD')).toBeNull()
  })

  it('no marca cuando el set no esta disponible', () => {
    setup({ taskName: 'CARGA' }, { promoted: null })
    expect(screen.queryByText('PRD')).toBeNull()
  })
})

describe('TaskNode · interaccion', () => {
  it('selecciona el nodo al hacer click', () => {
    const onSelect = vi.fn()
    setup({ onSelect }, { id: 'n42' })
    fireEvent.click(screen.getByText('CARGA'))
    expect(onSelect).toHaveBeenCalledWith('n42')
  })

  it('no rompe si no hay handler de seleccion', () => {
    setup()
    expect(() => fireEvent.click(screen.getByText('CARGA'))).not.toThrow()
  })

  // El boton de ejecucion individual solo aparece con el puntero encima.
  it('revela el boton de ejecutar solo al pasar el puntero', () => {
    const onRunSingle = vi.fn()
    const { container } = setup({ onRunSingle })
    expect(screen.queryByTitle('Ejecutar solo este task')).toBeNull()

    fireEvent.mouseEnter(container.firstChild)
    expect(screen.getByTitle('Ejecutar solo este task')).toBeTruthy()

    fireEvent.mouseLeave(container.firstChild)
    expect(screen.queryByTitle('Ejecutar solo este task')).toBeNull()
  })

  it('ejecuta el task sin seleccionar el nodo', () => {
    const onRunSingle = vi.fn()
    const onSelect = vi.fn()
    const { container } = setup({ onRunSingle, onSelect }, { id: 'n7' })

    fireEvent.mouseEnter(container.firstChild)
    fireEvent.click(screen.getByTitle('Ejecutar solo este task'))

    expect(onRunSingle).toHaveBeenCalledWith('n7')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('no ofrece el boton si no hay handler', () => {
    const { container } = setup()
    fireEvent.mouseEnter(container.firstChild)
    expect(screen.queryByTitle('Ejecutar solo este task')).toBeNull()
  })
})
