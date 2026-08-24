import { describe, it, expect } from 'vitest'
import { tint, withAlpha, color, hex } from '../../src/styles/tokens.js'

// Regresion: btnStyle() de Connections e iconBtn() del wizard movil reciben el
// color por parametro, y sus llamadores pasan 'var(--cyan)', 'var(--red)' y
// compania. Pasar eso por withAlpha() lanzaba TypeError y dejaba la pagina en
// blanco. Antes de withAlpha, el codigo concatenaba el alfa al valor y producia
// `var(--cyan)33`, CSS invalido que el navegador descartaba en silencio: los
// bordes de esos botones nunca se pintaron.

describe('tint', () => {
  it('resuelve un var() con color-mix, que es lo que rompia', () => {
    expect(tint('var(--cyan)', .2)).toBe('color-mix(in srgb, var(--cyan) 20%, transparent)')
    expect(tint('var(--red)', .333)).toBe('color-mix(in srgb, var(--red) 33.3%, transparent)')
  })

  it('acepta los tokens de tema tal cual salen de color.*', () => {
    for (const v of [color.cyan, color.red, color.text2, color.accent]) {
      expect(() => tint(v, .2)).not.toThrow()
      expect(tint(v, .2)).toContain('color-mix')
    }
  })

  it('con un hex se comporta igual que withAlpha', () => {
    for (const v of [hex.green, hex.accent, '#123456']) {
      expect(tint(v, .15)).toBe(withAlpha(v, .15))
    }
  })

  it('anida sobre un color-mix sin romper', () => {
    // Puede pasar si un helper compone sobre lo que le devolvio otro.
    const una = tint('var(--cyan)', .5)
    expect(() => tint(una, .5)).not.toThrow()
  })

  it('los cuatro colores que pasa btnStyle no lanzan', () => {
    // Los literales exactos de Connections.jsx.
    for (const v of ['var(--cyan)', 'var(--text2)', 'var(--red)']) {
      expect(() => tint(v, .2), v).not.toThrow()
    }
  })

  it('los tres que pasa el iconBtn del wizard movil tampoco', () => {
    for (const v of ['var(--purple)', 'var(--red)', 'var(--green)']) {
      expect(() => tint(v, .333), v).not.toThrow()
    }
  })

  it('sigue rechazando lo que no es ni hex ni var', () => {
    for (const v of [undefined, null, '', 'rojo', '#abc']) {
      expect(() => tint(v, .5), String(v)).toThrow(TypeError)
    }
  })

  it('nunca produce el CSS invalido que producia la concatenacion', () => {
    // `var(--cyan)33` era el sintoma: un var() seguido de dos digitos hex.
    for (const v of ['var(--cyan)', hex.green]) {
      expect(tint(v, .2)).not.toMatch(/var\([^)]*\)[0-9a-f]{2}/i)
    }
  })
})

describe('withAlpha sigue siendo estricto', () => {
  it('lanza ante un var(), que es lo que hace falta para el fill de recharts', () => {
    expect(() => withAlpha('var(--cyan)', .2)).toThrow(TypeError)
  })
})
