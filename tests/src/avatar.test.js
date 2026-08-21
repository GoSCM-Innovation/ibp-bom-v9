import { describe, it, expect } from 'vitest'
import { AVATAR_COLORS, avatarColor, ENV_DOT } from '../../src/constants/avatar.js'

// La rueda de avatares vivia duplicada byte a byte en ConnectionAvatar.jsx y
// Sidebar.jsx, cada una con su propia copia de la funcion hash. Tenian que dar
// el mismo color para el mismo nombre y nada lo garantizaba.

describe('avatarColor', () => {
  it('es determinista: el mismo nombre da siempre el mismo color', () => {
    for (const n of ['Alfa', 'Beta (Produccion)', 'x', '']) {
      expect(avatarColor(n)).toBe(avatarColor(n))
    }
  })

  it('siempre devuelve un color de la rueda', () => {
    for (let i = 0; i < 200; i++) {
      expect(AVATAR_COLORS).toContain(avatarColor(`conexion-${i}`))
    }
  })

  it('reparte sobre los ocho colores, no se estanca en uno', () => {
    const vistos = new Set()
    for (let i = 0; i < 200; i++) vistos.add(avatarColor(`conexion-${i}`))
    expect(vistos.size).toBe(AVATAR_COLORS.length)
  })

  it('sin nombre no rompe', () => {
    expect(AVATAR_COLORS).toContain(avatarColor())
    expect(AVATAR_COLORS).toContain(avatarColor(''))
  })

  it('mantiene los ocho colores y su orden: cambiarlos recolorea avatares existentes', () => {
    expect(AVATAR_COLORS).toEqual([
      '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
      '#10B981', '#EF4444', '#06B6D4', '#F97316',
    ])
  })
})

describe('ENV_DOT', () => {
  it('conserva los cuatro colores que ya usaba el sidebar', () => {
    expect(ENV_DOT).toEqual({
      calidad: '#F59E0B',
      produccion: '#3B82F6',
      desarrollo: '#8B5CF6',
      desconocido: '#6B7280',
    })
  })

  it('los tres entornos conocidos salen de la rueda', () => {
    for (const k of ['calidad', 'produccion', 'desarrollo']) {
      expect(AVATAR_COLORS).toContain(ENV_DOT[k])
    }
  })
})
