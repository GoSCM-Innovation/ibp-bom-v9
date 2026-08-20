// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MobileTaskPicker from '../../src/components/Orchestrations/mobile/MobileTaskPicker.jsx'

// TaskPalette carga las tasks desde SAP; acá solo interesa el contrato de
// seleccion, asi que se sustituye por una lista simple.
vi.mock('../../src/components/Orchestrations/panel/TaskPalette.jsx', () => ({
  default: ({ selectedKeys, onToggleSelect }) => (
    <div>
      {['CARGA', 'BORRADO'].map(taskName => (
        <button
          key={taskName}
          onClick={() => onToggleSelect({ taskName, taskGuid: `guid-${taskName}` })}
        >
          {taskName}{selectedKeys.has(`guid-${taskName}`) ? ' ✓' : ''}
        </button>
      ))}
    </div>
  ),
}))

afterEach(cleanup)

function setup(props = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <MobileTaskPicker open onClose={onClose} connection={{}} sessionId="SID" onConfirm={onConfirm} {...props} />,
  )
  return { onConfirm, onClose, ...view }
}

const confirmBtn = () => screen.getByRole('button', { name: /Seleccioná|Añadir \d/ })

describe('MobileTaskPicker · seleccion', () => {
  it('arranca sin nada seleccionado y con el boton deshabilitado', () => {
    setup()
    expect(confirmBtn().disabled).toBe(true)
    expect(confirmBtn().textContent).toBe('Seleccioná al menos una task')
  })

  it('selecciona y refleja el conteo', () => {
    setup()
    fireEvent.click(screen.getByText('CARGA'))
    expect(confirmBtn().textContent).toBe('Añadir 1 task')

    fireEvent.click(screen.getByText('BORRADO'))
    expect(confirmBtn().textContent).toBe('Añadir 2 tasks')
  })

  it('deselecciona al volver a tocar', () => {
    setup()
    fireEvent.click(screen.getByText('CARGA'))
    fireEvent.click(screen.getByText('CARGA ✓'))
    expect(confirmBtn().disabled).toBe(true)
  })

  it('menciona el modo paralelo en la etiqueta', () => {
    setup({ mode: 'parallel' })
    fireEvent.click(screen.getByText('CARGA'))
    expect(confirmBtn().textContent).toBe('Añadir 1 task en paralelo')
  })

  it('titula segun el modo', () => {
    setup({ mode: 'parallel' })
    expect(screen.getByText('Añadir tasks en paralelo')).toBeTruthy()
    cleanup()
    setup()
    expect(screen.getByText('Añadir tasks')).toBeTruthy()
  })
})

describe('MobileTaskPicker · confirmacion', () => {
  it('devuelve las tasks elegidas y cierra', () => {
    const { onConfirm, onClose } = setup()
    fireEvent.click(screen.getByText('CARGA'))
    fireEvent.click(confirmBtn())

    expect(onConfirm).toHaveBeenCalledWith([{ taskName: 'CARGA', taskGuid: 'guid-CARGA' }])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('no hace nada sin seleccion', () => {
    const { onConfirm, onClose } = setup()
    fireEvent.click(confirmBtn())
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('MobileTaskPicker · ciclo de vida', () => {
  // La seleccion ya no se limpia por efecto: el padre lo monta solo mientras
  // esta abierto, asi que cada apertura empieza con estado nuevo.
  it('cada montaje arranca con la seleccion vacia', () => {
    const primera = setup()
    fireEvent.click(screen.getByText('CARGA'))
    expect(confirmBtn().textContent).toBe('Añadir 1 task')
    primera.unmount()

    setup()
    expect(confirmBtn().disabled).toBe(true)
  })

  it('con open en false no renderiza contenido', () => {
    const { container } = setup({ open: false })
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('CARGA')).toBeNull()
  })
})
