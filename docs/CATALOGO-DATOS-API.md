# Catálogo de datos disponibles desde SAP CI-DS

> Documento para Customer Success — definición de KPIs prioritarios para IBP-BOM
> Audiencia: CS + Producto · Decisiones a tomar: qué KPIs priorizar para el roadmap

---

## Cómo leer este documento

Cada sección agrupa **una fuente de datos** (lo que la API SAP CI-DS expone), describe los campos que retorna y lista los KPIs / reportes que se pueden construir con ellos.

**Marcadores de costo** (qué tan caro es agregar el KPI):

- 🟢 **Gratis** — el dato ya se carga hoy en alguna pantalla; se reusa sin nuevas llamadas
- 🟡 **Llamada extra única** — 1 llamada adicional por conexión; barato
- 🔴 **N+1** — requiere una llamada por cada ejecución o task; caro a escala (cientos de runs)

**Marcadores de estado:**
- ✅ ya implementado en la app
- ⬜ disponible pero no implementado todavía
- ❌ no se puede obtener desde la API actual

> **Caveat:** Esta documentación se basa en los parsers SOAP actuales en `api/soap.js`. Es posible que la API SAP retorne campos adicionales que el parser no extrae hoy. Antes de comprometer un KPI nuevo conviene validarlo contra una llamada real (1 hora con credenciales reales basta).

---

## 1. Ejecuciones de tasks (qué se ejecutó y cuándo)

**Operación:** `getAllExecutedTasks2`
**Costo:** 🟢 — ya se carga en Resumen, Task Monitor y Resumen Global
**Filtros disponibles:** rango de fechas (máx 90 días por límite de SAP), nombre de task, código de estado

### Datos por ejecución

| Campo | Descripción |
|---|---|
| `runId` | ID único de ejecución |
| `jobId` | ID del job interno SAP |
| `startDate` | Timestamp de inicio (epoch ms) |
| `statusCode` | Estado: SUCCESS · ERROR · RUNNING · QUEUEING · IMPORTED · FETCHED · TERMINATED · TERMINATION_FAILED · SUCCESS_WITH_ERRORS_D · SUCCESS_WITH_ERRORS_E |
| `taskName` | Nombre del task ejecutado |

### KPIs derivables sin costo extra

- ✅ Total de ejecuciones por período
- ✅ Tasa de éxito / fracaso
- ✅ Distribución por estado (donut)
- ✅ Tendencia diaria (bar chart apilado)
- ✅ Top tasks más ejecutadas
- ✅ Últimas tareas fallidas
- ⬜ **Top tasks que más fallan** (con tasa de falla por task — distinto al top de frecuencia)
- ⬜ **Distribución horaria** (en qué horas del día se concentran las cargas)
- ⬜ **Distribución por día de la semana** (patrón laboral / fines de semana)
- ⬜ **Tareas únicas ejecutadas** en el período (cuántos tasks distintos)
- ⬜ **Racha de éxitos / fallos consecutivos** (calidad reciente)
- ⬜ **Tiempo desde última ejecución exitosa** por task (cuáles están abandonados)
- ⬜ **Heatmap de actividad** (día × hora)
- ⬜ **Tasas comparadas entre clientes** (con el filtro por cliente ya implementado)

### Lo que NO está en esta respuesta

- ❌ Duración de la ejecución
- ❌ Agente que la ejecutó
- ❌ Volumen de datos procesados
- ❌ Data store afectado
- ❌ Usuario / orquestador que la disparó

---

## 2. Detalle de una ejecución individual

**Operación:** `getTaskStatusByRunId2`
**Costo:** 🔴 — una llamada por cada `runId`

### Datos

| Campo | Descripción |
|---|---|
| `projectName` | Proyecto al que pertenece el task |
| `jobId` | Job ID interno |
| `statusCode` | Estado actual |
| `statusMsg` | Mensaje de estado / error |
| `startTime`, `endTime` | Tiempos precisos |
| `executionTime` | **Duración** |
| `description` | Descripción del run |
| `uploadBatchInfos[]` | Lista de batches con `id, name, startTime` (probablemente el "batch" referencia el data store cargado, validar con CS) |

### KPIs derivables

- 🟡 **Duración promedio por task** — KPI clásico de performance
- 🟡 **Tasks más lentos** (ranking por p50 / p95 de duración)
- 🟡 **Distribución de duraciones** (boxplot, percentiles)
- 🟡 **Stats por proyecto** (cruzando `projectName` con executions)
- 🟡 **Volumen procesado por ejecución** (vía `uploadBatchInfos[]` — a confirmar con SAP real)

