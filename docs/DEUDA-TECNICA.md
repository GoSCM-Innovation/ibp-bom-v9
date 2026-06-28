# Deuda técnica

Problemas conocidos detectados en el análisis del proyecto que NO se abordan en cambios puntuales. Sirve como resumen versionado y como índice de los issues de GitHub. La app funciona en producción; nada de esto es un bug que rompa el uso actual, son riesgos de mantenibilidad y escalabilidad.

Severidad: critical (riesgo alto o bloquea evolución), high (impacto fuerte en mantenimiento), medium (fricción), low (mejora menor).

## Resumen

| # | Severidad | Problema | Issue |
|---|---|---|---|
| 1 | critical | Sin tests ni framework de testing | [#1](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/1) |
| 2 | high | Errores de lint preexistentes (incluye hooks condicionales) | [#2](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/2) |
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

### 1. Sin tests (critical)
No hay tests ni runner configurado (no Jest/Vitest en `package.json`). Lógica crítica sin cobertura: parsers SOAP ([api/soap.js](../api/soap.js)), utilidades de fecha/zona ([src/utils/dateUtils.js](../src/utils/dateUtils.js)), grafo de orquestación ([src/components/Orchestrations/canvasUtils.js](../src/components/Orchestrations/canvasUtils.js)), y el motor de ejecución ([api/orchestrate.js](../api/orchestrate.js)).
Recomendación: agregar Vitest + React Testing Library; priorizar utilidades puras y parsers.

### 2. Errores de lint preexistentes (high)
`npm run lint` reporta cientos de problemas. Entre ellos, hooks llamados condicionalmente (`react-hooks/rules-of-hooks`) en [src/components/Orchestrations/canvas/NodeConfigPanel.jsx](../src/components/Orchestrations/canvas/NodeConfigPanel.jsx), que es un riesgo real de correctitud, además de `set-state-in-effect`, `exhaustive-deps` y `no-unused-vars` en varios archivos.
Recomendación: abordar primero `rules-of-hooks`; luego barrer el resto por archivo. Evitar que el número crezca.

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

- Consolidación de `soapCall`: las nueve copias en componentes se unificaron en [src/api/soapCall.js](../src/api/soapCall.js).
- `console.log` de depuración en `RunModal` ahora gateados por el flag de debug (no se filtran en producción).
