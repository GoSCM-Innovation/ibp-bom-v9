import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alpha, color, hex, radius, fontSize } from '../../src/styles/tokens.js'

// Guarda del design system (#3). Estos tests son estaticos: leen el codigo de
// src/ y fallan si vuelve a aparecer un color de la paleta escrito a mano.
// Sin esto, la consolidacion se deshace sola con el proximo componente.

const SRC = new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : (p.endsWith('.jsx') || p.endsWith('.js')) ? [p] : []
  })
}

const FILES = walk(SRC).map(p => [p.slice(SRC.length).replace(/\\/g, '/'), readFileSync(p, 'utf8')])

// Los tripletes RGB de la paleta de index.css.
const PALETTE = {
  '247,168,0': '--accent', '232,98,42': '--accent2', '41,171,226': '--cyan',
  '52,211,153': '--green', '255,107,107': '--red', '167,139,250': '--purple',
}

describe('paleta', () => {
  it('recoge todos los archivos de src', () => {
    expect(FILES.length).toBeGreaterThan(30)
  })

  it('ningun componente escribe a mano un rgba() de la paleta', () => {
    const hits = []
    for (const [name, src] of FILES) {
      if (name === 'styles/tokens.js') continue
      for (const m of src.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)) {
        const trip = `${m[1]},${m[2]},${m[3]}`
        if (PALETTE[trip]) hits.push(`${name}: rgba(${trip}) es ${PALETTE[trip]}, usar alpha.*()`)
      }
    }
    expect(hits).toEqual([])
  })

  it('ningun componente escribe a mano un hex de la paleta', () => {
    const HEX = {
      f7a800: '--accent', e8622a: '--accent2', '29abe2': '--cyan',
      a78bfa: '--purple', '34d399': '--green', ff6b6b: '--red',
    }
    const hits = []
    for (const [name, src] of FILES) {
      if (name === 'styles/tokens.js') continue   // es donde se definen
      for (const m of src.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        const h = m[1].toLowerCase()
        if (HEX[h]) hits.push(`${name}: #${h} es ${HEX[h]}, usar hex.* o color.*`)
      }
    }
    expect(hits).toEqual([])
  })

  it('los hex de tokens.js no pueden derivar de los tripletes de index.css', () => {
    // La unica duplicacion admitida de la paleta es index.css <-> tokens.hex.
    // Este test la fija: si alguien cambia un color en un lado y no en el otro,
    // falla. hex.* existe porque los helpers que derivan tintes con withAlpha()
    // necesitan un color resuelto, y no pueden trabajar sobre un var().
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    for (const [name, value] of Object.entries(hex)) {
      const m = css.match(new RegExp(`--${name}-rgb:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`))
      expect(m, `falta --${name}-rgb en index.css`).toBeTruthy()
      const n = parseInt(value.slice(1), 16)
      expect([(n >> 16) & 255, (n >> 8) & 255, n & 255], `${name} (${value})`)
        .toEqual([+m[1], +m[2], +m[3]])
    }
  })

  it('no quedan hex de 8 digitos: el canal alfa va por alpha.*()', () => {
    const hits = []
    for (const [name, src] of FILES) {
      for (const m of src.matchAll(/#[0-9a-fA-F]{8}\b/g)) hits.push(`${name}: ${m[0]}`)
    }
    expect(hits).toEqual([])
  })

  it('nadie redefine inputStyle/selectStyle/labelStyle por su cuenta', () => {
    const hits = FILES
      .filter(([name]) => name !== 'styles/forms.js')
      .filter(([, src]) => /^const (input|select|label)Style\s*=/m.test(src))
      .map(([name]) => name)
    expect(hits).toEqual([])
  })
})

describe('alpha', () => {
  it('compone sobre el triplete de index.css, no sobre un literal', () => {
    expect(alpha.accent(.4)).toBe('rgba(var(--accent-rgb),0.4)')
    expect(alpha.red(.15)).toBe('rgba(var(--red-rgb),0.15)')
  })

  it('black y white no dependen de la paleta', () => {
    expect(alpha.black(.5)).toBe('rgba(0,0,0,0.5)')
    expect(alpha.white(.08)).toBe('rgba(255,255,255,0.08)')
  })

  it('cubre los seis colores semanticos de index.css', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    for (const name of ['accent', 'accent2', 'cyan', 'green', 'red', 'purple']) {
      expect(css).toContain(`--${name}-rgb:`)
      expect(alpha[name]).toBeTypeOf('function')
    }
  })
})

describe('tokens', () => {
  it('los colores de tema apuntan a variables CSS, no a literales', () => {
    for (const [k, v] of Object.entries(color)) {
      if (k === 'onAccent' || k === 'white') continue
      expect(v, k).toMatch(/^var\(--[a-z0-9]+\)$/)
    }
  })

  it('cada variable CSS referenciada existe en index.css', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    for (const v of Object.values(color)) {
      const m = v.match(/^var\((--[a-z0-9]+)\)$/)
      if (m) expect(css, v).toContain(`${m[1]}:`)
    }
  })

  it('las escalas son monotonas y sin duplicados', () => {
    const fs = Object.values(fontSize)
    expect(fs).toEqual([...fs].sort((a, b) => a - b))
    expect(new Set(fs).size).toBe(fs.length)
    const rs = [radius.sm, radius.md, radius.lg, radius.xl]
    expect(rs).toEqual([...rs].sort((a, b) => a - b))
  })
})
