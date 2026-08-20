// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TechLogs from '../../src/components/TechLogs.jsx'

afterEach(cleanup)

const log = (over = {}) => ({
  method: 'POST', path: '/api/soap', status: 200, duration: 120, ts: 1, ...over,
})

const open = logs => {
  const view = render(<TechLogs logs={logs} />)
  fireEvent.click(screen.getByText(/Ver logs tecnicos/))
  return view
}

describe('TechLogs · visibilidad', () => {
  it('no renderiza nada sin logs', () => {
    const { container } = render(<TechLogs logs={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('no renderiza nada cuando logs es null o undefined', () => {
    expect(render(<TechLogs logs={null} />).container.innerHTML).toBe('')
    cleanup()
    expect(render(<TechLogs />).container.innerHTML).toBe('')
  })

  it('arranca colapsado', () => {
    render(<TechLogs logs={[log()]} />)
    expect(screen.queryByText(/\/api\/soap/)).toBeNull()
  })

  it('muestra el total de entradas en el boton', () => {
    render(<TechLogs logs={[log(), log({ ts: 2 }), log({ ts: 3 })]} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('abre y cierra al hacer click', () => {
    render(<TechLogs logs={[log()]} />)
    const btn = screen.getByText(/Ver logs tecnicos/)
    fireEvent.click(btn)
    expect(screen.getByText(/\/api\/soap/)).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.queryByText(/\/api\/soap/)).toBeNull()
  })
})

describe('TechLogs · formato de la entrada', () => {
  it('muestra metodo, path, status y duracion', () => {
    open([log({ method: 'GET', path: '/api/orchestrate', status: 404, duration: 35 })])
    expect(screen.getByText('[GET] /api/orchestrate — 404 (35ms)')).toBeTruthy()
  })

  it('muestra el detalle cuando existe', () => {
    open([log({ detail: 'SESSION_EXPIRED' })])
    expect(screen.getByText('SESSION_EXPIRED')).toBeTruthy()
  })
})

describe('TechLogs · agrupado de repetidas', () => {
  // groupLogs colapsa entradas consecutivas con igual metodo, path y status.
  it('agrupa repeticiones consecutivas con un contador', () => {
    open([log(), log({ ts: 2 }), log({ ts: 3 })])
    expect(screen.getByText('x3')).toBeTruthy()
    expect(screen.getAllByText(/\/api\/soap/)).toHaveLength(1)
  })

  it('no muestra contador para una entrada suelta', () => {
    open([log()])
    expect(screen.queryByText(/^x\d+$/)).toBeNull()
  })

  it('separa cuando cambia el status', () => {
    open([log(), log({ status: 500, ts: 2 })])
    expect(screen.getByText(/— 200 /)).toBeTruthy()
    expect(screen.getByText(/— 500 /)).toBeTruthy()
    expect(screen.queryByText(/^x\d+$/)).toBeNull()
  })

  it('separa cuando cambia el path', () => {
    open([log(), log({ path: '/api/orchestrate', ts: 2 })])
    expect(screen.getAllByText(/\[POST\]/)).toHaveLength(2)
  })

  it('separa cuando cambia el metodo', () => {
    open([log(), log({ method: 'GET', ts: 2 })])
    expect(screen.getByText(/\[POST\]/)).toBeTruthy()
    expect(screen.getByText(/\[GET\]/)).toBeTruthy()
  })

  // Solo agrupa consecutivas: si se intercala otra, se abren grupos separados.
  it('no agrupa repeticiones no consecutivas', () => {
    open([log(), log({ path: '/api/otro', ts: 2 }), log({ ts: 3 })])
    expect(screen.getAllByText(/\/api\/soap /)).toHaveLength(2)
    expect(screen.queryByText(/^x\d+$/)).toBeNull()
  })

  it('maneja varios grupos con contadores distintos', () => {
    open([
      log(), log({ ts: 2 }),
      log({ path: '/api/otro', ts: 3 }), log({ path: '/api/otro', ts: 4 }), log({ path: '/api/otro', ts: 5 }),
    ])
    expect(screen.getByText('x2')).toBeTruthy()
    expect(screen.getByText('x3')).toBeTruthy()
  })
})
