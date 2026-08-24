// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Connections from '../../src/components/Connections/Connections.jsx'

afterEach(cleanup)

// Regresion del crash reportado al importar conexiones: los botones de fila
// llaman a btnStyle('var(--cyan)'), y ese valor terminaba en withAlpha(), que
// lanza ante un var(). El resultado era la pagina en blanco.
//
// Este test monta la lista de verdad. Es la comprobacion que faltaba: los
// tests unitarios de tokens no habrian visto el problema, porque el color
// nunca aparece escrito junto a la llamada.

const CONEXIONES = [
  { id: 'c1', name: 'Alfa', hciUrl: 'https://a.example.com', orgName: 'ORG_A', isProduction: false },
  { id: 'c2', name: 'Beta (Producción)', hciUrl: 'https://b.example.com', orgName: 'ORG_B', isProduction: true },
]

function props(extra = {}) {
  return {
    connections: CONEXIONES,
    onAdd: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(),
    onSelect: vi.fn(), onBulkImport: vi.fn(),
    ...extra,
  }
}

describe('Connections', () => {
  it('renderiza la lista sin lanzar', () => {
    expect(() => render(<Connections {...props()} />)).not.toThrow()
    expect(screen.getByText('Alfa')).toBeTruthy()
    expect(screen.getByText('Beta (Producción)')).toBeTruthy()
  })

  it('pinta los cuatro botones de accion de cada fila', () => {
    render(<Connections {...props()} />)
    for (const label of ['Abrir', 'Probar', 'Editar', 'Eliminar']) {
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(CONEXIONES.length)
    }
  })

  it('esos botones ahora si tienen borde', () => {
    // Antes el borde se escribia como `1px solid var(--cyan)33`, CSS invalido
    // que el navegador descartaba: el borde no existia. Ahora es un color-mix
    // valido, asi que la declaracion sobrevive.
    render(<Connections {...props()} />)
    const abrir = screen.getAllByRole('button', { name: 'Abrir' })[0]
    expect(abrir.style.border).toContain('color-mix')
    expect(abrir.style.border).not.toMatch(/var\([^)]*\)[0-9a-f]{2}/i)
  })

  it('sin conexiones muestra el estado vacio en vez de romper', () => {
    expect(() => render(<Connections {...props({ connections: [] })} />)).not.toThrow()
  })
})
