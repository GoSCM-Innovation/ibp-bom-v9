# CLAUDE.md — GoSCM · CIDS Studio

## Approach
- Yo hablo en español, pero puedes pensar en el idioma que prefieras.
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.
- Do not add any changes to the solution until you are at least 90% certain.
- You can ask as many questions as you need until you reach the desired level of certainty.

## Proyecto

CIDS Studio: SPA de React (Vite) para monitorear y orquestar tareas de SAP CI-DS (SOAP) y explorar dataflows de SAP IBP (OData). Backend de funciones serverless en Vercel; estado compartido en Upstash Redis. JavaScript/JSX, sin TypeScript. Documentación completa en `docs/ARCHITECTURE.md`, `README.md`, `CONTRIBUTING.md`, `docs/SECURITY.md`, `docs/DEUDA-TECNICA.md`, `docs/CATALOGO-DATOS-API.md`.

## Mapa del repo

- `api/`: funciones serverless (helpers con prefijo `_`: `_auth`, `_cors`, `_ssrf`). Núcleo SOAP en `api/soap.js`; motor de orquestación en `api/orchestrate.js`.
- `src/`: frontend React. `src/api/soapCall.js` es el cliente SOAP compartido. Componentes por feature en `src/components/`.
- `public/legacy/`: módulos heredados en vanilla JS (Explorer, Mapping Dataflow) embebidos en iframe; tratar como caja negra. Doc detallada: `docs/MODULOS-LEGACY.md`.
- `docs/`: documentación.

## Convenciones clave

- Consultas SAP desde el frontend: usar `soapCall` de `src/api/soapCall.js`; no redefinirlo por componente. Parsers de operaciones nuevas en `api/soap.js`.
- Endpoints nuevos: aplicar `applyCors` + `requireAuth`; si hacen requests salientes con URL del usuario, validar con `validatePublicHttpsUrl` (`api/_ssrf.js`).
- Estado compartido entre clientes o necesario para el cron: Redis con prefijo `cids:`. UI local: hooks. Preferencias: `localStorage`. Sesión SAP: `sessionStorage` (`sap_${connId}`).
- Logs de debug: gatear con `isSoapDebug()` (`import.meta.env.DEV || localStorage.ibpSoapDebug === '1'`). No dejar `console.log` sin gatear.
- Commits: Conventional Commits. La versión sube sola por GitHub Actions; no editar `version` en `package.json` a mano.

## Gotchas

- `VITE_API_TOKEN` queda embebido en el bundle (público de facto). Ver `docs/SECURITY.md`.
- No hay tests. `npm run lint` arrastra errores preexistentes; no agregar nuevos en los archivos que toques. Ver `docs/DEUDA-TECNICA.md`.
- `npm run dev` sirve `/api` vía un middleware de dev en `vite.config.js` (monta los handlers de `api/*.js`, lee `.env`); editar un `api/*.js` requiere reiniciar el dev. `npm run dev:full` (`vercel dev`) usa el runtime real de Vercel.

## Comandos

- Dev: `npm run dev` (frontend + `/api` vía middleware de dev) o `npm run dev:full` (`vercel dev`, runtime real).
- Verificar: `npm run lint` y `npm run build`.