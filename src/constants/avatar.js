// Color determinista del avatar de una conexión, derivado de su nombre.
//
// La lista y la función hash estaban duplicadas byte a byte en
// ConnectionAvatar.jsx y Sidebar.jsx. Tenían que dar el mismo resultado para
// el mismo nombre —si no, la misma conexión se vería de un color en el sidebar
// y de otro en la tarjeta— y nada lo garantizaba salvo que nadie las tocara.
//
// Son hex crudo a propósito: no son colores de tema, son una rueda de
// identidad. Que cambie la paleta de la app no debe recolorear los avatares.
export const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#06B6D4', '#F97316',
]

export function avatarColor(name = '') {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// Punto de color del entorno, cuando el nombre trae "(Calidad)", "(Producción)"
// o "(Desarrollo)". Tres de los cuatro salen de la rueda de arriba a propósito:
// son la misma familia visual que el avatar al que acompañan.
export const ENV_DOT = {
  calidad:     AVATAR_COLORS[3],  // #F59E0B
  produccion:  AVATAR_COLORS[0],  // #3B82F6
  desarrollo:  AVATAR_COLORS[1],  // #8B5CF6
  desconocido: '#6B7280',
}
