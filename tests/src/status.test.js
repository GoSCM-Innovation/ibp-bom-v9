import { describe, it, expect } from 'vitest'
import { TASK_STATUS, taskStatus, UNKNOWN_STATUS } from '../../src/constants/status.js'
import { withAlpha } from '../../src/styles/tokens.js'

describe('withAlpha', () => {
  it('descompone un hex de 6 digitos en rgba', () => {
    expect(withAlpha('#3b82f6', 0.15)).toBe('rgba(59,130,246,0.15)')
    expect(withAlpha('#ff6b6b', 0.3)).toBe('rgba(255,107,107,0.3)')
    expect(withAlpha('#000000', 1)).toBe('rgba(0,0,0,1)')
    expect(withAlpha('#ffffff', 0)).toBe('rgba(255,255,255,0)')
  })

  it('acepta el hex sin almohadilla', () => {
    expect(withAlpha('34d399', 0.15)).toBe('rgba(52,211,153,0.15)')
  })
})

describe('TASK_STATUS', () => {
  const CODES = [
    'RUNNING', 'SUCCESS', 'SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E', 'ERROR',
    'QUEUEING', 'IMPORTED', 'FETCHED', 'TERMINATED', 'TERMINATION_FAILED', 'UNKNOWN',
  ]

  it('cubre los once codigos que devuelve SAP', () => {
    expect(Object.keys(TASK_STATUS).sort()).toEqual([...CODES].sort())
  })

  it('cada entrada trae code, color, label, chartLabel, bg y border', () => {
    for (const code of CODES) {
      const s = TASK_STATUS[code]
      expect(s.code).toBe(code)
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(s.label).toBeTruthy()
      expect(s.chartLabel).toBeTruthy()
    }
  })

  it('deriva bg y border del color, sin rgba escritos a mano', () => {
    for (const s of Object.values(TASK_STATUS)) {
      expect(s.bg).toBe(withAlpha(s.color, 0.15))
      expect(s.border).toBe(withAlpha(s.color, 0.3))
    }
  })

  it('no repite color entre estados: dos estados distintos nunca se ven igual', () => {
    const colors = Object.values(TASK_STATUS).map(s => s.color)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('los colores de grafico son hex crudo, no var() (recharts los escribe como atributo SVG)', () => {
    for (const s of Object.values(TASK_STATUS)) expect(s.color).not.toContain('var(')
  })
})

describe('taskStatus', () => {
  it('devuelve la entrada exacta para un codigo conocido', () => {
    expect(taskStatus('SUCCESS')).toBe(TASK_STATUS.SUCCESS)
  })

  it('un codigo nuevo de SAP cae en UNKNOWN pero conserva su texto', () => {
    const s = taskStatus('ALGO_NUEVO')
    expect(s.color).toBe(UNKNOWN_STATUS.color)
    expect(s.label).toBe('ALGO_NUEVO')
    expect(s.chartLabel).toBe('ALGO_NUEVO')
    expect(s.code).toBe('ALGO_NUEVO')
  })

  it('sin codigo cae en UNKNOWN con su label propio', () => {
    expect(taskStatus(undefined).label).toBe('Unknown')
    expect(taskStatus('').label).toBe('Unknown')
  })
})
