# CIDS Studio (ibp-bom-v9)

Aplicación web de GoSCM para monitorear y orquestar tareas de **SAP CI-DS** (Cloud Integration for Data Services) y explorar dataflows de **SAP IBP**. Reúne en una sola consola el seguimiento de ejecuciones, dashboards de KPIs, y un orquestador visual de tareas, más dos módulos heredados (Integration Explorer y Mapping Dataflow Generator).

## Qué hace

- **Resumen / Resumen Global:** dashboards de KPIs sobre las ejecuciones de tasks (tasa de éxito, distribución por estado, tendencias, agentes).
- **Task Monitor:** lista paginada de ejecuciones con filtros, duración, y exportación a Excel.
- **Tasks:** navegación por proyectos y tasks de cada conexión, con ejecución manual.
- **Orquestaciones:** editor visual (canvas de nodos) para encadenar tasks con estrategias de error/reintento, ejecución y seguimiento.
- **Conexiones:** alta y gestión de instancias SAP CI-DS (sin almacenar contraseñas).
- **Módulos legacy:** Integration Explorer y Mapping Dataflow Generator (vanilla JS embebidos en iframe).

Para el detalle de los datos que expone la API SAP CI-DS y los KPIs derivables, ver [docs/CATALOGO-DATOS-API.md](docs/CATALOGO-DATOS-API.md).

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 (JavaScript/JSX, sin TypeScript) |
| Visualización | `@xyflow/react` (canvas de orquestación), `recharts` (gráficos) |
| Backend | Funciones serverless de Vercel (`/api`) |
| Persistencia | Upstash Redis (vía integración Vercel KV) |
| Integraciones | SAP CI-DS (SOAP), SAP IBP (OData) |
| Lint | ESLint 9 (flat config) |
| Deploy | Vercel (auto-deploy desde `master`) |

Versiones exactas en [package.json](package.json).

## Requisitos

- Node.js `>=20.19.0` (ver [.nvmrc](.nvmrc)).
- Una instancia de Upstash Redis y credenciales SAP para uso real (no requeridas para levantar el frontend).

## Arranque rápido

```bash
npm ci                 # instalar dependencias (usa package-lock.json)
cp .env.example .env   # configurar variables (ver abajo)
npm run dev            # frontend + funciones /api en http://localhost:5173
```

`npm run dev` ya sirve las funciones de `/api` mediante un middleware de desarrollo que monta los handlers de `api/*.js` (lee las variables de `.env`). Para probar contra el runtime real de Vercel en vez del middleware, se usa la Vercel CLI:

```bash
npm run dev:full       # vercel dev (runtime real de Vercel)
```

Scripts disponibles:

| Script | Acción |
|---|---|
| `npm run dev` | Servidor Vite: frontend + funciones `/api` (vía middleware de dev). |
| `npm run dev:full` | `vercel dev`: frontend + `/api` con el runtime real de Vercel. |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build de `dist/` localmente. |
| `npm run lint` | ESLint sobre todo el repo. |
| `npm test` | Suite de tests (Vitest). |
| `npm run test:watch` | Vitest en modo watch. |
| `npm run gen:secret` | Genera un token aleatorio de 32 bytes hex. |
| `npm run release:patch\|minor\|major` | Sube versión y hace push de tags. |

## Variables de entorno

Se configuran en `.env` (local) o en el proyecto de Vercel (producción). La plantilla completa y comentada está en [.env.example](.env.example).

| Variable | Requerida | Uso |
|---|---|---|
| `KV_REST_API_URL` | sí (para persistencia) | Endpoint REST de Upstash Redis. |
| `KV_REST_API_TOKEN` | sí (para persistencia) | Token REST de Upstash Redis. |
| `API_TOKEN` | sí | Token Bearer que protege todos los `/api/*`. Mínimo 16 chars. |
| `VITE_API_TOKEN` | sí | Mismo valor que `API_TOKEN`, expuesto al frontend (ver nota de seguridad). |
| `ALLOWED_ORIGINS` | sí en prod | Allowlist CORS separada por comas. |
| `CRON_SECRET` | sí si se usa cron | Token Bearer para `/api/cron-tick`. Mínimo 16 chars. |

Nota de seguridad: `VITE_API_TOKEN` queda embebido en el bundle del frontend y es público de facto. Ver [docs/SECURITY.md](docs/SECURITY.md).

## Estructura del repositorio

```
api/            Funciones serverless de Vercel (SOAP, OData, auth, CORS, SSRF, orquestación)
src/            Frontend React
  api/          Cliente SOAP compartido del frontend (soapCall)
  components/   UI por feature (Connections, Resumen, Tasks, Orchestrations, ...)
  hooks/        Hooks reutilizables
  styles/       Tokens de diseño y estilos compartidos (formularios, botones)
  constants/    Constantes de dominio (estados de SAP)
  utils/        Utilidades (fechas, metadata de tasks)
tests/          Tests con Vitest, espejando api/ y src/ (no co-locados: ver CONTRIBUTING)
public/legacy/  Módulos heredados en vanilla JS (Explorer, Mapping Dataflow)
docs/           Documentación del proyecto
```

Detalle completo en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy

El deploy es automático en Vercel al hacer push a `master`. La configuración de build y el ruteo SPA están en [vercel.json](vercel.json). La versión sube de forma automática vía GitHub Actions ([.github/workflows/version-bump.yml](.github/workflows/version-bump.yml)).

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitectura, flujos de datos, módulos clave.
- [docs/MODULOS-LEGACY.md](docs/MODULOS-LEGACY.md): las sub-apps heredadas (Mapping Dataflow Generator, Integration Explorer).
- [CONTRIBUTING.md](CONTRIBUTING.md): cómo desarrollar, convenciones de código y commits.
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): paleta, tokens, estilos de formulario y botones.
- [docs/SECURITY.md](docs/SECURITY.md): modelo de autenticación, SSRF, CORS, manejo de secretos.
- [docs/DEUDA-TECNICA.md](docs/DEUDA-TECNICA.md): problemas conocidos y roadmap de mejora.
- [docs/CATALOGO-DATOS-API.md](docs/CATALOGO-DATOS-API.md): catálogo de datos SAP CI-DS y KPIs.
- [docs/PLAN-MOBILE-ORQUESTADOR.md](docs/PLAN-MOBILE-ORQUESTADOR.md): plan UX del orquestador móvil.
