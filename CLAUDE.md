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

CIDS Studio: SPA de React (Vite) para monitorear y orquestar tareas de SAP CI-DS (SOAP) y explorar dataflows de SAP IBP (OData). Backend de funciones serverless en Vercel; estado compartido en Upstash Redis. JavaScript/JSX, sin TypeScript. Documentación completa en `docs/ARCHITECTURE.md`, `README.md`, `CONTRIBUTING.md`, `docs/SECURITY.md`, `docs/DEUDA-TECNICA.md`, `docs/CATALOGO-DATOS-API.md`, `docs/DESIGN-SYSTEM.md`.

## Mapa del repo

- `api/`: funciones serverless (helpers con prefijo `_`: `_auth`, `_cors`, `_ssrf`). Núcleo SOAP en `api/soap.js`; motor de orquestación en `api/orchestrate.js`.
- `src/`: frontend React. `src/api/soapCall.js` es el cliente SOAP compartido. Componentes por feature en `src/components/`. Estilos compartidos en `src/styles/` (tokens, formularios, botones) y constantes de dominio en `src/constants/` (estados de SAP, tipo de task, colores de avatar). La feature de orquestaciones tiene su propio cliente de API (`src/components/Orchestrations/api.js`) y sus hooks separados por responsabilidad en `hooks/`.
- `public/legacy/`: módulos heredados en vanilla JS (Explorer, Mapping Dataflow) embebidos en iframe. No se modifica su código, pero sí se lintea: tiene un bloque propio en `eslint.config.js` con `sourceType: 'script'` y los globals compartidos declarados (son scripts globales cargados con `<script src>` en orden fijo, no módulos ES). Al agregar un global nuevo a esos scripts hay que declararlo también ahí. Doc detallada: `docs/MODULOS-LEGACY.md`.
- `tests/`: tests con Vitest, espejando `api/` y `src/`. No se co-locan porque Vercel trata todo archivo dentro de `api/` como función serverless.
- `docs/`: documentación.

## Convenciones clave

- Consultas SAP desde el frontend: usar `soapCall` de `src/api/soapCall.js`; no redefinirlo por componente. Parsers de operaciones nuevas en `api/soap.js`.
- Endpoints nuevos: aplicar `applyCors` + `requireAuth`; si hacen requests salientes con URL del usuario, validar con `validatePublicHttpsUrl` (`api/_ssrf.js`).
- Estado compartido entre clientes o necesario para el cron: Redis con prefijo `cids:`. UI local: hooks. Preferencias: `localStorage`. Sesión SAP: `sessionStorage` (`sap_${connId}`).
- Estilos: los objetos `style={{...}}` inline son la convención, pero los valores salen de `src/styles/`. Colores de la paleta: `color.*` (var CSS), `alpha.*(a)` (translúcido) o `hex.*` (si el valor va a un atributo SVG). Si el color llega por parámetro y hay que darle transparencia, `tint()`: `withAlpha()` solo acepta hex y lanza ante un `var()`. Espaciado, tipografía y radio salen de las escalas `space`/`fontSize`/`radius`. Nunca escribir un `rgba()`/hex de la paleta a mano, ni concatenar el alfa al hex (`color + '22'`), ni usar un valor fuera de escala: hay tests que lo bloquean. Formularios, botones, estados de SAP, tipo de task y colores de avatar tienen módulo propio. Ver `docs/DESIGN-SYSTEM.md`.
- Logs de debug: gatear con `isSoapDebug()` (`import.meta.env.DEV || localStorage.ibpSoapDebug === '1'`). No dejar `console.log` sin gatear.
- Commits: Conventional Commits. La versión sube sola por GitHub Actions; no editar `version` en `package.json` a mano.

## Gotchas

- `VITE_API_TOKEN` queda embebido en el bundle (público de facto). Ver `docs/SECURITY.md`.
- `npm test` y `npm run lint` deben quedar en verde (exit 0). El lint deja warnings a propósito: son el baseline de deuda de hooks, con scope por archivo en `eslint.config.js`. No agregar nuevos. Ver `docs/DEUDA-TECNICA.md`.
- Tests: entorno `node` por defecto; los que necesitan DOM declaran `// @vitest-environment jsdom` en la primera línea. Se importan `describe`/`it`/`expect`/`vi` desde `'vitest'` (no hay globals). Convenciones en `CONTRIBUTING.md`.
- `npm run dev` sirve `/api` vía un middleware de dev en `vite.config.js` (monta los handlers de `api/*.js`, lee `.env`); editar un `api/*.js` requiere reiniciar el dev. `npm run dev:full` (`vercel dev`) usa el runtime real de Vercel.

## Comandos

- Dev: `npm run dev` (frontend + `/api` vía middleware de dev) o `npm run dev:full` (`vercel dev`, runtime real).
- Verificar: `npm run lint`, `npm test` y `npm run build`.