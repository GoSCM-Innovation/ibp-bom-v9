import { useState, useEffect } from 'react'

const MOBILE_MAX = 640
const TABLET_MAX = 1024

function read() {
  if (typeof window === 'undefined') {
    return { width: 1200, isMobile: false, isTablet: false, isDesktop: true }
  }
  const w = window.innerWidth
  return {
    width: w,
    isMobile:  w <= MOBILE_MAX,
    isTablet:  w >  MOBILE_MAX && w <= TABLET_MAX,
    isDesktop: w >  TABLET_MAX,
  }
}

export function useViewport() {
  const [state, setState] = useState(read)
  useEffect(() => {
    const update = () => setState(read())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return state
}

export function useIsMobile() {
  return useViewport().isMobile
}
