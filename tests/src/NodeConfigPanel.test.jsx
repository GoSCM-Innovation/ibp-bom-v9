// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import NodeConfigPanel from '../../src/components/Orchestrations/canvas/NodeConfigPanel.jsx'
import { soapCall } from '../../src/api/soapCall.js'

vi.mock('../../src/api/soapCall.js', () => ({ soapCall: vi.fn() }))

const CONNECTION = { hciUrl: 'https://sap.test/webservices', orgName: 'org' }
const SESSION = 'SID-1'

const taskNode = (data = {}) => ({
  id: 'n1', type: 'orchTask',
  data: { taskName: 'CARGA', label: '', ...data },
})
const groupNode = (data = {}) => ({ id: 'g1', type: 'orchGroup', data: { label: 'Grupo', ...data } })

function setup(node = taskNode(), props = {}) {
  const onUpdate = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <NodeConfigPanel
      node={node} connection={CONNECTION} sessionId={SESSION}
      onUpdate={onUpdate} onClose={onClose} {...props}
    />,
  )
  return { onUpdate, onClose, ...view }
}

const labelInput = () => screen.getByPlaceholderText(/CARGA|Nombre del nodo/)
const saveBtn = () => screen.getByText(/Guardar/)
const strategySelect = () => screen.getByText('En caso de error').parentElement.querySelector('select')

// Las variables globales que SAP reporta para el task.
const withVars = (vars) => {
  soapCall.mockImplementation(async (_c, _s, op) => {
    if (op === 'getTaskInfo') return { globalVariables: vars }
    return []
  })
}

