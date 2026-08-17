// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useTechLogs } from '../../src/hooks/useTechLogs.js'

afterEach(cleanup)

describe('useTechLogs', () => {
  it('arranca con la lista vacía', () => {
    const { result } = renderHook(() => useTechLogs())
    expect(result.current[0]).toEqual([])
  })

  it('agrega una entrada con timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { result } = renderHook(() => useTechLogs())

    act(() => { result.current[1]({ method: 'POST', path: '/api/soap', status: 200 }) })

    expect(result.current[0]).toEqual([
      { method: 'POST', path: '/api/soap', status: 200, ts: Date.UTC(2026, 0, 1) },
    ])
    vi.useRealTimers()
  })

  it('antepone las entradas más recientes', () => {
    const { result } = renderHook(() => useTechLogs())

    act(() => { result.current[1]({ path: '/primera' }) })
    act(() => { result.current[1]({ path: '/segunda' }) })

    expect(result.current[0].map(l => l.path)).toEqual(['/segunda', '/primera'])
  })

  it('trunca el buffer a 50 entradas conservando las más nuevas', () => {
    const { result } = renderHook(() => useTechLogs())

    act(() => {
      for (let i = 0; i < 60; i++) result.current[1]({ path: `/r${i}` })
    })

    const logs = result.current[0]
    expect(logs).toHaveLength(50)
    expect(logs[0].path).toBe('/r59')
    expect(logs[49].path).toBe('/r10')
  })

  it('mantiene estable la identidad de addLog entre renders', () => {
    const { result, rerender } = renderHook(() => useTechLogs())
    const first = result.current[0]
    rerender()
    expect(result.current[0]).toBe(first)
  })
})
