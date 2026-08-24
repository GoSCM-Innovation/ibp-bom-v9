import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alpha, color, hex, radius, fontSize, space } from '../../src/styles/tokens.js'

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

// Los comentarios se descartan antes de escanear: documentar un color citando
// su hex es legitimo, y es justo lo que hace tokens.js al explicar por que un
// tono se queda fuera de la paleta.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const FILES = walk(SRC).map(p => [p.slice(SRC.length).replace(/\\/g, '/'), stripComments(readFileSync(p, 'utf8'))])

// Los tripletes RGB de la paleta de index.css.
const PALETTE = {
  '247,168,0': '--accent', '232,98,42': '--accent2', '41,171,226': '--cyan',
  '52,211,153': '--green', '255,107,107': '--red', '167,139,250': '--purple',
  '251,191,36': '--warning', '59,130,246': '--info', '139,92,246': '--violet',
  '100,116,139': '--slate', '34,197,94': '--running',
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
      fbbf24: '--warning', '3b82f6': '--info', '8b5cf6': '--violet',
      '64748b': '--slate', '22c55e': '--running',
    }
    // avatar.js queda fuera a proposito: su rueda de identidad NO debe seguir
    // al tema, justamente para que un cambio de paleta no recoloree avatares
    // que el usuario ya asocia a una conexion. Coincide con dos tonos de la
    // paleta por casualidad, no por dependencia. Tiene su test aparte.
    const EXENTOS = new Set(['styles/tokens.js', 'constants/avatar.js'])
    const hits = []
    for (const [name, src] of FILES) {
      if (EXENTOS.has(name)) continue
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

  it('blanco y negro salen de color.white / color.onAccent', () => {
    const hits = []
    for (const [name, src] of FILES) {
      if (name === 'styles/tokens.js') continue
      for (const m of src.matchAll(/'#(fff|ffffff|000|000000)'/gi)) hits.push(`${name}: ${m[0]}`)
    }
    expect(hits).toEqual([])
  })

  it('withAlpha solo se usa donde el color es un hex literal del propio modulo', () => {
    // withAlpha() lanza ante un var(), asi que solo sirve donde el color se
    // conoce y es hex. En un helper que recibe el color por parametro no se
    // sabe que llega: ahi va tint(), que resuelve las dos formas.
    //
    // Esto no es teorico: btnStyle() de Connections e iconBtn() del wizard
    // movil reciben 'var(--cyan)' y compania, y pasarlos por withAlpha dejaba
    // la pagina en blanco.
    const PERMITIDOS = new Set(['styles/tokens.js', 'constants/status.js', 'constants/taskType.js'])
    const hits = FILES
      .filter(([name, src]) => !PERMITIDOS.has(name) && /\bwithAlpha\s*\(/.test(src))
      .map(([name]) => `${name}: usar tint() en vez de withAlpha()`)
    expect(hits).toEqual([])
  })

  it('nadie deriva un tinte concatenando el alfa al hex', () => {
    // `color + '22'` y `` `${color}44` `` exigen que color sea un hex y
    // producen CSS invalido en silencio si alguien pasa un var(). Se derivan
    // con withAlpha(), que ademas falla ruidosamente ante un no-hex.
    const hits = []
    for (const [name, src] of FILES) {
      for (const m of src.matchAll(/\+\s*'[0-9a-fA-F]{2}'/g)) hits.push(`${name}: ${m[0]}`)
      for (const m of src.matchAll(/\$\{[A-Za-z_$][\w$.]*\}[0-9a-fA-F]{2}\b/g)) hits.push(`${name}: ${m[0]}`)
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
    for (const scale of [Object.values(fontSize), Object.values(space)]) {
      expect(scale).toEqual([...scale].sort((a, b) => a - b))
      expect(new Set(scale).size).toBe(scale.length)
    }
    const rs = [radius.xs, radius.sm, radius.md, radius.lg, radius.xl, radius.xxl]
    expect(rs).toEqual([...rs].sort((a, b) => a - b))
  })
})

describe('escalas adoptadas', () => {
  // Definir la escala no sirve de nada si el codigo sigue usando valores
  // sueltos. Estos tests escanean src/ y fallan ante un valor fuera de escala,
  // que es lo que impide que la deriva vuelva con el proximo componente.
  const SPACE = new Set(Object.values(space))
  const FONT = new Set(Object.values(fontSize))
  const RADIUS = new Set(Object.values(radius))
  const SPACE_PROP = /(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right|Inline|Block)?/
  // Incluye las esquinas sueltas (borderTopLeftRadius y compania), que es por
  // donde se cuela un radio fuera de escala sin que nadie lo note.
  const RADIUS_PROP = /border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(\d+)\b/g

  function scan(re, fn) {
    const hits = []
    for (const [name, src] of FILES) {
      if (name.startsWith('styles/')) continue
      for (const m of src.matchAll(re)) fn(hits, m, name)
    }
    return hits
  }

  it('padding, margin y gap usan solo pasos de la escala', () => {
    const re = new RegExp(SPACE_PROP.source + String.raw`\s*:\s*('[^'\n]*'|\d+)`, 'g')
    const hits = scan(re, (hits, m, name) => {
      const body = m[1].replace(/'/g, '')
      for (const tok of body.split(/\s+/)) {
        const num = /^(\d+)(px)?$/.exec(tok)
        if (num && !SPACE.has(+num[1])) hits.push(`${name}: ${m[0]} (${num[1]} fuera de escala)`)
      }
    })
    expect(hits).toEqual([])
  })

  it('fontSize usa solo pasos de la escala', () => {
    const hits = scan(/fontSize\s*:\s*(\d+)\b/g, (hits, m, name) => {
      if (!FONT.has(+m[1])) hits.push(`${name}: fontSize ${m[1]}`)
    })
    expect(hits).toEqual([])
  })

  it('borderRadius usa solo pasos de la escala', () => {
    const hits = scan(RADIUS_PROP, (hits, m, name) => {
      if (!RADIUS.has(+m[1])) hits.push(`${name}: borderRadius ${m[1]}`)
    })
    expect(hits).toEqual([])
  })

  it('lo completamente redondeado se declara pill, no un radio grande', () => {
    const hits = scan(RADIUS_PROP, (hits, m, name) => {
      if (+m[1] >= 16 && +m[1] < 999) hits.push(`${name}: borderRadius ${m[1]}, usar radius.pill`)
    })
    expect(hits).toEqual([])
  })
})
