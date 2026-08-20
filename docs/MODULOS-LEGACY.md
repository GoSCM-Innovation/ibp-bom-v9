# Módulos legacy: Mapping Dataflow Generator e Integration Explorer

Dos herramientas en vanilla JS que viven en [public/legacy/](../public/legacy/) y se embeben en la SPA de React mediante iframe. Este documento explica qué hacen, cómo están integradas y cómo mantenerlas. Complementa la visión general de [ARCHITECTURE.md](ARCHITECTURE.md) (sección 6).

## 1. Origen y alcance

Se migraron desde el repositorio `ibp-bom-v7` (una app vanilla JS de GoSCM servida por un `server.js` Express en Vercel). De esa app **solo** se trajeron estas dos herramientas; el resto de v7 (Production Hierarchy, Supply Network Analyzer, Network Visualizer) no se migró.

- Son **vanilla JS sin build**: ni Vite ni React las procesan; Vite las copia tal cual de `public/` a `dist/` y se sirven como estáticos.
- En v7 eran pestañas de un único `index.html`. En v9 son **dos páginas standalone independientes**: [integration-explorer.html](../public/legacy/integration-explorer.html) y [mapping-dataflow.html](../public/legacy/mapping-dataflow.html).

### Diferencias clave respecto a v7

| Aspecto | v7 | v9 |
|---|---|---|
| Backend | `server.js` Express monolítico | Funciones serverless de Vercel ([api/ibp-proxy.js](../api/ibp-proxy.js), [api/cids.js](../api/cids.js)) |
| Endpoints IBP | `/api/proxy` + `/api/proxy-xml` + `/api/proxy-next` | `/api/ibp-proxy` con discriminador `kind` (`json` \| `xml` \| `next`) |
| Endpoints CI-DS | `/api/cids-login` + `/api/cids-soap` | `/api/cids` con `action` (`login` \| `soap`) |
| Auth de `/api` | Sin token (rate limit + allowlist de host) | `Authorization: Bearer` obligatorio (ver más abajo) |
| UI | Un `index.html` con pestañas | Dos páginas standalone |
| Generación de Excel | ExcelJS (CDN) | OOXML nativo con JSZip (sin ExcelJS) |
| i18n | No existía | Sistema propio (`i18n.js` + `i18n/*.json`) |

## 2. Integración con la SPA de React

- **Montaje:** [src/components/Legacy/LegacyModuleView.jsx](../src/components/Legacy/LegacyModuleView.jsx) renderiza cada página en un `<iframe>` con `sandbox`. El menú ([src/components/Sidebar/Sidebar.jsx](../src/components/Sidebar/Sidebar.jsx)) y el enrutado por estado en [src/App.jsx](../src/App.jsx) (`LEGACY_MODULES`) deciden cuál se muestra.
- **Puente del token Bearer:** el iframe tiene su propio `window`, así que el interceptor de [src/apiFetch.js](../src/apiFetch.js) no lo cubre. En su lugar:
  1. `LegacyModuleView` envía `VITE_API_TOKEN` al iframe por `postMessage` (al `load` y al recibir `ibp-iframe-ready`).
  2. Un script inline al inicio de cada HTML legacy parchea `window.fetch` para añadir `Authorization: Bearer <token>` a las llamadas a `/api/*` (espejo de `apiFetch.js`).
- **Backend en local:** con `npm run dev`, el middleware de desarrollo de [vite.config.js](../vite.config.js) monta los handlers de `api/*.js` y responde `/api/*` en el mismo puerto. En producción lo sirven las funciones de Vercel. (Históricamente las sub-apps "no funcionaban" en local porque `npm run dev` no servía `/api`; ver [DEUDA-TECNICA.md](DEUDA-TECNICA.md).)

## 3. Estructura de archivos (`public/legacy/`)

| Archivo | Rol |
|---|---|
| `integration-explorer.html` / `mapping-dataflow.html` | Páginas; cargan CDN, CSS y los `js/*.js` en orden. |
| `js/i18n.js` | Internacionalización (ES/EN). |
| `js/state.js` | Estado global: `CFG` (conexión IBP), índices, etc. |
| `js/utils.js` | Helpers: `str`, `escH` (escape HTML), `log`. |
| `js/api.js` | Cliente OData de IBP: `decomposeODataUrl`, `apiJson`/`apiXml`/`apiJsonNext`, `fetchAllPages` (paginación). |
| `js/docs.js` | **Mapping Dataflow Generator** + el parser CI-DS compartido. |
| `js/explorer.js` | **Integration Explorer** (IIFE `Explorer`). |
| `i18n/es.json`, `i18n/en.json` | Diccionarios de traducción. |
| `css/styles.css` | Estilos (paleta GoSCM, design tokens). |
| `ci-ds-export.png` | Ayuda visual del export de CI-DS. |

