import { useState } from 'react'
import { primaryBtn, secondaryBtn } from '../../styles/buttons'
import { color } from '../../styles/tokens'

export default function ConnectionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:    initial?.name    || '',
    hciUrl:  initial?.hciUrl  || '',
    orgName: initial?.orgName || '',
    user:    initial?.user    || '',
    logoUrl: initial?.logoUrl || '',
  })
  const [error, setError] = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function handleSave() {
    if (!form.name)   { setError('El nombre es obligatorio'); return }
    if (!form.hciUrl) { setError('La URL del servicio es obligatoria'); return }
    if (!form.orgName){ setError('El nombre de organización es obligatorio'); return }
    setError('')
    onSave({
      ...(initial ? { id: initial.id, isProduction: initial.isProduction ?? true } : {}),
      name:    form.name,
      hciUrl:  form.hciUrl.replace(/\/$/, ''),
      orgName: form.orgName,
      user:    form.user,
      logoUrl: form.logoUrl,
    })
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: color.white, marginBottom: 20 }}>
        {initial ? 'Editar conexión' : 'Nueva conexión'}
      </div>

      {/* Row 1: Name + Org */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Nombre conexión" value={form.name} onChange={v => set('name', v)} placeholder="ej: CI-DS Producción" />
        <Field label="Organización (orgName)" value={form.orgName} onChange={v => set('orgName', v)} placeholder="miOrganizacion" mono />
      </div>

      {/* Row 2: Service URL full width */}
      <div style={{ marginBottom: 14 }}>
        <Field
          label="URL del servicio SOAP"
          value={form.hciUrl}
          onChange={v => set('hciUrl', v)}
          placeholder="https://us.cids.cloud.sap/webservices"
          mono
        />
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
          Kyma: https://&lt;host&gt;/webservices &nbsp;·&nbsp; Neo: https://&lt;host&gt;/DSoD/webservices
        </div>
      </div>

      {/* Row 3: User */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Usuario SAP (opcional, pre-rellena el login)" value={form.user} onChange={v => set('user', v)} placeholder="WebServicesUser" mono />
        {initial ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Repositorio
            </label>
            <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>
              {(initial.isProduction ?? true) ? 'Producción' : 'Sandbox'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              Se crearán dos conexiones automáticamente: una en <b style={{ color: 'var(--text2)' }}>Producción</b> y otra en <b style={{ color: 'var(--text2)' }}>Sandbox</b>.
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Logo URL */}
      <div style={{ marginBottom: 14 }}>
        <Field label="URL del logo (opcional)" value={form.logoUrl} onChange={v => set('logoUrl', v)} placeholder="https://empresa.com/logo.png" />
      </div>

      {error && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--red)' }}>✕ {error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={secondaryBtn}>Cancelar</button>
        <button type="button" onClick={handleSave} style={primaryBtn}>{initial ? 'Guardar cambios' : 'Crear conexiones'}</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text)', fontFamily: mono ? 'var(--mono)' : 'var(--font)',
          fontSize: 12, padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}
