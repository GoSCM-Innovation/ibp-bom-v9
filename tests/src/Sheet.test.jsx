// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Sheet from '../../src/components/ui/Sheet.jsx'

afterEach(cleanup)

const open = (props = {}) => render(
  <Sheet open onClose={() => {}} title="Titulo" {...props}>
    <p>contenido</p>
  </Sheet>,
)

describe('Sheet · visibilidad', () => {
  it('no renderiza nada cuando open es false', () => {
    const { container } = render(<Sheet open={false} onClose={() => {}}>contenido</Sheet>)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('contenido')).toBeNull()
  })

  it('renderiza el contenido cuando open es true', () => {
    open()
    expect(screen.getByText('contenido')).toBeTruthy()
    expect(screen.getByText('Titulo')).toBeTruthy()
  })

  // Se monta con createPortal, no dentro del arbol del componente que lo invoca.
  it('monta en document.body via portal', () => {
    const { container } = open()
    expect(container.innerHTML).toBe('')
    expect(document.body.textContent).toContain('contenido')
  })

  it('omite la cabecera cuando no hay title ni onClose', () => {
    render(<Sheet open>{'solo contenido'}</Sheet>)
    expect(screen.queryByLabelText('Cerrar')).toBeNull()
  })

  it('renderiza el footer solo cuando se pasa', () => {
    open({ footer: <button>Guardar</button> })
    expect(screen.getByText('Guardar')).toBeTruthy()
    cleanup()
    open()
    expect(screen.queryByText('Guardar')).toBeNull()
  })
})

describe('Sheet · cierre', () => {
  it('cierra con el boton de cerrar', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra con la tecla Escape', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignora otras teclas', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('deja de escuchar Escape al desmontar', () => {
    const onClose = vi.fn()
    const { unmount } = open({ onClose })
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('no escucha Escape mientras esta cerrado', () => {
    const onClose = vi.fn()
    render(<Sheet open={false} onClose={onClose}>contenido</Sheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Sheet · backdrop en desktop', () => {
  it('cierra al hacer click en el backdrop', () => {
    const onClose = vi.fn()
    open({ onClose })
    // El backdrop es el ancestro posicionado del panel.
    fireEvent.click(screen.getByText('contenido').closest('[style*="position: fixed"]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('no cierra al hacer click dentro del panel', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.click(screen.getByText('contenido'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Sheet · scroll del body', () => {
  it('bloquea el scroll mientras esta abierto y lo restaura al cerrar', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = open()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('no toca el scroll cuando esta cerrado', () => {
    document.body.style.overflow = 'auto'
    render(<Sheet open={false} onClose={() => {}}>contenido</Sheet>)
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('Sheet · modo mobile', () => {
  it('en mobile no hay backdrop que cierre al click', () => {
    const onClose = vi.fn()
    open({ onClose, mobile: true })
    fireEvent.click(screen.getByText('contenido'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('en mobile el boton de cerrar sigue funcionando', () => {
    const onClose = vi.fn()
    open({ onClose, mobile: true })
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