**Orden de carga de scripts** (en ambas páginas): `i18n.js` → `state.js` → `utils.js` → `api.js` → `docs.js`; `integration-explorer.html` añade `explorer.js` al final (depende del parser de `docs.js`). Helpers globales compartidos por todos: `CFG` (state), `I18n` (i18n), `str`/`escH`/`log` (utils), `fetchAllPages` (api).

Son scripts globales clásicos, no módulos ES: salvo `i18n.js` (que es un IIFE y publica `window.I18n`), los archivos son fragmentos planos cuyas declaraciones de nivel superior van al scope global.

> **Sincronizar con ESLint.** El bloque `public/legacy/**` de [eslint.config.js](../eslint.config.js) declara estos globals compartidos para que `no-undef` siga siendo útil sin marcar 642 falsos positivos. Al agregar un helper global nuevo a estos scripts, agregarlo también a esa lista. La lista actual: `I18n`, `CFG`, `IDB`, `escH`, `log`, `fetchAllPages`, `apiJson`, `apiXml`, `buildSelect`, `normalizeRows`, `parseBatchCsv`, `parseIntegration`, `parseATL`, más `JSZip` y `vis` de los CDN.

**Dependencias CDN** (con SRI):
- `integration-explorer.html`: `vis-network@10.0.2` (grafo) + `jszip@3.10.1` (lectura de ZIP).
- `mapping-dataflow.html`: `jszip@3.10.1` (lectura de ZIP y escritura nativa del `.xlsx`). No usa vis-network ni ExcelJS.

## 4. Mapping Dataflow Generator (`docs.js`)

Genera un Excel de documentación a partir de exports ZIP de proyectos SAP CI-DS: por cada dataflow extrae mapeos, filtros, lookups y variables, y los vuelca a una planilla.

La conexión a SAP IBP es **opcional** (panel en la propia página → rellena `CFG.url`/`CFG.user`/`CFG.pass`; al conectar se cargan las planning areas del tenant en un selector que fija `CFG.pa`). Usa Basic Auth con un communication user y sirve para tres cosas: enriquecer las descripciones y tipos de campo, traer una fila de datos real como ejemplo, y habilitar los modos basados en Application Jobs.

### Parser CI-DS compartido

Definido en `docs.js` y reutilizado también por el Explorer:
- `parseBatchCsv(zip)`: extrae `batch.csv` del ZIP → metadatos de datastores por XML.
- `parseIntegration(xmlStr, batchEntry)`: parsea el XML de la integración → array de objetos `parsed`.

Campos relevantes del objeto `parsed`: `jobName`, `dataflowName`, `dataflowGuid`, `tipoIntegracion` (`MD` \| `KF` \| `FILE`), `targetTable`, `srcDSName`, `dstDSName`, `fileLoaderFileName`, `mappings`, `filters`, `lookups`, `variables`, `planArea` (de `$G_PLAN_AREA`, fallback del `PLANNINGAREA`).

### Modos

1. **Desde ZIP** (`generate` → `buildExcel`): 100% frontend. ATL opcional para enriquecer cada dataflow con el proceso y grupo a los que pertenece; se asocia por GUID (primario) o por nombre del dataflow (fallback).
2. **Desde Application Jobs** (`fetchAndDisplayJobs` → `generateFromJobs`): conecta a IBP (`BC_EXT_APPJOB_MANAGEMENT;v=0002`, requiere Communication Arrangement `SAP_COM_0326`), lista los jobs, resuelve el task CI-DS real de cada paso por `P_TSKID` y lo cruza con ZIPs/ATL.
3. **ZIP + Jobs** (`generateZipJobs`): sube ZIPs y los enriquece automáticamente con la estructura de jobs de IBP, sin necesidad de ATL.

### Enriquecimiento desde IBP

