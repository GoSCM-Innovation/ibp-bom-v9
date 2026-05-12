export default function WizardActions({
  canUndo,
  canClose,
  hasHead,
  onAddSequential,
  onAddParallel,
  onOpenBranch,
  onCloseBranch,
  onUndo,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text2)',
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2,
      }}>
        ¿Qué hacés ahora?
      </div>

      <ActionButton
        icon="➕" iconColor="var(--accent)"
        label="Añadir task siguiente"
        onClick={onAddSequential}
      />
      <ActionButton
        icon="∥" iconColor="var(--cyan)"
        label="Añadir task en paralelo"
        disabled={!hasHead}
        title={hasHead ? 'Se ejecuta en paralelo con el paso anterior' : 'Primero agregá un paso secuencial'}
        onClick={onAddParallel}
      />
      <ActionButton
        icon="⊞" iconColor="var(--purple)"
        label="Abrir rama paralela (grupo)"
        onClick={onOpenBranch}
      />
      <ActionButton
        icon="↗" iconColor="var(--text2)"
        label="Cerrar rama actual"
        disabled={!canClose}
        onClick={onCloseBranch}
      />
      <ActionButton
        icon="↺" iconColor="var(--text2)"
        label="Deshacer último paso"
        disabled={!canUndo}
        onClick={onUndo}
      />
    </div>
  )
}

function ActionButton({ icon, iconColor, label, onClick, disabled = false, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '14px 16px', borderRadius: 10,
        fontSize: 14, fontWeight: 600, textAlign: 'left',
        minHeight: 'var(--tap-min)',
        border: '1px solid var(--border)',
        background: 'var(--bg3)', color: 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background .12s',
      }}
    >
      <span style={{
        fontSize: 18, color: iconColor, width: 22, textAlign: 'center', flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  )
}