beforeEach(() => {
  soapCall.mockReset()
  soapCall.mockResolvedValue({ globalVariables: [] })
  // Bajo Vitest DEV es true, lo que dispara la rama de debug con una llamada extra.
  vi.stubEnv('DEV', false)
})

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('NodeConfigPanel · render base', () => {
  it('no renderiza nada sin nodo', () => {
    const { container } = render(<NodeConfigPanel node={null} onUpdate={() => {}} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('deja de renderizar si el nodo pasa a null estando montado', () => {
    const { rerender } = setup(taskNode())
    expect(() => rerender(
      <NodeConfigPanel node={null} connection={CONNECTION} sessionId={SESSION}
        onUpdate={() => {}} onClose={() => {}} />,
    )).not.toThrow()
    expect(screen.queryByText('Nombre visible')).toBeNull()
  })

  it('muestra la cabecera con el tipo y el nombre del task', () => {
    setup()
    expect(screen.getByText('⬡ Task')).toBeTruthy()
    expect(screen.getByText('CARGA')).toBeTruthy()
  })

  it('marca los grupos en la cabecera', () => {
    setup(groupNode())
    expect(screen.getByText('⊞ Grupo')).toBeTruthy()
  })

  it('en modo sheet omite la cabecera propia', () => {
    setup(taskNode(), { presentation: 'sheet' })
    expect(screen.queryByText('⬡ Task')).toBeNull()
    expect(screen.getByText('Nombre visible')).toBeTruthy()
  })

  it('cierra con la X de la cabecera', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByText('×'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('NodeConfigPanel · grupo vs task', () => {
  it('el grupo explica el orden y no ofrece estrategia de error', () => {
    setup(groupNode())
    expect(screen.getByText(/El orden lo determinan los edges/)).toBeTruthy()
    expect(screen.queryByText('En caso de error')).toBeNull()
  })

  it('el grupo no consulta variables a SAP', () => {
    setup(groupNode())
    expect(soapCall).not.toHaveBeenCalled()
  })

  it('el task ofrece las tres estrategias', () => {
    setup()
    const opciones = [...strategySelect().options].map(o => o.value)
    expect(opciones).toEqual(['stop', 'continue', 'retry'])
  })
})

describe('NodeConfigPanel · formulario', () => {
  it('precarga los valores del nodo', () => {
    setup(taskNode({ label: 'Mi paso', errorStrategy: 'continue' }))
    expect(labelInput().value).toBe('Mi paso')
    expect(strategySelect().value).toBe('continue')
  })

  it('usa stop por defecto', () => {
    setup()
    expect(strategySelect().value).toBe('stop')
  })

  it('los campos de reintento solo aparecen con la estrategia retry', () => {
    setup()
    expect(screen.queryByText('Máx reintentos')).toBeNull()

    fireEvent.change(strategySelect(), { target: { value: 'retry' } })

    expect(screen.getByText('Máx reintentos')).toBeTruthy()
    expect(screen.getByText('Espera (seg)')).toBeTruthy()
  })

  it('marca el formulario como sucio al editar', () => {
    setup()
    expect(saveBtn().textContent).toBe('✓ Guardar')
    fireEvent.change(labelInput(), { target: { value: 'Nuevo' } })
    expect(saveBtn().textContent).toBe('✓ Guardar cambios')
  })

  it('reinicia el formulario al cambiar de nodo', () => {
    const { rerender } = setup(taskNode({ label: 'Primero' }))
    fireEvent.change(labelInput(), { target: { value: 'Editado' } })
    expect(saveBtn().textContent).toBe('✓ Guardar cambios')

    rerender(
      <NodeConfigPanel
        node={{ id: 'n2', type: 'orchTask', data: { taskName: 'OTRA', label: 'Segundo' } }}
        connection={CONNECTION} sessionId={SESSION} onUpdate={() => {}} onClose={() => {}} />,
    )

    expect(screen.getByDisplayValue('Segundo')).toBeTruthy()
    expect(saveBtn().textContent).toBe('✓ Guardar')
  })
})

describe('NodeConfigPanel · guardar y eliminar', () => {
  it('guarda los valores normalizados', () => {
    const { onUpdate } = setup(taskNode({ label: 'Mi paso', errorStrategy: 'retry', maxRetries: 3, retryDelaySec: 60 }))
    fireEvent.click(saveBtn())

    expect(onUpdate).toHaveBeenCalledWith('n1', {
      label: 'Mi paso', errorStrategy: 'retry',
      maxRetries: 3, retryDelaySec: 60, globalVariables: [],
    })
  })

  it('cae al taskName cuando el label queda vacio', () => {
    const { onUpdate } = setup(taskNode({ label: '' }))
    fireEvent.click(saveBtn())
    expect(onUpdate.mock.calls[0][1].label).toBe('CARGA')
  })

  it('usa "Sin nombre" cuando no hay label ni taskName', () => {
    const { onUpdate } = setup({ id: 'n1', type: 'orchTask', data: {} })
    fireEvent.click(saveBtn())
    expect(onUpdate.mock.calls[0][1].label).toBe('Sin nombre')
  })

  it('limpia el estado sucio al guardar', () => {
    setup()
    fireEvent.change(labelInput(), { target: { value: 'Nuevo' } })
    fireEvent.click(saveBtn())
    expect(saveBtn().textContent).toBe('✓ Guardar')
  })

  it('eliminar avisa con null y cierra el panel', () => {
    const { onUpdate, onClose } = setup()
    fireEvent.click(screen.getByText('Eliminar nodo'))
    expect(onUpdate).toHaveBeenCalledWith('n1', null)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('NodeConfigPanel · carga de variables desde SAP', () => {
  it('pide getTaskInfo con el guid del nodo', async () => {
    withVars([{ name: 'V1', description: 'primera' }])
    setup(taskNode({ taskGuid: 'G-1' }))

    await waitFor(() => expect(screen.getByText(/1 disponibles/)).toBeTruthy())
    expect(soapCall).toHaveBeenCalledWith(CONNECTION, SESSION, 'getTaskInfo', { taskGuid: 'G-1' })
  })

  // Sin guid, se resuelve por nombre exacto con searchTasks.
  it('resuelve el guid por nombre cuando el nodo no lo trae', async () => {
    soapCall.mockImplementation(async (_c, _s, op) => {
      if (op === 'searchTasks') return [{ taskName: 'OTRA', taskGuid: 'G-X' }, { taskName: 'CARGA', taskGuid: 'G-1' }]
      if (op === 'getTaskInfo') return { globalVariables: [{ name: 'V1' }] }
      return []
    })
    setup(taskNode())

    await waitFor(() => expect(screen.getByText(/1 disponibles/)).toBeTruthy())
    expect(soapCall).toHaveBeenCalledWith(CONNECTION, SESSION, 'searchTasks', { nameFilter: 'CARGA' })
    expect(soapCall).toHaveBeenCalledWith(CONNECTION, SESSION, 'getTaskInfo', { taskGuid: 'G-1' })
  })

  it('queda en error si el nombre no resuelve a ningun guid', async () => {
    soapCall.mockImplementation(async (_c, _s, op) => (op === 'searchTasks' ? [] : {}))
    setup(taskNode())
    await waitFor(() => expect(screen.getByText('Error SAP')).toBeTruthy())
    expect(screen.getByText(/error al cargar/)).toBeTruthy()
  })

  it('queda en error si SAP falla', async () => {
    soapCall.mockRejectedValue(new Error('SESSION_EXPIRED'))
    setup(taskNode({ taskGuid: 'G-1' }))
    await waitFor(() => expect(screen.getByText('Error SAP')).toBeTruthy())
  })

  it('no consulta nada si el nodo no tiene guid ni nombre', () => {
    setup({ id: 'n1', type: 'orchTask', data: {} })
    expect(soapCall).not.toHaveBeenCalled()
  })

  it('no consulta nada sin conexion', () => {
    setup(taskNode({ taskGuid: 'G-1' }), { connection: null })
    expect(soapCall).not.toHaveBeenCalled()
  })

  it('avisa cuando el task no tiene variables en SAP', async () => {
    withVars([])
    setup(taskNode({ taskGuid: 'G-1' }))
    await waitFor(() => expect(screen.getByText(/no tiene variables globales/)).toBeTruthy())
  })
})

describe('NodeConfigPanel · edicion de variables', () => {
  const conVariables = async (nodeData = {}) => {
    withVars([
      { name: 'FECHA', description: 'fecha de corte', defaultValue: '20260101' },
      { name: 'PLANTA' },
    ])
    const r = setup(taskNode({ taskGuid: 'G-1', ...nodeData }))
    await waitFor(() => expect(screen.getByText(/2 disponibles/)).toBeTruthy())
    return r
  }

  it('el boton de agregar solo aparece con variables disponibles', async () => {
    withVars([])
    setup(taskNode({ taskGuid: 'G-1' }))
    await waitFor(() => expect(screen.getByText(/0 disponibles/)).toBeTruthy())
    expect(screen.queryByText('+ Variable')).toBeNull()
  })

  it('agrega una fila vacia', async () => {
    await conVariables()
    fireEvent.click(screen.getByText('+ Variable'))
    const selects = screen.getAllByRole('combobox')
    // El primero es la estrategia de error; el segundo, la variable recien creada.
    expect(selects).toHaveLength(2)
    expect(selects[1].value).toBe('')
  })

  it('lista las variables de SAP con su descripcion', async () => {
    await conVariables()
    fireEvent.click(screen.getByText('+ Variable'))
    const opciones = [...screen.getAllByRole('combobox')[1].options].map(o => o.textContent)
    expect(opciones).toContain('FECHA — fecha de corte')
    expect(opciones).toContain('PLANTA')
  })

  it('al elegir una variable precarga su defaultValue', async () => {
    await conVariables()
    fireEvent.click(screen.getByText('+ Variable'))
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'FECHA' } })
    expect(screen.getByDisplayValue('20260101')).toBeTruthy()
  })

  it('deja el valor vacio si la variable elegida no tiene default', async () => {
    await conVariables({ globalVariables: [{ name: 'FECHA', value: 'algo' }] })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'PLANTA' } })
    expect(screen.queryByDisplayValue('algo')).toBeNull()
  })

  it('conserva una variable preexistente que ya no esta en SAP', async () => {
    await conVariables({ globalVariables: [{ name: 'VIEJA', value: 'x' }] })
    const opciones = [...screen.getAllByRole('combobox')[1].options].map(o => o.value)
    expect(opciones).toContain('VIEJA')
  })

  it('elimina una fila', async () => {
    await conVariables({ globalVariables: [{ name: 'FECHA', value: 'x' }] })
    const fila = screen.getByDisplayValue('x').parentElement
    fireEvent.click(within(fila).getByText('×'))
    expect(screen.queryByDisplayValue('x')).toBeNull()
  })

  it('descarta al guardar las variables sin nombre', async () => {
    const { onUpdate } = await conVariables({ globalVariables: [{ name: 'FECHA', value: '1' }] })
    fireEvent.click(screen.getByText('+ Variable'))
    fireEvent.click(saveBtn())

    expect(onUpdate.mock.calls[0][1].globalVariables).toEqual([{ name: 'FECHA', value: '1' }])
  })
})
