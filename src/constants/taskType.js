import { hex, withAlpha } from '../styles/tokens'

// Colores del badge de tipo de task (PROCESS vs TASK).
//
// Estaban triplicados y no coincidían entre sí: TaskNode usaba #8b5cf6 y
// #06b6d4, mientras TaskPalette y Tasks pintaban el fondo del badge con esos
// mismos dos tonos pero el texto con var(--purple) y var(--cyan), que son
// otros dos. O sea, el mismo badge combinaba dos violetas distintos.
//
// #06b6d4 no es --cyan (#29ABE2, el cian de marca): es un cian de escala de
// datos. Se deja aparte a propósito, para que un cambio de marca no recoloree
// el badge de tipo.
const TEAL = '#06b6d4'

function type(color) {
  return { color, bg: withAlpha(color, 0.15), border: withAlpha(color, 0.3) }
}

export const TASK_TYPE = {
  PROCESS: type(hex.violet),
  TASK: type(TEAL),
}

// TASK es el default: es lo que hacían los tres sitios ante un tipo ausente.
export function taskType(t) {
  return TASK_TYPE[t] || TASK_TYPE.TASK
}
