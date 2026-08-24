// Tokens de diseño compartidos.
//
// Dos familias, con reglas distintas sobre dónde vive el valor:
//
// - `color`: colores de tema. El valor real vive en las variables CSS de
//   `src/index.css`; acá solo se nombran. Cambiar la paleta es editar el CSS.
// - Los colores de estado (src/constants/status.js) quedan aparte, en hex
//   crudo: son valores de dato que terminan en el `fill` de un <Cell> de
//   recharts, no colores de tema, y mantenerlos en hex conserva exactamente
//   el render que ya tenían.
//
// Las escalas numéricas (`radius`, `fontSize`) se derivaron de los valores que
// el código ya usaba, quedándose con los dominantes: adoptarlas no mueve
// ningún píxel salvo donde se indique.

export const color = {
  bg: 'var(--bg)', bg2: 'var(--bg2)', bg3: 'var(--bg3)',
  surface: 'var(--surface)', surface2: 'var(--surface2)',
  border: 'var(--border)', border2: 'var(--border2)',
  text: 'var(--text)', text2: 'var(--text2)', text3: 'var(--text3)',
  accent: 'var(--accent)', accent2: 'var(--accent2)',
  cyan: 'var(--cyan)', green: 'var(--green)', red: 'var(--red)', purple: 'var(--purple)',
  // Semánticos, no de marca: advertencia, informativo, y un neutro para lo
  // desconocido o inactivo. Salieron de los tonos que ya se repetían sueltos.
  warning: 'var(--warning)', info: 'var(--info)', violet: 'var(--violet)', slate: 'var(--slate)',
  // Verde de ejecución, distinto del --green de éxito.
  running: 'var(--running)',
  // Texto sobre un fondo de acento (el acento es amarillo: el contraste lo da el negro).
  onAccent: '#000',
  // Blanco puro, reservado para jerarquía de títulos sobre --text.
  white: '#fff',
}

// Los mismos colores en hex. Hacen falta donde el valor tiene que ser un color
// resuelto y no una variable: los helpers que reciben un color cualquiera y le
// derivan tintes con withAlpha() no pueden trabajar sobre un var().
// El test de designTokens comprueba que estos hex coincidan con los tripletes
// de index.css, así que no pueden desincronizarse.
export const hex = {
  accent: '#F7A800', accent2: '#E8622A', cyan: '#29ABE2',
  green: '#34d399', red: '#ff6b6b', purple: '#a78bfa',
  warning: '#fbbf24', info: '#3b82f6', violet: '#8b5cf6', slate: '#64748b', running: '#22c55e',
}

export const font = { sans: 'var(--font)', mono: 'var(--mono)' }

// Escala tipográfica. Los seis primeros pasos son texto; los cuatro últimos
// son para glifos —los emoji de los estados vacíos y las × de cerrar—, que no
// son tipografía y por eso saltan de a más.
export const fontSize = {
  micro: 9,   // metadatos densos, chips
  xs:    10,  // labels en mayúsculas, notas al pie
  sm:    11,  // texto de tabla y barras de herramientas
  md:    12,  // cuerpo por defecto de formularios y modales
  lg:    14,  // subtítulos y títulos de sección
  xl:    16,  // títulos de modal
  icon:   20, // glifo de acción: cerrar, expandir
  iconLg: 24,
  hero:   32, // ilustración de estado vacío
  heroLg: 40,
}

export const fontWeight = { normal: 400, semibold: 600, bold: 700 }

// 64 de los 165 radios previos ya eran 6; el resto se agrupa en estos pasos.
// `pill` es para lo que debe quedar completamente redondeado sin depender de
// su altura, que es lo que antes se escribía como un radio de 20.
export const radius = { xs: 2, sm: 4, md: 6, lg: 8, xl: 10, xxl: 12, pill: 999, circle: '50%' }

// Escala de espaciado, para padding, margin y gap.
//
// `hair` existe porque 1px es un valor real de diseño acá: es el padding
// vertical de los micro-badges, y redondearlo a 0 los colapsa mientras que
// redondearlo a 2 los duplica. No es ruido de rejilla.
export const space = {
  none: 0, hair: 1, xxs: 2, xs: 4, sm: 6, md: 8, lg: 10, xl: 12,
  xxl: 14, xxxl: 16, gap: 20, section: 24, block: 28, page: 32, hero: 40,
}

// Convierte un hex de 6 dígitos a rgba(). Se usa para derivar los fondos y
// bordes translúcidos de un badge a partir de su color, en vez de escribir a
// mano el rgba() y que se desincronice del hex (que es lo que venía pasando).
export function withAlpha(hexColor, a) {
  const h = String(hexColor).replace('#', '')
  // Falla ruidosamente ante un var(): descomponer un color exige el valor
  // resuelto, y pasarle 'var(--accent)' devolvia NaN y pintaba transparente
  // sin avisar. Es el error facil de cometer al elegir entre color.* y hex.*.
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    throw new TypeError(`withAlpha necesita un hex de 6 digitos, recibio ${JSON.stringify(hexColor)}. Si es un color de la paleta, usar hex.* en vez de color.*`)
  }
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Versión translúcida de un color CUALQUIERA, sea hex o var().
//
// Es la que va en los helpers que reciben el color por parámetro (botones de
// acción, chips, badges): ahí no se sabe de antemano si llega un hex o una
// variable, y withAlpha() solo sabe descomponer hex.
//
// Para un var() usa color-mix, que es la unica forma de aplicarle alfa a una
// variable CSS sin resolverla en JS. Antes esto se escribia concatenando el
// alfa al valor (`${color}33`), que con un var() producia `var(--cyan)33`:
// CSS invalido que el navegador descarta en silencio, asi que esos bordes
// simplemente no se pintaban.
export function tint(c, a) {
  const s = String(c)
  if (s.startsWith('var(') || s.startsWith('color-mix(')) {
    // toFixed antes del porcentaje: .333 * 100 da 33.300000000000004 y eso
    // terminaria escrito tal cual en el CSS.
    return `color-mix(in srgb, ${s} ${Number((a * 100).toFixed(4))}%, transparent)`
  }
  return withAlpha(s, a)
}

// Versión translúcida de un color de tema, compuesta sobre el triplete RGB de
// index.css. Reemplaza a los rgba() literales que estaban repartidos por los
// componentes: había 231 usos de 94 colores escritos a mano, y buena parte
// eran la paleta duplicada a mano (rgba(247,168,0,.4) es el acento).
// Así el color sigue teniendo una sola definición, la de index.css.
export const alpha = {
  accent:  (a) => `rgba(var(--accent-rgb),${a})`,
  accent2: (a) => `rgba(var(--accent2-rgb),${a})`,
  cyan:    (a) => `rgba(var(--cyan-rgb),${a})`,
  green:   (a) => `rgba(var(--green-rgb),${a})`,
  red:     (a) => `rgba(var(--red-rgb),${a})`,
  purple:  (a) => `rgba(var(--purple-rgb),${a})`,
  warning: (a) => `rgba(var(--warning-rgb),${a})`,
  info:    (a) => `rgba(var(--info-rgb),${a})`,
  violet:  (a) => `rgba(var(--violet-rgb),${a})`,
  slate:   (a) => `rgba(var(--slate-rgb),${a})`,
  running: (a) => `rgba(var(--running-rgb),${a})`,
  black:   (a) => `rgba(0,0,0,${a})`,
  white:   (a) => `rgba(255,255,255,${a})`,
}
