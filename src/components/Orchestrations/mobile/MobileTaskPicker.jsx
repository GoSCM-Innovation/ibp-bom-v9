import { useState, useEffect } from 'react'
import Sheet from '../../ui/Sheet'
import TaskPalette from '../panel/TaskPalette'

export default function MobileTaskPicker({
  open,
  onClose,
  connection,
  sessionId,
  mode = 'sequential', // 'sequential' | 'parallel'
  onConfirm,           // (tasks[]) => void
}) {
  const [selected, setSelected] = useState(new Map())

  useEffect(() => {
    if (!open) setSelected(new Map())
  }, [open])

  const selectedKeys = new Set(selected.keys())
  const count = selected.size

  function toggle(task) {
    const key = task.taskGuid || task.taskName
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, task)
      return next
    })
  }

  function handleConfirm() {
    if (count === 0) return
    onConfirm?.([...selected.values()])
    onClose?.()
  }

  const title = mode === 'parallel' ? 'Añadir tasks en paralelo' : 'Añadir tasks'
  const verb  = mode === 'parallel' ? 'en paralelo' : ''
  const label = count === 0
    ? 'Seleccioná al menos una task'
    : `Añadir ${count} task${count === 1 ? '' : 's'}${verb ? ' ' + verb : ''}`

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      mobile
      footer={
        <button
          onClick={handleConfirm}
          disabled={count === 0}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 8,
            border: 'none', fontSize: 14, fontWeight: 700,
            minHeight: 'var(--tap-min)',
            background: count === 0 ? 'var(--bg3)' : 'var(--accent)',
            color: count === 0 ? 'var(--text3)' : 'var(--bg)',
            cursor: count === 0 ? 'default' : 'pointer',
          }}
        >{label}</button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TaskPalette
          connection={connection}
          sessionId={sessionId}
          mobile
          selectable
          selectedKeys={selectedKeys}
          onToggleSelect={toggle}
        />
      </div>
    </Sheet>
  )
}
