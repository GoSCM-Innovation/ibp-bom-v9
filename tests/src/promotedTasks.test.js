import { describe, it, expect } from 'vitest'
import { isTaskPromoted } from '../../src/hooks/usePromotedTasks.js'

describe('isTaskPromoted', () => {
  const promoted = new Set(['CARGA_DIARIA', 'CARGA_SEMANAL'])

  it('encuentra una task presente en el set', () => {
    expect(isTaskPromoted(promoted, 'CARGA_DIARIA')).toBe(true)
  })

  it('normaliza a mayúsculas antes de comparar', () => {
    expect(isTaskPromoted(promoted, 'carga_diaria')).toBe(true)
    expect(isTaskPromoted(promoted, 'Carga_Diaria')).toBe(true)
  })

  it('recorta los espacios', () => {
    expect(isTaskPromoted(promoted, '  CARGA_DIARIA  ')).toBe(true)
  })

  it('es false para una task que no está', () => {
    expect(isTaskPromoted(promoted, 'OTRA')).toBe(false)
  })

  // null significa "no disponible" (conexión productiva o sin sesión PRD), no "no promovida".
  it('es false cuando el set es null o undefined', () => {
    expect(isTaskPromoted(null, 'CARGA_DIARIA')).toBe(false)
    expect(isTaskPromoted(undefined, 'CARGA_DIARIA')).toBe(false)
  })

  it('es false con un taskName vacío o ausente', () => {
    expect(isTaskPromoted(promoted, '')).toBe(false)
    expect(isTaskPromoted(promoted, null)).toBe(false)
    expect(isTaskPromoted(promoted, undefined)).toBe(false)
  })

  it('devuelve siempre un booleano, no el valor del set', () => {
    expect(isTaskPromoted(new Set(), 'X')).toBe(false)
  })
})