- `fetchIbpMeta()`: pide el `$metadata` de `MASTER_DATA_API_SRV` y `PLANNING_DATA_API_SRV` en paralelo y, en una sola pasada, devuelve `{ descs, types, roles, entitySets, entityProps }`: descripciones (`sap:label`), tipos formateados a estilo HANA (`formatEdmType`: `Edm.String`+`MaxLength` → `NVARCHAR(36)`, `Edm.Decimal` P/S → `DECIMAL(18,6)`…), rol de agregación (`dimension`/`measure`), la lista de entity sets y las propiedades reales por entidad de planning. Si hay conexión pero todas las llamadas fallan, propaga el motivo real (p. ej. `HTTP 404`) en vez de un genérico "Sin conexión a IBP".
- **Columnas "Tipo de dato (IBP)" y "Ejemplo (IBP)"** en la hoja de detalle: el tipo sale de `types`; el ejemplo es un valor real. Se traen varias filas (`$top=50`, y si aún faltan campos se escala a `$top=200`) y por cada campo se toma el primer valor **no vacío**. Como respaldo en master data, para campos de texto que sigan vacíos se hace una consulta dirigida `$select=CAMPO&$top=1&$filter=CAMPO ne ''`. Si con todo eso no hay dato, queda en blanco.
  - `fetchPlanningAreaList()` (llamada desde el script inline del HTML al conectar) deriva las planning areas del `$metadata` de planning (entity sets con sufijo `Trans` cuyo base existe) y llena el selector → `CFG.pa`.
  - `resolveTargetEntity(parsed, entitySets)` resuelve la entidad OData destino: en **KF** es el planning area (`CFG.pa`/`$G_PLAN_AREA`); en **MD** normaliza la tabla de staging de CI-DS (`SOPMD_STAG_…`) y la casa contra los entity sets (`AS1<MDT>`). `PLANNINGAREA` es query param obligatorio.
  - `fetchIbpSampleRow(...)` trae la fila (planning exige `$select` con propiedades existentes — descarta `KEYFIGUREDATE` y demás campos de staging inexistentes; MD trae la fila completa). Los KF con conversión de moneda (`CURRTOID`) fallan y quedan en blanco.
  - `enrichMappingsFromIbp(...)` + `backfillFromCache(...)`: cachean por nombre de campo (`fieldExample`, `fieldDesc`) para reusar valores/descripciones entre datastores y evitar consultas repetidas; una pasada final rellena lo que quedó vacío con el cache ya completo.
- Resolución de `P_TSKID`: una sola consulta a `JobTemplateParameterValueDataSet` con filtro `startswith(JobTemplateParameterName,'P_TSKID')` devuelve el nombre técnico del task CI-DS de cada step, invariable aunque el usuario haya renombrado el paso en IBP.

### Salida

El `.xlsx` se construye **a mano como OOXML** (`SheetBuilder` + `assembleXlsx`, empaquetado con JSZip), fiel a la plantilla `plantilla_documentador.xlsx`. Tiene una hoja "Parámetros" (resumen; las columnas varían según el modo) y una hoja de detalle por integración (mapeos con Tipo de dato + Ejemplo de IBP, filtros, variables, lookups). Se descarga como `SAP_CIDS_Documentacion_<fecha>.xlsx` (`downloadExcel`).

### Backend

Todas las llamadas a IBP pasan por [api/ibp-proxy.js](../api/ibp-proxy.js) (`apiJson`/`apiXml`/`apiJsonNext` → `kind: 'json' | 'xml' | 'next'`). El proxy hace Basic Auth saliente con el communication user, valida el host (HTTPS + sufijo `.ondemand.com` + rechazo de IPs privadas + chequeo SSRF por DNS) y solo permite los servicios `MASTER_DATA_API_SRV`, `PLANNING_DATA_API_SRV` y `BC_EXT_APPJOB_MANAGEMENT`. En error de la rama `json` reenvía el mensaje real de SAP en `detail` (`extractSapError`) para diagnóstico en el log.

### Funciones principales

`generate`, `buildExcel`, `downloadExcel`, `switchDocsMode`, `fetchAndDisplayJobs`, `generateFromJobs`, `generateZipJobs`, `parseBatchCsv`, `parseIntegration`, `parseATL`, `matchATLtoIntegrations`, `fetchIbpMeta`, `fetchPlanningAreaList`, `resolveTargetEntity`, `fetchIbpSampleRow`, `formatEdmType`, `formatIbpExample`, `enrichMappingsFromIbp`, `backfillFromCache`, `assembleXlsx`, `buildParamSheet`, `buildIntegrationSheet`, `SheetBuilder`.

## 5. Integration Explorer (`explorer.js`)

Explora visualmente las integraciones CI-DS a partir de ZIPs. El núcleo es **100% frontend** (no requiere IBP). Reutiliza `parseBatchCsv`/`parseIntegration` de `docs.js`. Todo vive dentro del IIFE `const Explorer = (function(){ ... })()`; el estado interno usa el prefijo `ex` (`exFiles`, etc.).

