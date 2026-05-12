import Sheet from '../../ui/Sheet'
import TaskPalette from '../panel/TaskPalette'

export default function MobileTaskPicker({
  open,
  onClose,
  connection,
  sessionId,
  onPickTask,
  onAddGroup,
  showGroupOption = true,
}) {
  // eslint-disable-next-line no-console
  console.log('[ibp-picker] MobileTaskPicker render', { open, hasConnection: !!connection, sessionId })
  return (
    <Sheet open={open} onClose={onClose} title="Añadir paso" mobile>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {showGroupOption && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              onClick={() => { onAddGroup?.(); onClose?.() }}
              style={{
                width: '100%', padding: 12, borderRadius: 8,
                border: '1px dashed rgba(41,171,226,.4)',
                background: 'rgba(41,171,226,.08)', color: 'var(--cyan)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                minHeight: 'var(--tap-min)',
              }}
            >
              ⊞ Nuevo grupo paralelo
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0 }}>
          <TaskPalette
            connection={connection}
            sessionId={sessionId}
            mobile
            onPick={(t) => { onPickTask?.(t); onClose?.() }}
          />
        </div>
      </div>
    </Sheet>
  )
}
