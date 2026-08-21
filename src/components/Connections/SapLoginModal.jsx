import { useState } from 'react'
import { primaryBtn, secondaryBtn } from '../../styles/buttons'
import { alpha } from '../../styles/tokens'

export default function SapLoginModal({ connection, onSuccess, onCancel }) {
  const [user, setUser]         = useState(connection.user || '')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function loginRequest(isProduction) {
    const res = await fetch('/api/sap-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hciUrl:  connection.hciUrl,
        orgName: connection.orgName,
        isProduction,
        user,
        password,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error de autenticación')
    return data.sessionId
  }

  async function handleLogin() {
    if (!user || !password) { setError('Usuario y contraseña son requeridos'); return }
    setLoading(true); setError('')
    try {
      // En sandbox abrimos también una sesión contra el repo productivo (mismas
      // credenciales) para poder marcar qué tasks están promovidas. Best effort.
      const prodPromise = !connection.isProduction
        ? loginRequest(true).catch(() => null)
        : null
      const sessionId = await loginRequest(!!connection.isProduction)
      if (prodPromise) {
        const prodSid = await prodPromise
        if (prodSid) sessionStorage.setItem(`sap_prod_${connection.id}`, prodSid)
        else sessionStorage.removeItem(`sap_prod_${connection.id}`)
      }
      onSuccess(sessionId)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: alpha.black(.65),
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        borderRadius: 12, padding: 28, width: 340, boxShadow: `0 8px 32px ${alpha.black(.5)}`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          Conectar a SAP
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>
          {connection.name} · {connection.isProduction ? 'Productivo' : 'Sandbox'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Usuario" value={user} onChange={setUser} placeholder="WebServicesUser" onKeyDown={handleKey} autoFocus={!connection.user} />
          <Field label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••••" onKeyDown={handleKey} autoFocus={!!connection.user} />
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: alpha.red(.1), borderRadius: 6 }}>
            ✕ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={secondaryBtn}>Cancelar</button>
          <button onClick={handleLogin} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', onKeyDown, autoFocus }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text)', fontFamily: 'var(--font)',
          fontSize: 12, padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}
