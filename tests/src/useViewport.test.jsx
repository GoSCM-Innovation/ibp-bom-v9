// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useViewport, useIsMobile } from '../../src/hooks/useViewport.js'

function setWidth(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  cleanup()
  window.innerWidth = 1024
})

describe('useViewport', () => {
  it.each([
    [320,  { isMobile: true,  isTablet: false, isDesktop: false }],
    [640,  { isMobile: true,  isTablet: false, isDesktop: false }],
    [641,  { isMobile: false, isTablet: true,  isDesktop: false }],
    [1024, { isMobile: false, isTablet: true,  isDesktop: false }],
    [1025, { isMobile: false, isTablet: false, isDesktop: true  }],
    [1920, { isMobile: false, isTablet: false, isDesktop: true  }],
  ])('clasifica un ancho de %ipx', (width, expected) => {
    window.innerWidth = width
    const { result } = renderHook(() => useViewport())
    expect(result.current).toMatchObject({ width, ...expected })
  })

  it('se actualiza al redimensionar la ventana', () => {
    window.innerWidth = 1200
    const { result } = renderHook(() => useViewport())
    expect(result.current.isDesktop).toBe(true)

    act(() => { setWidth(400) })

    expect(result.current).toMatchObject({ width: 400, isMobile: true, isDesktop: false })
  })

  it('quita el listener al desmontar', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useViewport())
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('deja de actualizar después de desmontar', () => {
    const { result, unmount } = renderHook(() => useViewport())
    const before = result.current.width
    unmount()
    act(() => { setWidth(300) })
    expect(result.current.width).toBe(before)
  })
})

describe('useIsMobile', () => {
  it('devuelve solo el booleano de mobile', () => {
    window.innerWidth = 400
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
    cleanup()

    window.innerWidth = 1200
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })
})
