import { useState, useRef, useEffect } from 'react'
import { alpha, color } from '../styles/tokens'

const REQUIREMENTS = [
  {
    title: '1. Tenant SAP CI-DS',
    detail: 'Acceso a un tenant de SAP Cloud Integration for Data Services (CI-DS), sobre plataforma Kyma o Neo (legacy). Es el sistema cuyas tasks y proyectos gestiona esta aplicación.',
  },
  {
    title: '2. Usuario tipo WebService',
    detail: 'El admin debe crearlo en Administrator → Users con permiso de WebServices. Un usuario normal de UI no sirve. Su usuario y contraseña se usan al iniciar sesión.',
  },
  {
    title: '3. Organización (orgName)',
    detail: 'Nombre técnico de la organización CI-DS, sensible a mayúsculas/minúsculas. Aparece en la consola CI-DS, arriba a la derecha bajo tu usuario.',
  },
  {
    title: '4. URL del servicio SOAP',
    detail: 'Endpoint del WebService de CI-DS. Kyma: https://<host>/webservices · Neo: https://<host>/DSoD/webservices. Se obtiene del dominio del portal CI-DS reemplazando la ruta por /webservices.',
  },
  {
    title: '5. Autenticación por sesión',
    detail: 'La app hace logon con usuario y contraseña y obtiene un SessionId temporal que usa en cada operación; al cerrar la conexión hace logout. No usa Basic Auth ni OAuth, y la contraseña no se almacena.',
  },
  {
    title: '6. Repositorios Producción y Sandbox',
    detail: 'Cada alta crea automáticamente dos conexiones sobre el mismo tenant: una contra el repositorio Productivo y otra contra el Sandbox.',
  },
  {
    title: '7. Conectividad de red',
    detail: 'El endpoint SOAP debe ser alcanzable desde el backend de GoSCM, que actúa como pasarela segura (token Bearer + protección anti-SSRF, sin seguir redirecciones).',
  },
]

export default function Header({ onMenuToggle }) {
  const [showReqs, setShowReqs] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!showReqs) return
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowReqs(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showReqs])

  return (
    <header className="app-header" style={{
      background: 'linear-gradient(135deg, #080f1e 0%, #0d1829 60%, #080f1e 100%)',
      borderBottom: `2px solid ${alpha.accent(.25)}`,
      padding: '0 24px',
      height: 'var(--header-h)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 200,
      boxShadow: `0 2px 20px ${alpha.black(.5)}`,
      flexShrink: 0,
    }}>
      {/* Hamburger — mobile only */}
      {onMenuToggle && (
        <button
          onClick={onMenuToggle}
          className="hamburger-btn"
          style={{
            display: 'none',
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text2)', padding: '4px 8px',
            fontSize: 16, cursor: 'pointer', flexShrink: 0,
          }}
        >☰</button>
      )}
      {/* Logo + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img
          src="/logo-goscm.png"
          alt="GoSCM"
          style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        />
        <div className="header-sep" style={{ width: 1, height: 28, background: alpha.white(.12) }} />
        <div className="header-title">
          <div style={{ fontSize: 14, fontWeight: 700, color: color.white, letterSpacing: '.01em', lineHeight: 1.2 }}>
            CI-DS Studio
          </div>
        </div>
      </div>

      {/* Requisitos Técnicos button */}
      <div style={{ position: 'relative' }} ref={panelRef}>
        <button
          onClick={() => setShowReqs(p => !p)}
          style={{
            background: showReqs ? alpha.accent(.15) : alpha.white(.06),
            border: `1px solid ${showReqs ? alpha.accent(.4) : alpha.white(.12)}`,
            borderRadius: 8, color: showReqs ? 'var(--accent)' : 'var(--text2)',
            fontSize: 12, fontWeight: 600, padding: '6px 14px',
            cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>📋</span><span className="header-btn-label"> Requisitos Técnicos</span>
        </button>

        {showReqs && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: 'min(420px, 92vw)', background: '#0d1829',
            border: `1px solid ${alpha.accent(.25)}`, borderRadius: 10,
            boxShadow: `0 8px 32px ${alpha.black(.6)}`, padding: 20, zIndex: 300,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: color.white, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋</span> Requisitos Técnicos — Conexión a SAP CI-DS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {REQUIREMENTS.map((r, i) => (
                <div key={i} style={{
                  background: alpha.white(.04), borderRadius: 8,
                  border: `1px solid ${alpha.white(.07)}`, padding: '10px 14px',
                  overflow: 'hidden',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 4, wordBreak: 'break-word' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{r.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
