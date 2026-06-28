# Arquitectura de CIDS Studio (ibp-bom-v9)

Documento de referencia para entender cómo está construida la aplicación y dónde tocar para extenderla. Para el detalle de los datos SAP y KPIs ver [CATALOGO-DATOS-API.md](CATALOGO-DATOS-API.md); para seguridad ver [SECURITY.md](SECURITY.md).

## 1. Visión general

CIDS Studio es una SPA de React servida por Vercel, con un backend de funciones serverless en la misma plataforma. No hay servidor de aplicación propio: todo el estado compartido vive en Upstash Redis, y las integraciones con SAP se hacen a través de funciones proxy en `/api`.

```
Navegador (React SPA)
   |  fetch /api/*  (Bearer token inyectado por src/apiFetch.js)
   v
Funciones serverless de Vercel (/api)
   |-- _auth / _cors / _ssrf     guardas transversales
   |-- soap / sap-login          SAP CI-DS (SOAP)
   |-- ibp-proxy / cids          SAP IBP (OData) y Explorer legacy
   |-- connections / orchestrations / orchestrate / cron-tick
   v
   |-- SAP CI-DS  (SOAP)         ejecución y monitoreo de tasks
   |-- SAP IBP    (OData)        master data / dataflows
   |-- Upstash Redis             conexiones, orquestaciones, estado de runs
```

### Doble backend SAP

- **SAP CI-DS (SOAP):** núcleo de la app. Ejecución y monitoreo de tasks, agentes, proyectos, logs. Toda la lógica SOAP (construcción de envelopes, parsing de respuestas) vive en [api/soap.js](../api/soap.js).
- **SAP IBP (OData):** usado por los módulos legacy para explorar dataflows y master data, vía [api/ibp-proxy.js](../api/ibp-proxy.js).

## 2. Backend serverless (`/api`)

Cada archivo `.js` en `api/` es una función serverless de Vercel. Los archivos con prefijo `_` son helpers compartidos, no endpoints.

| Archivo | Rol |
|---|---|
| `_auth.js` | `requireAuth(req,res)`: valida `Authorization: Bearer <API_TOKEN>` con comparación timing-safe. |
| `_cors.js` | `applyCors(...)`: allowlist de orígenes desde `ALLOWED_ORIGINS`, maneja preflight `OPTIONS`. |
| `_ssrf.js` | `validatePublicHttpsUrl(url)`: exige HTTPS y rechaza hosts que resuelven a IPs privadas/reservadas. |
| `soap.js` | Cliente SOAP de SAP CI-DS: `logon`, `buildBody`, `buildEnvelope`, `soapCall`, `parseResponse`. Núcleo de datos. |
| `sap-login.js` | Login del frontend contra CI-DS; devuelve `sessionId`. |
| `ibp-proxy.js` | Proxy OData hacia SAP IBP (auth Basic), usado por los módulos legacy. |
| `cids.js` | Proxy del Integration Explorer legacy. |
| `connections.js` | CRUD de conexiones en Redis (`cids:connections`). |
| `orchestrations.js` | CRUD de definiciones de orquestación en Redis (`cids:orchestrations`). |
| `orchestrate.js` | Motor de ejecución: arranca, avanza (`tick`), reanuda y cancela runs, con lock distribuido. |
| `cron-tick.js` | Endpoint para Vercel Cron: avanza (`tick`) las orquestaciones en estado `running`. |

### Guardas transversales

Todo endpoint que recibe input del usuario aplica, en orden: CORS (`applyCors`), auth (`requireAuth`), y para URLs salientes provistas por el usuario, validación SSRF (`validatePublicHttpsUrl`). Las llamadas salientes usan `redirect: 'manual'` para evitar bypass de SSRF vía redirecciones. Detalle en [SECURITY.md](SECURITY.md).

### Persistencia (Upstash Redis)

Se accede al endpoint REST de Upstash (`${KV_REST_API_URL}/pipeline`) con Bearer token. Claves principales (prefijo `cids:`):

| Clave | Contenido |
|---|---|
| `cids:connections` | Array de conexiones. |
| `cids:orchestrations` | Array de definiciones de orquestación. |
| `cids:orch_run:${id}` | Estado de la ejecución actual de una orquestación. |
| `cids:orch_run_lock:${id}` | Lock distribuido (`SET ... NX EX`) para serializar operaciones sobre un run. |

## 3. Frontend (`src/`)

SPA de React 19 con arquitectura hub-and-spoke. No usa React Router: la vista activa se controla por estado en [src/App.jsx](../src/App.jsx) (tabs de conexión + vistas globales). El punto de entrada es [src/main.jsx](../src/main.jsx), que además importa [src/apiFetch.js](../src/apiFetch.js) (interceptor global de `fetch` que inyecta el token Bearer en todas las llamadas a `/api/*`).

### Organización por feature

```
src/
  api/
    soapCall.js          Cliente SOAP compartido del frontend (ver abajo)
  components/
    Connections/         Alta y gestión de conexiones, login SAP
    Resumen/             Dashboards de KPIs (Resumen, GlobalResumen)
    Tasks/               Navegación de tasks (Tasks) y monitor (TaskMonitor)
    Orchestrations/      Orquestador: canvas, panel de tasks, modales de run
      canvas/            Nodos y utilidades del grafo (@xyflow/react)
      mobile/            Editor tipo wizard para móvil
      panel/             Paleta de tasks
    Sidebar/ System/ Legacy/ ui/   Navegación, vista de conexión, iframes legacy, primitivas UI
  hooks/                 usePromotedTasks, useViewport
  utils/                 dateUtils, taskMetadata
```

### Cliente SOAP del frontend: `src/api/soapCall.js`

