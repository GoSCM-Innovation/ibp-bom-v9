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
  // Texto sobre un fondo de acento (el acento es amarillo: el contraste lo da el negro).
  onAccent: '#000',
  // Blanco puro, reservado para jerarquía de títulos sobre --text.
  white: '#fff',
}

export const font = { sans: 'var(--font)', mono: 'var(--mono)' }

// Escala tipográfica. Los seis pasos cubren 336 de los 385 usos previos.
export const fontSize = {
  micro: 9,   // metadatos densos, chips
  xs:    10,  // labels en mayúsculas, notas al pie
  sm:    11,  // texto de tabla y barras de herramientas
  md:    12,  // cuerpo por defecto de formularios y modales
  lg:    14,  // subtítulos
  xl:    16,  // títulos de sección
}

export const fontWeight = { normal: 400, semibold: 600, bold: 700 }

// 64 de los 165 radios previos ya eran 6; el resto se agrupa en estos pasos.
export const radius = { sm: 4, md: 6, lg: 8, xl: 10, pill: 999, circle: '50%' }

// Convierte un hex de 6 dígitos a rgba(). Se usa para derivar los fondos y
// bordes translúcidos de un badge a partir de su color, en vez de escribir a
// mano el rgba() y que se desincronice del hex (que es lo que venía pasando).
export function withAlpha(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
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
  black:   (a) => `rgba(0,0,0,${a})`,
  white:   (a) => `rgba(255,255,255,${a})`,
}
