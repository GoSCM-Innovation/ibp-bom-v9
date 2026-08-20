// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import OrchList from '../../src/components/Orchestrations/OrchList.jsx'

const CONN = 'c1'
const FAVS_KEY = `ibp-favs-${CONN}`

const ORCHS = [
  { id: 'o1', name: 'Carga diaria' },
  { id: 'o2', name: 'Carga semanal' },
  { id: 'o3', name: 'Carga mensual' },
]

function setup(props = {}) {
  const handlers = {
    onSelect: vi.fn(), onCreate: vi.fn(), onDuplicate: vi.fn(),
    onDelete: vi.fn(), onToggle: vi.fn(),
  }
  const view = render(
    <OrchList orchs={ORCHS} selectedId={null} connectionId={CONN} {...handlers} {...props} />,
  )
  return { ...handlers, ...view }
}

// La fila es el ancestro del nombre que contiene tambien los botones de accion.
const rowOf = name => screen.getByText(name).parentElement
const rowNames = () => [...document.querySelectorAll('span')]
  .map(s => s.textContent)
  .filter(t => ORCHS.some(o => o.name === t))

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('OrchList · listado', () => {
  it('renderiza todas las orquestaciones', () => {
    setup()
    for (const o of ORCHS) expect(screen.getByText(o.name)).toBeTruthy()
  })

  it('muestra el estado vacio y permite crear desde ahi', () => {
    const { onCreate } = setup({ orchs: [] })
    expect(screen.getByText(/Sin orquestaciones/)).toBeTruthy()
    fireEvent.click(screen.getByText('Crear una'))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('selecciona al hacer click en la fila', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByText('Carga diaria'))
    expect(onSelect).toHaveBeenCalledWith('o1')
  })

  it('crea con el boton +', () => {
    const { onCreate } = setup()
    fireEvent.click(screen.getByTitle('Nueva orquestación'))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})

describe('OrchList · acciones por fila', () => {
  // Duplicar y eliminar hacen stopPropagation: no deben disparar onSelect.
  it('duplica sin seleccionar la fila', () => {
    const { onDuplicate, onSelect } = setup()
    fireEvent.click(within(rowOf('Carga diaria')).getByTitle('Duplicar orquestación'))
    expect(onDuplicate).toHaveBeenCalledWith('o1')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('elimina sin seleccionar la fila', () => {
    const { onDelete, onSelect } = setup()
    fireEvent.click(within(rowOf('Carga semanal')).getByTitle('Eliminar'))
    expect(onDelete).toHaveBeenCalledWith('o2')
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('OrchList · favoritos', () => {
  it('marca como favorito y lo persiste en localStorage', () => {
    const { onSelect } = setup()
    fireEvent.click(within(rowOf('Carga semanal')).getByTitle('Agregar a favoritos'))
    expect(JSON.parse(localStorage.getItem(FAVS_KEY))).toEqual(['o2'])
    // Tampoco debe seleccionar la fila.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('desmarca y lo quita de localStorage', () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['o2']))
    setup()
    fireEvent.click(within(rowOf('Carga semanal')).getByTitle('Quitar de favoritos'))
    expect(JSON.parse(localStorage.getItem(FAVS_KEY))).toEqual([])
  })

  it('lee los favoritos guardados al montar', () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['o3']))
    setup()
    expect(within(rowOf('Carga mensual')).getByTitle('Quitar de favoritos')).toBeTruthy()
    expect(within(rowOf('Carga diaria')).getByTitle('Agregar a favoritos')).toBeTruthy()
  })

  it('ordena los favoritos primero', () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['o3']))
    setup()
    expect(rowNames()[0]).toBe('Carga mensual')
  })

  it('reordena al marcar un favorito', () => {
    setup()
    expect(rowNames()[0]).toBe('Carga diaria')
    fireEvent.click(within(rowOf('Carga mensual')).getByTitle('Agregar a favoritos'))
    expect(rowNames()[0]).toBe('Carga mensual')
  })

  it('tolera un localStorage corrupto', () => {
    localStorage.setItem(FAVS_KEY, 'no-es-json')
    expect(() => setup()).not.toThrow()
    expect(screen.getByText('Carga diaria')).toBeTruthy()
  })

  it('usa una clave por conexion', () => {
    setup({ connectionId: 'otra' })
    fireEvent.click(within(rowOf('Carga diaria')).getByTitle('Agregar a favoritos'))
    expect(localStorage.getItem('ibp-favs-otra')).toBeTruthy()
    expect(localStorage.getItem(FAVS_KEY)).toBeNull()
  })
})

describe('OrchList · exportar e importar', () => {
  it('deshabilita exportar cuando no hay orquestaciones', () => {
    const onExport = vi.fn()
    setup({ orchs: [], onExport })
    const btn = screen.getByTitle('No hay orquestaciones para exportar')
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onExport).not.toHaveBeenCalled()
  })

  it('exporta cuando hay orquestaciones', () => {
    const onExport = vi.fn()
    setup({ onExport })
    fireEvent.click(screen.getByTitle('Exportar todas a archivo'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('oculta los botones de exportar e importar si no hay handler', () => {
    setup()
    expect(screen.queryByTitle('Exportar todas a archivo')).toBeNull()
    expect(screen.queryByTitle('Importar orquestaciones desde archivo')).toBeNull()
  })

  it('dispara la importacion', () => {
    const onImportClick = vi.fn()
    setup({ onImportClick })
    fireEvent.click(screen.getByTitle('Importar orquestaciones desde archivo'))
    expect(onImportClick).toHaveBeenCalledTimes(1)
  })
})

describe('OrchList · panel contraido', () => {
  it('en desktop contraido solo muestra el rotulo y expande al click', () => {
    const { onToggle } = setup({ collapsed: true })
    expect(screen.queryByText('Carga diaria')).toBeNull()
    fireEvent.click(screen.getByTitle('Expandir panel de orquestaciones'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('en mobile ignora collapsed y muestra la lista', () => {
    setup({ collapsed: true, mobile: true })
    expect(screen.getByText('Carga diaria')).toBeTruthy()
  })

  it('en mobile no ofrece el boton de contraer', () => {
    setup({ mobile: true })
    expect(screen.queryByTitle('Contraer panel')).toBeNull()
  })

  it('en desktop contrae con el boton', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByTitle('Contraer panel'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
