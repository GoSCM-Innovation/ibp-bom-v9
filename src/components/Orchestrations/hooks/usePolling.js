import { useEffect, useRef } from 'react'

// Llama a `fn` cada `ms` mientras `active` sea true.
//
// `fn` se lee por ref, asi que puede cambiar de identidad en cada render sin
// reiniciar el intervalo. Solo `active` y `ms` lo reinician.
//
// Reemplaza a los tres mecanismos que convivian en useOrchestration para
// detener el mismo intervalo: una rama `else` en el efecto, un clearInterval
// dentro del propio tick, y el cleanup del efecto. Los dos primeros eran
// redundantes; se comprobo quitandolos y el polling seguia deteniendose.
export function usePolling(active, fn, ms) {
  const fnRef = useRef(fn)
  // La asignacion va en un efecto y no en el cuerpo porque react-hooks/refs
  // prohibe tocar una ref durante el render. Corre antes de que el intervalo
  // pueda disparar, asi que el primer tick ya ve la fn actual.
  useEffect(() => { fnRef.current = fn })

  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => fnRef.current(), ms)
    return () => clearInterval(id)
  }, [active, ms])
}