### Vistas

- **Master-detail:** lista de integraciones + panel de detalle (mapeos, filtros, lookups, variables y cadenas detectadas).
- **Dimensiones de exploración** (pivotes sobre índices): integración, tabla destino, tabla origen, campo destino, campo origen, tabla filtro/join y campo filtro/join.
- **Grafo** (vis-network, layout jerárquico): nodos coloreados por `tipoIntegracion` (MD amarillo `#F7A800`, KF azul `#29ABE2`, FILE naranja `#E8622A`).

### Detección de cadenas (`detectChains`)

Tres mecanismos; cada par A→B se registra una sola vez (el más específico primero):

| Mecanismo | Condición | Color |
|---|---|---|
| **Tabla (DB)** | `dstDS`+`targetTable` de A coincide con `srcDS`+`srcTable` de B (L1 exacto; L2 solo-tabla si ninguno es FILE). | Verde `#34d399`, sólida |
| **Archivo** | A es tipo FILE y su nombre de formato/archivo coincide con la tabla/archivo origen de B (deben coincidir tabla **y** nombre de archivo, para evitar falsos positivos). | Naranja `#E8622A`, punteada |
| **Lookup** | B tiene una expresión `lookup(DS."archivo", ...)` que apunta al destino de A (`extractLookupPairs`). | Morado `#a78bfa`, dash-dot |

### Conexión CI-DS opcional ("tasks promovidas")

Desde un modal, el Explorer puede conectarse a un repositorio CI-DS:
- `submitCidsConnect` → `POST /api/cids` con `action: 'login'` → `sessionId`.
- Luego `cidsSoapCall(operation, params)` → `action: 'soap'` para `getProjects` / `getProjectTasks` / `logout`.

Con la conexión activa construye `cidsProdTasks` (conjunto de nombres de task presentes en el repositorio). Las integraciones cuyo `jobName` está en ese conjunto se marcan como "promovidas" (badge ✓) y se pueden filtrar.

### Funciones principales

Métodos expuestos en `Explorer.*`: `analyze`, `renderDetail`, `applySearch`, `switchView`, `switchDimension`, `openCidsModal`/`closeCidsModal`/`submitCidsConnect`/`cidsDisconnect`, `togglePromoted`, `renderDataflowDiagram`, `openDataflowFullscreen`/`closeDataflowFullscreen`, `toggleUploadPanel`, `init`. Internas relevantes: `detectChains`, `normTableKey`, `extractLookupPairs`, `fetchProductionTasks`.

### Backend

La conexión CI-DS pasa por [api/cids.js](../api/cids.js) (`action: 'login' | 'soap'`). Operaciones permitidas: `getProjects`, `getProjectTasks`, `logout`, `ping`. Reutiliza los helpers SOAP de [api/soap.js](../api/soap.js) (`logon`, `buildBody`, `buildEnvelope`, `soapCall`, `parseResponse`, `parseFault`) y valida el `hciUrl` contra IPs privadas/reservadas (SSRF).

## 6. i18n

[js/i18n.js](../public/legacy/js/i18n.js) detecta el idioma (clave `goscm.lang` en `localStorage`, fallback al del navegador, default ES), carga `i18n/es.json` + `i18n/en.json` y aplica las traducciones a los atributos del DOM: `data-i18n` (textContent), `data-i18n-html`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-alt`. API: `I18n.t(key, vars?)`, `I18n.has`, `I18n.getLang`, `I18n.setLang`, `I18n.apply`, `I18n.ready`. El `fetch` de los JSON usa ruta relativa (`i18n/es.json`), que dentro del iframe resuelve a `/legacy/i18n/...`.

## 7. Mantenimiento y gotchas

- **Caja negra estable:** `docs.js` y `explorer.js` son grandes (más de 90 KB) y están muy acoplados al HTML por IDs de elementos. Cambiarlos requiere cuidado; conviene probarlos manualmente (subir ZIPs, generar Excel, explorar). No tienen tests.
- **Editar un `api/*.js` requiere reiniciar `npm run dev`** (el middleware de dev cachea los handlers importados).
- **CDN con SRI:** mantener `integrity` y la versión fija al actualizar vis-network o jszip.
- **Auth:** si `VITE_API_TOKEN`/`API_TOKEN` no están configurados (o no coinciden), las llamadas a `/api/*` del iframe responden 401/500.
- Deuda técnica relacionada (estilos inline, tamaño de archivos, ausencia de tests) en [DEUDA-TECNICA.md](DEUDA-TECNICA.md).
