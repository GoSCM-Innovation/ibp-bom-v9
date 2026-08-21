import { color, fontSize, fontWeight, radius } from './tokens'

// Variantes de botón.
//
// Salen de agrupar los 101 botones que había con su estilo escrito inline. No
// pretenden cubrirlos a todos: quedan fuera los que son de verdad únicos (el
// FAB del wizard, las pestañas, los toggles con estado activo). Las cuatro de
// acá son las que estaban repetidas, y repetidas con deriva.

const base = {
  borderRadius: radius.md,
  cursor: 'pointer',
  transition: 'all .15s',
}

// Acción principal de un modal o formulario. El acento es amarillo, así que
// el texto va en negro: es el par que da contraste.
export const primaryBtn = {
  ...base,
  background: color.accent,
  border: 'none',
  color: color.onAccent,
  fontSize: fontSize.md,
  fontWeight: fontWeight.bold,
  padding: '7px 18px',
}

// Acción secundaria al lado de una primaria: cancelar, volver.
export const secondaryBtn = {
  ...base,
  background: 'none',
  border: `1px solid ${color.border2}`,
  color: color.text2,
  fontSize: fontSize.md,
  fontWeight: fontWeight.semibold,
  padding: '7px 18px',
}

// Botón de barra de herramientas: refrescar, copiar, paginar.
export const toolbarBtn = {
  ...base,
  background: color.bg2,
  border: `1px solid ${color.border2}`,
  color: color.text2,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  padding: '6px 12px',
}

// Botón dentro de un modal o panel, sobre la superficie elevada.
export const softBtn = {
  ...base,
  background: color.bg3,
  border: `1px solid ${color.border}`,
  color: color.text2,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  padding: '6px 14px',
}

// Botón que es solo un glifo: cerrar, expandir, quitar.
export function iconBtn(size = fontSize.xl, tone = color.text2) {
  return { ...base, background: 'none', border: 'none', color: tone, fontSize: size, lineHeight: 1, padding: 0 }
}

// Botón deshabilitado. Se compone sobre cualquiera de las variantes.
export const disabled = { opacity: .5, cursor: 'not-allowed' }
