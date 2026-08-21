// Tokens de diseño compartidos.
//
// Dos familias, con reglas distintas sobre dónde vive el valor:
//
// - `color`: colores de tema. El valor real vive en las variables CSS de
//   `src/index.css`; acá solo se nombran. Cambiar la paleta es editar el CSS.
// - `hue`: colores de dato (series de gráficos, badges de estado). Van en hex
//   crudo a propósito: recharts los escribe como atributo SVG `fill`, y los
//   navegadores no resuelven `var()` dentro de un atributo de presentación.
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
export function withAlpha(hex, alpha) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
