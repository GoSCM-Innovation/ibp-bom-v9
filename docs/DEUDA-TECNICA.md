# Deuda técnica

Problemas conocidos detectados en el análisis del proyecto que NO se abordan en cambios puntuales. Sirve como resumen versionado y como índice de los issues de GitHub. La app funciona en producción; nada de esto es un bug que rompa el uso actual, son riesgos de mantenibilidad y escalabilidad.

Severidad: critical (riesgo alto o bloquea evolución), high (impacto fuerte en mantenimiento), medium (fricción), low (mejora menor).

## Resumen

| # | Severidad | Problema | Issue |
|---|---|---|---|
| 1 | ~~critical~~ | ~~Sin tests ni framework de testing~~ — resuelto, ver abajo | [#1](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/1) |
| 2 | medium | Deuda de hooks: queda `set-state-in-effect` en 5 archivos | [#2](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/2) |
| 3 | high | Estilos 100% inline, sin design system | [#3](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/3) |
| 4 | high | Constantes de estado (STATUS) duplicadas | [#4](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/4) |
| 5 | high | `useOrchestration` con demasiadas responsabilidades | [#5](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/5) |
| 6 | high | `VITE_API_TOKEN` público de facto | [#6](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/6) |
| 7 | medium | Estilos de formulario duplicados | [#7](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/7) |
| 8 | medium | Prop drilling de `connection`/`sessionId` | [#8](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/8) |
| 9 | medium | Mezcla español/inglés sin i18n centralizado | [#9](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/9) |
| 10 | medium | Manejo de errores inconsistente | [#10](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/10) |
| 11 | medium | Modales de Run duplicados | [#11](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/11) |
| 12 | low | Bundle único grande (>500 KB) | [#12](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/12) |

## Detalle

### 1. Sin tests (resuelto)
Ver "Resuelto recientemente".

### 2. Deuda de hooks (medium)
`npm run lint` sale en **exit 0**: pasó de 758 errores + 12 warnings a **0 errores + 46 warnings**. La mayor parte de aquellos 758 no era código sino configuración de ESLint (ver "Resuelto recientemente").

Lo que queda es deuda real, degradada a warning con scope por archivo en [eslint.config.js](../eslint.config.js) para que la regla siga siendo error en el resto del repo:

| Regla | Archivos | Qué implica |
|---|---|---|
| ~~`react-hooks/rules-of-hooks`~~ | — | **Resuelto**: era el early return de `NodeConfigPanel` por delante de sus seis hooks. |
| `react-hooks/set-state-in-effect` (6) | [App.jsx](../src/App.jsx), [NodeConfigPanel.jsx](../src/components/Orchestrations/canvas/NodeConfigPanel.jsx), [MobileTaskPicker.jsx](../src/components/Orchestrations/mobile/MobileTaskPicker.jsx), [SystemView.jsx](../src/components/System/SystemView.jsx), [usePromotedTasks.js](../src/hooks/usePromotedTasks.js) | Renders en cascada; casi siempre es marcar "cargando" antes de un fetch. |
| `react-hooks/exhaustive-deps` (12) | Varios | Ya eran warning; no rompen el exit code. |

Los otros 28 warnings son `no-empty` y `no-useless-escape` en `public/legacy`, que no se editan por política.

Queda `set-state-in-effect`, que exige revisar caso por caso si el estado puede derivarse en vez de fijarse en un efecto. El baseline por archivo evita que el número crezca: si un archivo nuevo rompe la regla, falla el CI.

### 3. Estilos inline sin design system (high)
Cientos de objetos `style={{...}}` repartidos por los componentes; no hay clases ni utilidades compartidas (más allá de las variables CSS en `src/index.css`). Cambiar un color o espaciado obliga a editar muchos sitios.
Recomendación: extraer estilos compartidos (CSS Modules o utilidades) y consolidar tokens de spacing/tipografía.

### 4. Constantes de estado duplicadas (high)
`STATUS_COLORS` y `STATUS_LABELS` están definidos de forma casi idéntica en [src/components/Resumen/Resumen.jsx](../src/components/Resumen/Resumen.jsx) y [src/components/Resumen/GlobalResumen.jsx](../src/components/Resumen/GlobalResumen.jsx); `TaskMonitor.jsx` tiene su propia variante (`STATUS_META`) y `canvasUtils.js` otra.
Recomendación: un único módulo `src/constants/status.js` como fuente de verdad.

### 5. `useOrchestration` hace demasiado (high)
[src/components/Orchestrations/useOrchestration.js](../src/components/Orchestrations/useOrchestration.js) mezcla CRUD, ejecución, polling, notificaciones y migración de datos en un solo hook.
Recomendación: separar en hooks por responsabilidad (CRUD, run, polling).

### 6. `VITE_API_TOKEN` público de facto (high)
El token de API queda embebido en el bundle del frontend. Ver [SECURITY.md](SECURITY.md).
Recomendación: migrar a auth por sesión (cookie httpOnly) en vez de token compartido en el cliente.

### 7. Estilos de formulario duplicados (medium)
`inputStyle`/`selectStyle`/`labelStyle` se repiten con variaciones en varios modales y formularios (RunModal, RunSingleModal, NodeConfigPanel, Tasks, Resumen).
Recomendación: un módulo de estilos de formulario compartido, o componentes `Input`/`Select`/`Field`.

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

### Tests: Vitest + React Testing Library (issue #1)

635 tests en 23 archivos bajo [tests/](../tests), corriendo en ~5 s:

- **Backend:** parsers y builders SOAP ([api/soap.js](../api/soap.js), incluido el orden de elementos que exige el XSD de `getTaskLogs` y el decode base64 token por token), guard anti-SSRF, `requireAuth`/`applyCors`, y los validadores de `orchestrations` e `ibp-proxy`.
- **Motor de orquestación** ([api/orchestrate.js](../api/orchestrate.js), 96% de líneas): además de las piezas puras (olas de Kahn, `applyTaskResult`, merge de variables), el bucle de ejecución completo contra un doble en memoria de Redis y SAP. Cubre el avance del grafo entre ticks, la propagación de `skipped` según `errorStrategy`, los reintentos con `retryAt`, los grupos y sus dependencias internas, el lock de ejecución, y el ciclo start/resume/cancel a través del handler.
- **Frontend, lógica pura:** `dateUtils` (incluye cruce de medianoche por offset), `canvasUtils`, `taskMetadata`, `soapCall`, el interceptor `apiFetch`, y los hooks `useBuildCursor`, `useViewport` y `useTechLogs`.
- **Componentes (RTL):** `Sheet` (Escape, bloqueo de scroll, portal, backdrop), `OrchList` (favoritos en `localStorage` y su orden, propagación de eventos en los botones de fila), `ConnectionForm` (orden de validación, normalización de la URL, alta vs edición), `SapLoginModal` (login, y la sesión productiva paralela que se abre en sandbox), `TaskNode` (estados, badge de promovido, estrategia de error), `TechLogs` (agrupado de llamadas consecutivas) e `ImportOrchestrationsModal` (clasificación de duplicadas, aviso de tenant distinto).

Los tests viven en `tests/` y no co-locados: Vercel trata todo archivo dentro de `api/` como función serverless. Detalle en [CONTRIBUTING.md](../CONTRIBUTING.md#tests).

Sin cubrir por ahora: los handlers `connections.js`, `cron-tick.js` y `cids.js`, y —por relación costo/beneficio— los contenedores grandes que son sobre todo orquestación de fetch y markup (`TaskMonitor`, `Resumen`, `GlobalResumen`, `Orchestrations`, `RunModal`). Su lógica de valor ya está testeada por separado en `soapCall`, `dateUtils`, `canvasUtils` y el motor. La cobertura con `@vitest/coverage-v8` queda como decisión aparte, porque implica acordar umbrales para el CI.

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
