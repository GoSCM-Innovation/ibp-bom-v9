export default function WizardActions({
  canUndo,
  canClose,
  hasHead,
  onAddSequential,
  onAddParallel,
  onAddGroup,
  onCloseBranch,
  onUndo,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ActionButton
        icon="➕" iconColor="var(--accent)"
        label="Añadir task"
        sublabel="Sigue después del último paso"
        onClick={onAddSequential}
      />
      <ActionButton
        icon="∥" iconColor="var(--cyan)"
        label="Añadir task en paralelo"
        sublabel={hasHead ? 'Corre junto al paso anterior' : 'Primero agregá un paso secuencial'}
        disabled={!hasHead}
        onClick={onAddParallel}
      />
      <ActionButton
        icon="⊞" iconColor="var(--purple)"
        label="Nuevo grupo"
        sublabel="Contenedor para organizar tasks"
        onClick={onAddGroup}
      />
      {canClose && (
        <ActionButton
          icon="↗" iconColor="var(--text2)"
          label="Cerrar grupo actual"
          sublabel="Vuelve al contexto superior"
          onClick={onCloseBranch}
        />
      )}
      {canUndo && (
        <ActionButton
          icon="↺" iconColor="var(--text2)"
          label="Deshacer último paso"
          onClick={onUndo}
        />
      )}
    </div>
  )
}

function ActionButton({ icon, iconColor, label, sublabel, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '14px 16px',
        fontSize: 14, fontWeight: 600, textAlign: 'left',
        minHeight: 'var(--tap-min)',
        border: 'none', borderBottom: '1px solid var(--border)',
        background: 'transparent', color: 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span style={{
        fontSize: 20, color: iconColor, width: 28, textAlign: 'center', flexShrink: 0,
      }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{label}</span>
        {sublabel && (
          <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{sublabel}</span>
        )}
      </span>
    </button>
  )
}