### Estrategia de mitigación del costo N+1

- Calcular solo para tasks "interesantes" (top 20, solo fallidas, top más frecuentes)
- Cachear: los runs terminados no cambian; clave Redis con TTL largo
- Limitar a los últimos N runs por carga
- Carga lazy: usuario hace click → se calcula

---

## 3. Catálogo de tasks (qué tasks existen)

### `getProjects` — proyectos del sistema
**Costo:** 🟡 — 1 llamada por conexión
**Datos:** `name, guid, description`

### `getProjectTasks(projectGuid)` — tasks de un proyecto
**Costo:** 🟡 — 1 llamada por proyecto
**Datos:** `taskName, description, taskGuid, type`

### `searchTasks(nameFilter)` — búsqueda por nombre
**Costo:** 🟡 — 1 llamada
**Datos:** mismo set que getProjectTasks

### `getTaskInfo(taskGuid)` — detalle del task
**Costo:** 🔴 — 1 llamada por task

| Campo | Descripción |
|---|---|
| `taskName, taskGuid, description, type` | Identificación |
| `globalVariables[]` | Variables: `name, description, dataType, defaultValue, length` |
| `properties[]` | Propiedades del task: `name, value, caption` |

### KPIs derivables

- ⬜ **Inventario total de tasks** por sistema (uno o varios clientes)
- ⬜ **Tasks por proyecto** (concentración: ¿hay un proyecto con 80% de los tasks?)
- ⬜ **Distribución por tipo** (PROCESS, etc. — depende de la nomenclatura SAP)
- ⬜ **Coverage**: tasks definidos vs ejecutados en el período (¿qué % está activo?)
- ⬜ **Tasks "huérfanos"** (definidos hace mucho y nunca ejecutados)
- ⬜ **Tasks con muchas variables vs simples** (proxy de complejidad)

---

## 4. Agentes (dónde se ejecutan los tasks)

**Operación:** `getAgents`
**Costo:** 🟢 — ya se carga en Resumen
**Estructura:** grupos de agentes; cada grupo contiene `agents[]`

### Datos por grupo
| Campo | Descripción |
|---|---|
| `name, guid, description` | Identificación del grupo |

### Datos por agente (dentro del grupo)
| Campo | Descripción |
|---|---|
| `name, guid, description` | Identificación |
| `lastConnected` | Timestamp última conexión |
| `version` | Versión del agente desplegado |
| `agentStatus` | `CONNECTED` · `MAINTENANCE` · otros (a confirmar) |

### KPIs derivables

- ✅ Listado de agentes y su estado actual (Resumen por conexión)
- ⬜ **Agentes desconectados / en mantenimiento** (alerta proactiva)
- ⬜ **Drift de versiones** — qué % está en la versión más reciente
- ⬜ **Agentes "stale"** — `lastConnected` > N días → posible problema de infraestructura
- ⬜ **Capacidad** — cuántos agentes activos por grupo / por cliente

### Lo que NO está aquí

- ❌ Carga actual de cada agente (no hay métrica de tasks corriendo en ese agente directamente desde getAgents)
- ❌ Histórico de uso por agente (no hay agente en `getAllExecutedTasks2`)

---

## 5. Sistemas configurados y data stores

**Operación:** `getSystemConfigurations`
**Costo:** 🟡 — 1 llamada por conexión
**Datos:**

| Campo | Descripción |
|---|---|
| `name, guid, description` | Identificación del sistema configurado |
| `dsConfigurations[].dataStoreName` | Nombre del data store |
| `dsConfigurations[].dataStoreConfigurationName` | Nombre de la configuración del data store |

### KPIs derivables

- ⬜ **Inventario de data stores por cliente** (cuántos sistemas / data stores tiene cada uno)
- ⬜ **Configuraciones por data store** (concentración / dispersión)
- ⬜ **Distribución de complejidad de tenant** (clientes con muchos data stores vs pocos)

### El cruce "ejecuciones por data store" es complicado

`getAllExecutedTasks2` NO retorna el data store afectado. Para correlacionar tasks ejecutados con data stores hay que uno de:

1. **Vía `uploadBatchInfos` en `getTaskStatusByRunId2`** — N+1, pero relativamente fácil. Probablemente el `name` del batch referencia el data store. **Validar con SAP real**.
2. **Vía convención de naming** en `taskName` (ej: `ZIBP_LOAD_<DATASTORE>_*`) — frágil, depende de cada cliente.
3. **Vía `getTaskInfo` + properties** — el task definition probablemente tiene la metadata del data store en `properties[]`. N+1 también.