Todas las vistas que consultan SAP usan la misma función [src/api/soapCall.js](../src/api/soapCall.js). Hace `POST /api/soap` con `{ connection, sessionId, operation, params }`, parsea la respuesta de forma segura, traduce el `401` a un error `isSessionExpired`, y soporta un modo debug.

Históricamente esta función estaba duplicada en nueve componentes. Hoy es un único módulo: al agregar una vista nueva, importar `soapCall` desde aquí en vez de redefinirlo.

Modo debug: activo con `import.meta.env.DEV` o `localStorage.ibpSoapDebug === '1'`. Envía `_debug: true` y loguea metadatos del request/response SOAP en consola. En producción (sin el flag) no loguea nada.

## 4. Gestión de estado

No hay framework de estado global (Redux/Zustand). El estado se reparte por capas:

| Capa | Qué guarda | Dónde |
|---|---|---|
| React hooks (`useState`/`useRef`) | Estado de cada vista (filas, filtros, carga). | En memoria, por componente. |
| `sessionStorage` | `sessionId` de SAP por conexión (`sap_${connId}`, `sap_prod_${connId}`). Se borra al cerrar pestaña. | Navegador, por pestaña. |
| `localStorage` | Conexiones (`ibp_connections`), tabs abiertas (`ibp_open_tabs`), idioma, flag de debug. | Navegador, persistente. |
| Upstash Redis | Conexiones, orquestaciones y estado de runs (compartido entre clientes y cron). | Backend. |
| IndexedDB | Datasets grandes de BOM / supply network. | Solo módulos legacy. |

El `connection` y el `sessionId` se pasan por props a través de la jerarquía de vistas (prop drilling). La autenticación SAP es por sesión: la contraseña nunca se almacena (ver [SECURITY.md](SECURITY.md)).

## 5. Flujos de datos clave

### Monitoreo de tasks

```
Vista (TaskMonitor/Resumen) -> soapCall(connection, sessionId, 'getAllExecutedTasks2', ...)
  -> POST /api/soap -> applyCors -> requireAuth -> soap.js
     -> buildEnvelope + soapCall(SAP) -> parseResponse -> JSON
  <- la vista renderiza tabla/gráficos; enriquece duraciones con getTaskStatusByRunId2
```

### Ejecución de orquestaciones

```
RunModal -> POST /api/orchestrate (start)
  orchestrate.js -> withRunLock(id): crea estado de run en Redis (status 'running'),
                    ejecuta el primer paso (runTask en SAP), guarda runId del paso
Polling / Vercel Cron -> /api/cron-tick -> tick(id) por cada orquestación 'running'
  tick() -> withRunLock(id): consulta estado de cada paso pendiente (getTaskStatusByRunId2),
            avanza al siguiente paso o aplica estrategia de error/reintento,
            actualiza el estado del run en Redis
```

El lock distribuido (`SET ... NX EX` sobre `cids:orch_run_lock:${id}`) evita que dos invocaciones (un cliente y el cron, o dos ticks del cron) avancen el mismo run a la vez. El endpoint de cron requiere `CRON_SECRET`; la frecuencia se configura en el proyecto de Vercel (no está fijada en `vercel.json`).

### Ciclo de conexión y sesión

```
1. Alta de conexión:  Connections -> POST /api/connections -> Redis
2. Login SAP:         SapLoginModal -> POST /api/sap-login -> logon() en CI-DS -> sessionId
                      -> sessionStorage.setItem('sap_${connId}', sessionId)
3. Uso:               cualquier vista -> soapCall(...) con el sessionId
4. Expiración:        un 401 lanza un error isSessionExpired; la vista de conexión
                      muestra el banner de reconexión
```

## 6. Módulos legacy (`public/legacy/`)

Dos herramientas en vanilla JS, anteriores a la app React, embebidas vía iframe ([src/components/Legacy/LegacyModuleView.jsx](../src/components/Legacy/LegacyModuleView.jsx)):

- **Integration Explorer** (`integration-explorer.html` + `explorer.js`): explora integraciones CI-DS, marca tasks "promovidas".
- **Mapping Dataflow Generator** (`mapping-dataflow.html` + `docs.js`): parsea dataflows y genera mapeos exportables a Excel.

Cargan grandes volúmenes de datos de SAP IBP (OData, vía `/api/ibp-proxy`) y los persisten en IndexedDB (`ibp_data`). Tienen su propio i18n (`public/legacy/i18n/`). Son archivos grandes (`docs.js` y `explorer.js` superan los 90 KB) y se tratan como caja negra estable; ver deuda asociada en [DEUDA-TECNICA.md](DEUDA-TECNICA.md).

## 7. Build, deploy y versionado

- **Build:** Vite genera `dist/` (SPA). Config en [vite.config.js](../vite.config.js).
- **Ruteo:** [vercel.json](../vercel.json) reescribe `/api/connections/:id` a la función `connections`, deja pasar `/api/*`, y manda el resto a `index.html` (ruteo SPA).
- **Deploy:** automático en Vercel al hacer push a `master`.
- **Versionado:** GitHub Actions sube la versión patch automáticamente ([.github/workflows/version-bump.yml](../.github/workflows/version-bump.yml)); los commits de bump llevan `[skip ci]`.

## 8. Convenciones para extender

- Nueva consulta SAP: usar `soapCall` de `src/api/soapCall.js`; agregar el parser de la operación en `api/soap.js` si es una operación nueva.
- Nuevo endpoint: aplicar `applyCors` + `requireAuth`, y `validatePublicHttpsUrl` si la función hace requests salientes con URL del usuario.
- Nueva vista: feature-folder bajo `src/components/`, recibir `connection`/`sessionId` por props.
- Estado compartido entre clientes o necesario para el cron: Redis con prefijo `cids:`.
