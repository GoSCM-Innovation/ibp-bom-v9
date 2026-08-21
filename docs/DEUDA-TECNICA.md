# Deuda técnica

Problemas conocidos detectados en el análisis del proyecto que NO se abordan en cambios puntuales. Sirve como resumen versionado y como índice de los issues de GitHub. La app funciona en producción; nada de esto es un bug que rompa el uso actual, son riesgos de mantenibilidad y escalabilidad.

Severidad: critical (riesgo alto o bloquea evolución), high (impacto fuerte en mantenimiento), medium (fricción), low (mejora menor).

## Resumen

| # | Severidad | Problema | Issue |
|---|---|---|---|
| 1 | ~~critical~~ | ~~Sin tests ni framework de testing~~ — resuelto, ver abajo | [#1](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/1) |
| 2 | ~~high~~ | ~~Errores de lint preexistentes~~ - resuelto, ver abajo | [#2](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/2) |
| 3 | high | Estilos inline sin design system — parcial, ver abajo | [#3](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/3) |
| 4 | ~~high~~ | ~~Constantes de estado (STATUS) duplicadas~~ — resuelto, ver abajo | [#4](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/4) |
| 5 | high | `useOrchestration` con demasiadas responsabilidades | [#5](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/5) |
| 6 | high | `VITE_API_TOKEN` público de facto | [#6](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/6) |
| 7 | ~~medium~~ | ~~Estilos de formulario duplicados~~ — resuelto, ver abajo | [#7](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/7) |
| 8 | medium | Prop drilling de `connection`/`sessionId` | [#8](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/8) |
| 9 | medium | Mezcla español/inglés sin i18n centralizado | [#9](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/9) |
| 10 | medium | Manejo de errores inconsistente | [#10](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/10) |
| 11 | medium | Modales de Run duplicados | [#11](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/11) |
| 12 | low | Bundle único grande (>500 KB) | [#12](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/12) |
| 22 | low | Alcance de la medición de cobertura de tests | [#22](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/22) |

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

### 3. Estilos inline sin design system (high, parcial)
Hay un design system documentado en [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md): paleta con fuente única, escalas de tipografía y radio, y módulos compartidos para formularios, botones y estados. Ver "Resuelto recientemente".

**Lo que sigue abierto**, y por qué se dejó:

- **Los 735 objetos `style={{...}}` siguen inline.** Se consolidaron los valores y los patrones repetidos, no la forma de aplicarlos. Pasarlos a CSS Modules es un cambio de otra escala, con un diff enorme sobre contenedores que no tienen cobertura de tests.
- **El espaciado no tiene escala.** Los 27 valores distintos de `padding`/`margin` se concentran en 8 números, así que definirla es viable, pero snapear los sueltos mueve píxeles y eso necesita revisión visual.
- **Quedan ~38 colores que no son de la paleta**, casi todos tonos de estado usados de forma decorativa fuera de `constants/status.js`. Decidir si entran a la paleta o se derivan del estado es la parte que falta.
- **`#fff` y `#000` siguen sueltos** (35 usos). Tienen token pero se usan con dos sentidos distintos, jerarquía tipográfica y contraste sobre el acento, y unificarlos requiere decidir cuál es cuál en cada sitio.
- **Los 11 handlers `onMouseEnter`/`onMouseLeave` que simulan `:hover` en JS** siguen ahí: son la consecuencia directa de no tener clases.

### 4. Constantes de estado duplicadas (resuelto)
Ver "Resuelto recientemente".

### 5. `useOrchestration` hace demasiado (high)
[src/components/Orchestrations/useOrchestration.js](../src/components/Orchestrations/useOrchestration.js) mezcla CRUD, ejecución, polling, notificaciones y migración de datos en un solo hook.
Recomendación: separar en hooks por responsabilidad (CRUD, run, polling).

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

### Design system: paleta, estados, formularios y botones (issues #4, #7 y parte de #3)

Referencia completa en [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Los estilos siguen siendo objetos inline; lo que se consolidó son los valores y los patrones repetidos.

**Paleta con fuente única.** Había 231 colores literales repartidos por los componentes, 94 distintos, y buena parte no eran colores nuevos sino la paleta de `index.css` copiada a mano. Ahora el triplete RGB es el valor primario (`--accent-rgb: 247,168,0` y `--accent: rgb(var(--accent-rgb))`), y los componentes usan `color.*`, `alpha.*()` o `hex.*` de [tokens.js](../src/styles/tokens.js) según lo que necesiten. Quedan 73 usos literales, todos de colores que no están en la paleta o `#fff`/`#000`.

Dos idiomas peligrosos que se eliminaron de paso:

- Derivar un tinte concatenando al hex (`color + '22'`), en `actionBtn`, `EnvBadge`, `Pill` y `RunLogModal`. Exige que el color sea un hex y produce CSS inválido en silencio si alguien le pasa un `var()`. Pasan a `withAlpha()`.
- `GroupNode` guardaba su propia mini-paleta con el RGB desarmado campo a campo (`{ color: '#29ABE2', r: 41, g: 171, b: 226 }`) para poder componer `rgba()`.

**Estados de SAP unificados** ([constants/status.js](../src/constants/status.js)). `STATUS_COLORS`/`STATUS_LABELS` estaban duplicados idénticos en `Resumen.jsx` y `GlobalResumen.jsx`, y `TaskMonitor.jsx` tenía su propio `STATUS_META` con los `rgba()` a mano. Esa tercera copia había derivado y producía dos defectos visibles:

- `TERMINATION_FAILED` se pintaba naranja en el badge del monitor, **el mismo color que `SUCCESS_WITH_ERRORS_E`**: dos estados distintos con el mismo badge. En los gráficos ya era rojo. Se unifica en rojo.
- `FETCHED` y `UNKNOWN` derivaban su fondo de un hex distinto al de su propio color. Ahora `bg` y `border` salen de `withAlpha(color, …)`, así que no pueden desincronizarse.

Los estados de nodo del canvas (`canvasUtils.js`) **no** se fusionaron: son otro vocabulario, no los códigos que reporta SAP. El issue los daba por equivalentes.

**Formularios** ([styles/forms.js](../src/styles/forms.js)). Cinco definiciones sueltas de `inputStyle`/`selectStyle`/`labelStyle` pasan a dos familias, que sí eran una distinción real: campos de modal (fondo elevado, ancho completo) y campos de barra de herramientas. Se normalizaron diferencias de un píxel o un tono: el `select` de Tasks era más oscuro que la superficie del modal donde vive, al revés que todos los demás.

**Botones** ([styles/buttons.js](../src/styles/buttons.js)). De los 101 botones inline, cuatro patrones estaban repetidos con deriva. El botón cancelar de los modales usaba `--border2` en cuatro archivos y `--border` en Tasks; los dos "+ Nueva conexión" tenían otro radio y otro padding que el resto de las primarias.

**Guardas** ([designTokens.test.js](../tests/src/designTokens.test.js), 12 tests). Escanean `src/` y fallan si vuelve a aparecer un color de la paleta escrito a mano, o si alguien redefine `inputStyle`/`selectStyle`/`labelStyle` por su cuenta. Sin esto la consolidación se deshace sola con el próximo componente. La única duplicación admitida de la paleta es `index.css` ↔ `tokens.hex`, y hay un test que falla si una deriva de la otra. Verificado negativamente: los tres guardas fallan al reintroducir el patrón.

### Tests: Vitest + React Testing Library (issue #1)

635 tests en 23 archivos bajo [tests/](../tests), corriendo en ~5 s:

- **Backend:** parsers y builders SOAP ([api/soap.js](../api/soap.js), incluido el orden de elementos que exige el XSD de `getTaskLogs` y el decode base64 token por token), guard anti-SSRF, `requireAuth`/`applyCors`, y los validadores de `orchestrations` e `ibp-proxy`.
- **Motor de orquestación** ([api/orchestrate.js](../api/orchestrate.js), 96% de líneas): además de las piezas puras (olas de Kahn, `applyTaskResult`, merge de variables), el bucle de ejecución completo contra un doble en memoria de Redis y SAP. Cubre el avance del grafo entre ticks, la propagación de `skipped` según `errorStrategy`, los reintentos con `retryAt`, los grupos y sus dependencias internas, el lock de ejecución, y el ciclo start/resume/cancel a través del handler.
- **Frontend, lógica pura:** `dateUtils` (incluye cruce de medianoche por offset), `canvasUtils`, `taskMetadata`, `soapCall`, el interceptor `apiFetch`, y los hooks `useBuildCursor`, `useViewport` y `useTechLogs`.
- **Componentes (RTL):** `Sheet` (Escape, bloqueo de scroll, portal, backdrop), `OrchList` (favoritos en `localStorage` y su orden, propagación de eventos en los botones de fila), `ConnectionForm` (orden de validación, normalización de la URL, alta vs edición), `SapLoginModal` (login, y la sesión productiva paralela que se abre en sandbox), `TaskNode` (estados, badge de promovido, estrategia de error), `TechLogs` (agrupado de llamadas consecutivas) e `ImportOrchestrationsModal` (clasificación de duplicadas, aviso de tenant distinto).

Los tests viven en `tests/` y no co-locados: Vercel trata todo archivo dentro de `api/` como función serverless. Detalle en [CONTRIBUTING.md](../CONTRIBUTING.md#tests).

Sin cubrir por ahora: los handlers `connections.js`, `cron-tick.js` y `cids.js`, y —por relación costo/beneficio— los contenedores grandes que son sobre todo orquestación de fetch y markup (`TaskMonitor`, `Resumen`, `GlobalResumen`, `Orchestrations`, `RunModal`). Su lógica de valor ya está testeada por separado en `soapCall`, `dateUtils`, `canvasUtils` y el motor. La medición de cobertura con `@vitest/coverage-v8` se trata por separado en [#22](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/22): implica acordar umbrales para el CI, y un umbral global se leería engañosamente bajo por esos contenedores que se dejaron sin testear a propósito.

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
