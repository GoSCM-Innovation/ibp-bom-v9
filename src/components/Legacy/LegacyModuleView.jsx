import { useEffect, useRef } from 'react'

const API_TOKEN = import.meta.env.VITE_API_TOKEN || ''

// Hosts a legacy vanilla-JS module (served as a static page under /legacy/*)
// inside an isolated iframe. The iframe runs the original ibp-bom-v7 code as-is;
// the only bridge is the API token, which we hand over via postMessage so the
// iframe can authorize its same-origin /api/* calls (the React app injects the
// token through a window.fetch patch, but the iframe has its own window).
export default function LegacyModuleView({ src, title }) {
  const ref = useRef(null)

  useEffect(() => {
    const origin = window.location.origin
    function sendToken() {
      const win = ref.current?.contentWindow
      if (win) win.postMessage({ type: 'ibp-api-token', token: API_TOKEN }, origin)
    }
    function onMessage(e) {
      if (e.origin !== origin) return
      if (e.data && e.data.type === 'ibp-iframe-ready') sendToken()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      onLoad={() => {
        const win = ref.current?.contentWindow
        if (win) win.postMessage({ type: 'ibp-api-token', token: API_TOKEN }, window.location.origin)
      }}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'block', background: 'var(--bg)' }}
      sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-forms allow-modals"
    />
  )
}