> **Acción para CS**: confirmar con SAP/clientes si existe convención de naming uniforme. Si la respuesta es no, vamos por la vía 1 (uploadBatchInfos).

---

## 6. Logs de ejecución

**Operación:** `getTaskLogs(runId)`
**Costo:** 🔴 — 1 llamada por runId
**Datos:**

| Tipo de log | Descripción |
|---|---|
| `monitorLog` | Log de monitoreo (status, contadores) |
| `traceLog` | Trace técnico detallado |
| `errorLog` | Errores específicos |

Cada log retorna `messageLines[]`, `maxPage`, `pageNum`, `jobRunStatus`. Soporta paginación.

### KPIs derivables (requieren minería de texto)

- ⬜ **Top patrones de error** (frecuencia de mensajes recurrentes)
- ⬜ **Errores por código SAP** (extracción de códigos del errorLog)
- ⬜ **Errores nuevos vs crónicos** (alertar cuando aparece uno nunca visto)
- ⬜ **Mean time to resolve** si se cruza con runs de retry posteriores

⚠️ Requiere análisis NLP / regex sobre logs reales. Recomendable **solo si hay un caso de uso concreto** (ej: alertas inteligentes), no como KPI standalone.

---

## Operaciones disponibles para acciones (no para KPIs)

Estas operaciones existen pero son **acciones** sobre el sistema, no fuentes de KPIs:

| Operación | Acción | Estado en la app |
|---|---|---|
| `runTask` | Disparar un task | ✅ Usado en Tasks y Orquestaciones |
| `cancelTask` | Cancelar una ejecución | ✅ Usado en Task Monitor |
| `ping` | Health check | ✅ Test de conexión |
| `logon` / `logout` | Autenticación | ✅ Login modal |

---

## Sumario priorizado — propuesta de KPIs para CS

### Quick wins (sin costo extra, valor alto) — sprint corto

1. **Top tasks que más fallan (con tasa de falla)** — facilita troubleshooting reactivo
2. **Distribución horaria de ejecuciones** — visibilidad de picos de carga
3. **Distribución por día de la semana** — patrón laboral
4. **Agentes inactivos / desconectados** (alertas) — visibilidad proactiva
5. **Tareas únicas ejecutadas** vs total — diversidad operacional
6. **Tasas comparativas entre clientes** — aprovecha el filtro multi-cliente recién implementado

### Mid-effort (1 llamada extra por carga) — 1-2 sprints

7. **Inventario de data stores por cliente** (vía `getSystemConfigurations`)
8. **Coverage de tasks** (definidos vs ejecutados, cruzando `getProjectTasks` con `getAllExecutedTasks2`)
9. **Drift de versiones de agentes** (vía field `version` ya disponible)

### High-effort (N+1, necesita caching) — sprint dedicado

10. **Duración promedio por task** — perf KPI clásico
11. **Tasks más lentos** (ranking por p95)
12. **Volumen procesado por ejecución** (vía `uploadBatchInfos`, **a validar con SAP real**)
13. **Tasa de éxito por data store** (cruzando vía `uploadBatchInfos` o convención de naming)

### NO obtenibles desde la API actual

- ❌ **Costo en créditos / billing SAP** — no hay endpoint
- ❌ **Usuario que disparó la ejecución** — no viene en `getAllExecutedTasks2`; sí en orquestaciones nuestras (Redis), pero no para tasks ejecutados externamente
- ❌ **SLA breach** — requiere definir SLAs externamente y compararlos
- ❌ **Comparación cualitativa entre clientes** ("salud del tenant") — requiere combinar varios KPIs en un score, definir metodología con CS

---

## Próximos pasos sugeridos

1. **CS revisa este documento** y selecciona 3-5 KPIs prioritarios de la lista
2. **Sesión de validación con SAP real** (1 hora, con credenciales) para confirmar:
   - Estructura exacta de `uploadBatchInfos` (¿incluye nombre del data store?)
   - Valores posibles de `agentStatus` y `properties[].name` en `getTaskInfo`
   - Si hay convención de naming uniforme entre clientes
3. **Implementar primero los 🟢** (sin costo extra) para liberar valor rápido
4. Para **🟡 y 🔴** definir estrategia de caching (Redis con TTL diferente según tipo de dato)

---

> Última actualización: 2026-05-07 · Mantener al día cuando se descubran nuevos campos o se cambien parsers en `api/soap.js`
