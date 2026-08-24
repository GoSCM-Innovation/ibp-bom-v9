// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePolling } from '../../src/components/Orchestrations/hooks/usePolling'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('usePolling', () => {
  it('no llama a nada mientras esta inactivo', async () => {
    const fn = vi.fn()
    renderHook(() => usePolling(false, fn, 1000))
    await tick(10000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('llama cada ms mientras esta activo, y no en el instante cero', async () => {
    const fn = vi.fn()
    renderHook(() => usePolling(true, fn, 1000))
    expect(fn).not.toHaveBeenCalled()
    await tick(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    await tick(3000)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('se detiene al pasar a inactivo', async () => {
    const fn = vi.fn()
    const { rerender } = renderHook(({ a }) => usePolling(a, fn, 1000), { initialProps: { a: true } })
    await tick(2000)
    expect(fn).toHaveBeenCalledTimes(2)
    rerender({ a: false })
    await tick(10000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('vuelve a arrancar al reactivarse', async () => {
    const fn = vi.fn()
    const { rerender } = renderHook(({ a }) => usePolling(a, fn, 1000), { initialProps: { a: true } })
    await tick(1000)
    rerender({ a: false })
    await tick(5000)
    rerender({ a: true })
    await tick(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('limpia el intervalo al desmontar', async () => {
    const fn = vi.fn()
    const { unmount } = renderHook(() => usePolling(true, fn, 1000))
    await tick(1000)
    unmount()
    await tick(10000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('una fn nueva no reinicia el intervalo, pero se usa en el tick siguiente', async () => {
    const a = vi.fn(), b = vi.fn()
    const { rerender } = renderHook(({ f }) => usePolling(true, f, 1000), { initialProps: { f: a } })
    await tick(600)
    // A mitad del periodo se cambia la fn: si el intervalo se reiniciara, el
    // tick se correria 600ms y a los 1000ms no habria pasado nada.
    rerender({ f: b })
    await tick(400)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('cambiar el periodo reinicia el intervalo con el nuevo', async () => {
    const fn = vi.fn()
    const { rerender } = renderHook(({ ms }) => usePolling(true, fn, ms), { initialProps: { ms: 1000 } })
    await tick(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ ms: 5000 })
    await tick(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    await tick(4000)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
