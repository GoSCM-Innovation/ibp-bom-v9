# Deuda técnica

Problemas conocidos detectados en el análisis del proyecto que NO se abordan en cambios puntuales. Sirve como resumen versionado y como índice de los issues de GitHub. La app funciona en producción; nada de esto es un bug que rompa el uso actual, son riesgos de mantenibilidad y escalabilidad.

Severidad: critical (riesgo alto o bloquea evolución), high (impacto fuerte en mantenimiento), medium (fricción), low (mejora menor).

## Resumen

| # | Severidad | Problema | Issue |
|---|---|---|---|
| 1 | ~~critical~~ | ~~Sin tests ni framework de testing~~ — resuelto, ver abajo | [#1](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/1) |
| 2 | ~~high~~ | ~~Errores de lint preexistentes~~ - resuelto, ver abajo | [#2](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/2) |
| 3 | ~~high~~ | ~~Estilos inline sin design system~~ — resuelto, ver abajo | [#3](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/3) |
| 4 | ~~high~~ | ~~Constantes de estado (STATUS) duplicadas~~ — resuelto, ver abajo | [#4](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/4) |
| 5 | ~~high~~ | ~~`useOrchestration` con demasiadas responsabilidades~~ — resuelto, ver abajo | [#5](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/5) |
| 6 | high | `VITE_API_TOKEN` público de facto | [#6](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/6) |
| 7 | ~~medium~~ | ~~Estilos de formulario duplicados~~ — resuelto, ver abajo | [#7](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/7) |
| 8 | medium | Prop drilling de `connection`/`sessionId` | [#8](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/8) |
| 9 | medium | Mezcla español/inglés sin i18n centralizado | [#9](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/9) |
| 10 | medium | Manejo de errores inconsistente | [#10](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/10) |
| 11 | medium | Modales de Run duplicados | [#11](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/11) |
| 12 | low | Bundle único grande (>500 KB) | [#12](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/12) |
| 22 | low | Alcance de la medición de cobertura de tests | [#22](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/22) |
| 24 | medium | Hover simulado en JS en vez de clases CSS | [#24](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/24) |
| 25 | low | `var()` en atributos SVG de recharts, posible bug de render | [#25](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/25) |

## Detalle

### 1. Sin tests (resuelto)
Ver "Resuelto recientemente".

### 2. Deuda de hooks (resuelto)
`npm run lint` sale en **exit 0**: pasó de 758 errores + 12 warnings a **0 errores + 28 warnings**, y los 28 restantes están todos en `public/legacy` (`no-empty` y `no-useless-escape`), que no se edita por política. **`src/` y `api/` no reportan nada.** La mayor parte de aquellos 758 no era código sino configuración de ESLint (ver "Resuelto recientemente").

Estado de las reglas de hooks:

| Regla | Estado |
|---|---|
| ~~`react-hooks/rules-of-hooks`~~ | **Resuelto**: era el early return de `NodeConfigPanel` por delante de sus seis hooks. |
| ~~`react-hooks/set-state-in-effect`~~ | **Sin reportes.** Dos se eliminaron de raíz; los cuatro restantes quedan suprimidos uno por uno con su motivo (ver abajo). |
| ~~`react-hooks/exhaustive-deps`~~ | **Sin reportes.** Ocho se resolvieron de verdad; tres quedan suprimidos con motivo. |

No quedan bloques de baseline en [eslint.config.js](../eslint.config.js): las tres reglas de hooks vuelven a aplicarse en todo el repo sin excepciones por archivo.

**Sobre `exhaustive-deps`.** El patrón que resolvió la mayoría fue leer por ref los callbacks que un efecto invoca pero que no deben condicionar cuándo corre: `onSessionExpired`, `onSearchConsumed`, `debounced_save`, `handleNodeSelect`. Meterlos en el array de dependencias, que es lo que pide la regla al pie de la letra, hace que el efecto se reejecute en cada render del padre; en `TaskMonitor` y `Resumen` eso es un bucle de llamadas a SAP. `addLog` sí se pudo agregar como dependencia normal porque se memoizó en su origen ([useTechLogs.js](../src/hooks/useTechLogs.js)).

Hay un guardarraíl para esto en [tests/src/container-refetch.test.jsx](../tests/src/container-refetch.test.jsx): renderiza `TaskMonitor` y `Resumen` varias veces con callbacks recreados y verifica que la cantidad de llamadas SOAP no crezca. Verificado que falla si se agrega una dependencia inestable.

**Eliminados de raíz.** En `NodeConfigPanel` el efecto que reseteaba el formulario al cambiar de nodo se reemplazó por un `key` en el wrapper, que remonta el formulario y deja que los inicializadores de `useState` hagan el trabajo. En `MobileTaskPicker` el efecto que limpiaba la selección al cerrar desapareció al montar el componente solo mientras está abierto.

**Suprimidos con motivo**, cada uno con su `eslint-disable-next-line` y su justificación en el código:

| Sitio | Por qué se queda |
|---|---|
| [NodeConfigPanel.jsx](../src/components/Orchestrations/canvas/NodeConfigPanel.jsx) | Estado de carga previo a un fetch. No hay patrón mejor sin una librería de data fetching. |
| [usePromotedTasks.js](../src/hooks/usePromotedTasks.js) | Ídem: fija "no disponible" antes de decidir si consulta a SAP. |
| [App.jsx](../src/App.jsx) | Colapsar el sidebar al pasar a mobile. El estado no se puede derivar porque el usuario también lo alterna a mano; el reemplazo idiomático es más código para el mismo comportamiento. |
| [SystemView.jsx](../src/components/System/SystemView.jsx) | Resync de sesión al editar la conexión. El reemplazo con `key` también reiniciaría la pestaña activa y el header, que hoy se conservan. |

Los otros 28 warnings son `no-empty` y `no-useless-escape` en `public/legacy`, que no se editan por política.

### 3. Estilos inline sin design system (resuelto)
Ver "Resuelto recientemente". Lo que queda es el hover simulado en JS, que se trata en [#24](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/24) porque no se resuelve sin dejar de aplicar los estilos inline.

### 4. Constantes de estado duplicadas (resuelto)
Ver "Resuelto recientemente".

### 5. `useOrchestration` hace demasiado (resuelto)
Ver "Resuelto recientemente".

### 6. `VITE_API_TOKEN` público de facto (high)
El token de API queda embebido en el bundle del frontend. Ver [SECURITY.md](SECURITY.md).
Recomendación: migrar a auth por sesión (cookie httpOnly) en vez de token compartido en el cliente.

### 7. Estilos de formulario duplicados (resuelto)
Ver "Resuelto recientemente".

### 8. Prop drilling (medium)
`connection`, `sessionId` y `onSessionExpired` se pasan a través de varios niveles (App -> SystemView -> vistas -> modales).
Recomendación: Context (`ConnectionContext`/`SessionContext`) para el estado de conexión/sesión.

### 9. Mezcla de idiomas sin i18n (medium)
Strings de UI en español embebidos en el código, comentarios mezclados español/inglés, nombres de variables en inglés. No hay i18n centralizado en la app React (los módulos legacy sí tienen el suyo).
Recomendación: centralizar strings; evaluar i18n si se necesita multi-idioma.

### 10. Manejo de errores inconsistente (medium)
Conviven `alert(e.message)`, `setError(...)`, swallow silencioso (`.catch(() => {})`) y `console.error`.
Recomendación: estandarizar (hook/wrapper de error) y evitar swallow silencioso sin feedback.

### 11. Modales de Run duplicados (medium)
[RunModal.jsx](../src/components/Orchestrations/RunModal.jsx), [RunSingleModal.jsx](../src/components/Orchestrations/RunSingleModal.jsx) y [RunLogModal.jsx](../src/components/Orchestrations/RunLogModal.jsx) comparten lógica de carga de agentes/variables y UI de formularios.
Recomendación: extraer la lógica común a un hook/componente compartido.

### 12. Bundle único grande (low)
El build emite un solo chunk JS de ~950 KB (warning de Vite por >500 KB).
Recomendación: code-splitting con `import()` dinámico (p. ej. lazy-load del canvas de orquestación o los gráficos).

## Resuelto recientemente

### Separacion de `useOrchestration` (issue #5)

El hook pasa de 305 lineas y seis responsabilidades a 45 que son solo composicion:

| Modulo | Responsabilidad |
|---|---|
| [hooks/useOrchestrationCrud.js](../src/components/Orchestrations/hooks/useOrchestrationCrud.js) | Lista, seleccion, alta, baja y modificacion |
| [hooks/useOrchestrationRun.js](../src/components/Orchestrations/hooks/useOrchestrationRun.js) | Estado de corrida y las tres acciones (start, resume, cancel) |
| [hooks/usePolling.js](../src/components/Orchestrations/hooks/usePolling.js) | Intervalo generico, sin saber de orquestaciones |
| [hooks/useOrchestrationTransfer.js](../src/components/Orchestrations/hooks/useOrchestrationTransfer.js) | Export e import en JSON |
| [api.js](../src/components/Orchestrations/api.js) | Cliente de `/api/orchestrations` y `/api/orchestrate` |
| [runNotifications.js](../src/components/Orchestrations/runNotifications.js) | Avisos del navegador |

El contrato publico no cambio: `Orchestrations.jsx` desestructura las mismas 21 claves y no se toco.

**Metodo.** Primero 36 tests de caracterizacion contra la implementacion vieja ([useOrchestration.test.jsx](../tests/src/useOrchestration.test.jsx)), verificados negativamente; despues la separacion, sin modificar ni un test. Mas 19 tests para las piezas que la separacion hizo testeables por separado.

**Lo que la separacion dejo a la vista:**

- Habia **tres mecanismos** para detener el mismo intervalo: una rama `else` en el efecto, un `clearInterval` dentro del propio tick, y el cleanup del efecto. Se comprobo quitando los dos primeros que el polling se seguia deteniendo. `usePolling` deja solo el cleanup.
- Las seis operaciones CRUD repetian el mismo bloque de `fetch`. La de importacion masiva ademas difería: usaba `data.error || HTTP ${status}` mientras las otras solo `data.error`, que deja el mensaje en `undefined` si el backend responde un error sin cuerpo. Se unifica en la forma completa.
- `start` y `resume` eran casi identicas; ahora comparten una funcion y solo difieren en el cuerpo y en si piden permiso de notificacion.
- El 401 de `/api/orchestrate` significa **sesion SAP expirada**, no falta de auth de API. El cliente lo devuelve marcado en vez de lanzar, para que el llamador no tenga que interpretar codigos HTTP.

Aparte, las diez concatenaciones de alfa al hex que quedaban (`color + '22'`, `` `${color}33` ``) pasan a `withAlpha()`, con una guarda nueva que las bloquea. Tres estaban en la forma `${x}33`, que el barrido del design system no habia detectado.

### Design system (issues #3, #4 y #7)

Referencia completa en [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Los estilos siguen siendo objetos inline: lo que se consolido son los valores y los patrones repetidos, que es lo que el issue #3 pedia ("CSS Modules **o** utilidades").

**Paleta con fuente unica.** Habia 231 colores literales repartidos por los componentes, 94 distintos, y buena parte no eran colores nuevos sino la paleta de `index.css` copiada a mano. Ahora el triplete RGB es el valor primario (`--accent-rgb: 247,168,0` y `--accent: rgb(var(--accent-rgb))`), y los componentes usan `color.*`, `alpha.*()` o `hex.*` de [tokens.js](../src/styles/tokens.js) segun lo que necesiten. **Quedan 12 usos de 10 colores**, todos valores unicos que no son paleta duplicada.

**Escalas adoptadas.** Definir los tokens no alcanzaba: el codigo seguia usando valores sueltos. 189 valores se acercaron al paso mas proximo, con movimientos de 1 o 2 px salvo un padding de 48 que bajo a 40. Dos excepciones deliberadas: la escala de espaciado conserva un paso de 1px, porque es el padding vertical de los micro-badges y redondearlo los colapsa o los duplica; y la tipografica tiene cuatro pasos grandes que no son texto sino glifos, los emoji de los estados vacios y las cruces de cerrar.

**Cuatro duplicaciones estructurales**, todas con el mismo patron: la misma tabla en dos o tres archivos, sin nada que garantizara que coincidieran.

| Que estaba duplicado | Consecuencia real |
|---|---|
| `STATUS_COLORS`/`STATUS_LABELS` en Resumen y GlobalResumen, mas `STATUS_META` en TaskMonitor | La tercera copia habia derivado, ver los defectos abajo |
| La rueda de 8 colores de avatar y su funcion hash, en ConnectionAvatar y Sidebar | La misma conexion podia verse de un color en el sidebar y de otro en su tarjeta |
| `TYPE_COLOR` (PROCESS/TASK), en TaskNode, TaskPalette y Tasks | El badge combinaba **dos violetas**: fondo `#8b5cf6`, texto `var(--purple)` (`#a78bfa`) |
| `STATUS_COLORS[x] \|\| '#64748b'`, diez veces | Ese literal es el color de `pending` escrito a mano |

**Tres defectos de color** que salieron al unificar los estados de SAP:

- `TERMINATION_FAILED` se pintaba naranja en el badge del monitor, **el mismo color que `SUCCESS_WITH_ERRORS_E`**: dos estados distintos con el mismo badge. En los graficos ya era rojo. Se unifica en rojo.
- `FETCHED` y `UNKNOWN` derivaban su fondo de un hex distinto al de su propio color. Ahora `bg` y `border` salen de `withAlpha(color, ...)`, asi que no pueden desincronizarse.
- El badge de tipo de task mezclaba dos violetas, como dice la tabla.

Los estados de nodo del canvas (`canvasUtils.js`) **no** se fusionaron con los de SAP: son otro vocabulario, no los codigos que reporta SAP. El issue #4 los daba por equivalentes.

**Dos idiomas peligrosos, eliminados:**

- Derivar un tinte concatenando al hex (`color + '22'`), en `actionBtn`, `EnvBadge`, `Pill` y `RunLogModal`. Exige que el color sea un hex y produce CSS invalido en silencio si alguien le pasa un `var()`. Ahora `withAlpha()` lanza `TypeError` ante cualquier cosa que no sea un hex de seis digitos: antes devolvia `NaN` y pintaba transparente sin avisar.
- `GroupNode` guardaba su propia mini-paleta con el RGB desarmado campo a campo (`{ color: '#29ABE2', r: 41, g: 171, b: 226 }`) para poder componer `rgba()`.

**Formularios y botones.** Cinco definiciones sueltas de `inputStyle`/`selectStyle`/`labelStyle` pasan a dos familias, que si eran una distincion real: campos de modal (fondo elevado, ancho completo) y campos de barra de herramientas. De los 101 botones inline, cuatro patrones estaban repetidos con deriva; el boton cancelar usaba `--border2` en cuatro archivos y `--border` en Tasks.

**Guardas** ([designTokens.test.js](../tests/src/designTokens.test.js)). Escanean `src/` y fallan ante un color de la paleta escrito a mano, un hex de ocho digitos, un `'#fff'`/`'#000'` suelto, una redefinicion de los estilos de formulario, o un valor fuera de escala. Sin esto la consolidacion se deshace sola con el proximo componente. La unica duplicacion admitida de la paleta es `index.css` <-> `tokens.hex`, y hay un test que falla si una deriva de la otra.

Todas las guardas se verificaron negativamente: reintroduciendo el patron, fallan.

### Dos defectos encontrados al escribir los tests

- **Bypass del guard anti-SSRF** ([api/_ssrf.js](../api/_ssrf.js)): la comprobación de IPv4-mapped solo miraba la forma decimal (`::ffff:127.0.0.1`), pero `new URL()` la normaliza a hex (`::ffff:7f00:1`), así que esa rama nunca se disparaba para URLs del usuario. `https://[::ffff:169.254.169.254]/` (metadata de cloud) pasaba el guard mientras la forma IPv4 plana se bloqueaba bien. Ahora se decodifica la IPv4 embebida y se le aplica la misma política.
- **Token enviado a hosts externos** ([src/apiFetch.js](../src/apiFetch.js)): `isInternalApi` comparaba solo el `pathname`, así que una `URL` o un `Request` absolutos a otro host con path `/api/` se llevaban el `Authorization`. La forma string se salvaba por casualidad. Ahora las tres formas se resuelven contra el origin y se exige mismo origen.

### Configuración de ESLint (issue #2, parte de configuración)

`npm run lint` pasó de 758 errores a exit 0, sin tocar código de producción salvo 8 arreglos triviales:

- `public/legacy/**` (716 problemas, 93% del total) ya no genera ruido: bloque propio con `sourceType: 'script'` y los 15 globals compartidos declarados. **No se ignora el directorio**: `no-undef` sigue activo, que es la regla que aporta valor en 280 KB de JS vanilla con estado global. La lista de globals debe mantenerse en sincronía con [MODULOS-LEGACY.md](MODULOS-LEGACY.md).
- `api/**` recibe `globals.node` (`process`, `Buffer`, `fetch`); `src/**` declara `__APP_VERSION__`; `tests/**` recibe Node + DOM.
- `useTechLogs` se movió de `TechLogs.jsx` a [src/hooks/useTechLogs.js](../src/hooks/useTechLogs.js) para que el archivo del componente exporte solo componentes (Fast Refresh).

### Otros

- Consolidación de `soapCall`: las nueve copias en componentes se unificaron en [src/api/soapCall.js](../src/api/soapCall.js).
- `console.log` de depuración en `RunModal` ahora gateados por el flag de debug (no se filtran en producción).
