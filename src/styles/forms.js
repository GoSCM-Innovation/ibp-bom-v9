import { color, fontSize, fontWeight, radius } from './tokens'

// Estilos de los controles de formulario.
//
// Antes había cinco definiciones sueltas de inputStyle/selectStyle/labelStyle
// (NodeConfigPanel, RunModal, RunSingleModal, Tasks, Resumen/GlobalResumen/
// TaskMonitor) que habían derivado entre sí en padding, letterSpacing y fondo.
//
// Se conservan las DOS familias que sí eran una distinción real, no deriva:
//
// - `control`: campos dentro de un modal o panel de configuración. Fondo --bg3
//   (elevado sobre la superficie --bg2 del modal) y ancho completo.
// - `filter`: campos de las barras de herramientas sobre el fondo de la vista.
//   Más chicos, fondo --bg2, y sin ancho fijo porque van en una fila flex.
//
// El fontFamily no se declara: index.css ya aplica var(--font) a input,
// select y textarea.

const base = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  outline: 'none',
}

export const inputStyle = {
  ...base,
  background: color.bg3,
  fontSize: fontSize.md,
  padding: '7px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

export const selectStyle = { ...inputStyle, cursor: 'pointer' }

export const labelStyle = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.bold,
  color: color.text2,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  display: 'block',
  marginBottom: 5,
}

export const filterInputStyle = {
  ...base,
  background: color.bg2,
  fontSize: fontSize.sm,
  padding: '6px 10px',
}

export const filterSelectStyle = { ...filterInputStyle, cursor: 'pointer' }
