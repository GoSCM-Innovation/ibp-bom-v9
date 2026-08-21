import { describe, it, expect } from 'vitest'
import { TASK_TYPE, taskType } from '../../src/constants/taskType.js'
import { hex, withAlpha } from '../../src/styles/tokens.js'

describe('taskType', () => {
  it('un solo color por tipo: el badge no puede mezclar dos violetas', () => {
    // El bug que motivo el modulo: TaskPalette y Tasks pintaban el fondo con
    // #8b5cf6 y el texto con var(--purple) (#a78bfa), en el mismo badge.
    for (const t of Object.values(TASK_TYPE)) {
      expect(t.bg).toBe(withAlpha(t.color, 0.15))
      expect(t.border).toBe(withAlpha(t.color, 0.3))
    }
  })

  it('PROCESS usa el violeta de la paleta', () => {
    expect(TASK_TYPE.PROCESS.color).toBe(hex.violet)
  })

  it('los dos tipos se distinguen', () => {
    expect(TASK_TYPE.PROCESS.color).not.toBe(TASK_TYPE.TASK.color)
  })

  it('los colores son hex: el badge los descompone con withAlpha', () => {
    for (const t of Object.values(TASK_TYPE)) expect(t.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('un tipo desconocido o ausente cae en TASK, como hacian los tres sitios', () => {
    expect(taskType('TASK')).toBe(TASK_TYPE.TASK)
    expect(taskType('PROCESS')).toBe(TASK_TYPE.PROCESS)
    expect(taskType(undefined)).toBe(TASK_TYPE.TASK)
    expect(taskType('OTRA_COSA')).toBe(TASK_TYPE.TASK)
  })
})

describe('withAlpha rechaza lo que no puede descomponer', () => {
  it('falla ante un var() en vez de devolver NaN en silencio', () => {
    expect(() => withAlpha('var(--accent)', 0.5)).toThrow(TypeError)
    expect(() => withAlpha('var(--accent)', 0.5)).toThrow(/hex\.\*/)
  })

  it('falla ante undefined, null y un hex corto', () => {
    for (const v of [undefined, null, '', '#abc', '#12345', 'rojo']) {
      expect(() => withAlpha(v, 0.5), String(v)).toThrow(TypeError)
    }
  })

  it('acepta hex de 6 digitos con y sin almohadilla', () => {
    expect(withAlpha('#34d399', 0.15)).toBe('rgba(52,211,153,0.15)')
    expect(withAlpha('34D399', 0.15)).toBe('rgba(52,211,153,0.15)')
  })
})
