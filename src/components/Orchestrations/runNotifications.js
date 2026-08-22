// Aviso del navegador cuando una orquestacion termina.

const CUERPO = {
  success: 'Completada correctamente',
  error: 'Finalizó con error',
  cancelled: 'Cancelada',
}

// Se comprueba que la clave exista antes de tocarla porque no todos los
// navegadores traen Notification, y en jsdom directamente no esta.
function disponible() {
  return typeof window !== 'undefined' && 'Notification' in window
}

// Se pide al arrancar una corrida, no al montar: pedir permiso sin que el
// usuario haya hecho nada es lo que hace que lo niegue de entrada.
export function pedirPermisoNotificaciones() {
  if (!disponible()) return
  if (window.Notification.permission === 'default') window.Notification.requestPermission()
}

export function notificarFinDeCorrida(nombre, status) {
  if (!disponible() || window.Notification.permission !== 'granted') return
  new window.Notification(nombre || 'Orquestación', { body: CUERPO[status] || status })
}
