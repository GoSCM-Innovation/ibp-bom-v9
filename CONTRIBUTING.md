# Guía de contribución

Cómo desarrollar y aportar a CIDS Studio (ibp-bom-v9). Para entender la arquitectura antes de tocar código, leer [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup

```bash
nvm use                # Node >=20.19.0 (ver .nvmrc)
npm ci                 # instalar dependencias desde el lockfile
cp .env.example .env   # configurar variables (ver README)
```

- `npm run dev` levanta frontend + funciones `/api` en un solo puerto: un middleware de desarrollo en [vite.config.js](vite.config.js) monta los handlers de `api/*.js` y lee las variables de `.env`. Editar un archivo de `api/*.js` requiere reiniciar el dev.
- `npm run dev:full` (`vercel dev`) levanta lo mismo pero con el runtime real de Vercel; requiere la Vercel CLI y el proyecto vinculado.

## Scripts

| Script | Uso |
|---|---|
| `npm run dev` | Frontend + funciones `/api` (Vite + middleware de dev). |
| `npm run dev:full` | Frontend + `/api` con el runtime real de Vercel (`vercel dev`). |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build localmente. |
| `npm run lint` | ESLint sobre el repo. |
| `npm test` | Corre la suite de tests una vez (Vitest). |
| `npm run test:watch` | Vitest en modo watch. |
| `npm run gen:secret` | Genera un token aleatorio (para `API_TOKEN`, `CRON_SECRET`). |

## Convenciones de código

El proyecto es JavaScript + JSX (sin TypeScript), React 19, con estado por hooks. Reglas para mantener el orden:

- **Consultas SAP:** usar siempre `soapCall` de [src/api/soapCall.js](src/api/soapCall.js). No redefinir la función en cada componente (era la duplicación que se consolidó). Si una operación SOAP es nueva, agregar su parser en [api/soap.js](api/soap.js).
- **Endpoints nuevos:** aplicar `applyCors` y `requireAuth`; si la función hace requests salientes a URLs del usuario, validar con `validatePublicHttpsUrl` ([api/_ssrf.js](api/_ssrf.js)).
- **Componentes:** organizar por feature dentro de `src/components/<Feature>/`. Recibir `connection` y `sessionId` por props.
- **Estado compartido** entre clientes o requerido por el cron: Redis con prefijo `cids:`. Estado local de UI: hooks. Preferencias del usuario: `localStorage`.
- **Logs de debug:** gatear con el flag de debug (`import.meta.env.DEV || localStorage.ibpSoapDebug === '1'`); reutilizar `isSoapDebug()` de [src/api/soapCall.js](src/api/soapCall.js). No dejar `console.log` sin gatear en código que corre en producción.
- **Estilo:** seguir las reglas de [CLAUDE.md](CLAUDE.md) (sin emojis ni em-dashes; conciso). El proyecto usa estilos inline con variables CSS (`var(--bg)`, etc.) definidas en `src/index.css`.
- **Idioma:** los textos de UI están en español; mantener consistencia.

Antes de abrir un PR, correr `npm run lint`, `npm test` y `npm run build`. Los tres deben pasar; el CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) corre lint y test en cada PR.

`npm run lint` sale en exit 0 pero deja warnings: son el baseline de deuda conocida (ver [docs/DEUDA-TECNICA.md](docs/DEUDA-TECNICA.md), item 2). No agregar nuevos.

## Tests

Vitest, con React Testing Library para los hooks. Los tests viven en [tests/](tests), espejando la estructura del repo (`tests/api/`, `tests/src/`).

**No se co-locan junto al código fuente**: Vercel trata todo archivo dentro de `api/` como función serverless, así que un `api/soap.test.js` se desplegaría como función y consumiría presupuesto. Por consistencia, los de `src/` siguen la misma convención.

Convenciones:

- **Entorno**: el default es `node`. Los archivos que necesitan DOM (`localStorage`, `window`, `renderHook`) lo declaran por archivo con el docblock `// @vitest-environment jsdom` en la primera línea. Se hace así, y no con configuración global, porque la API para mapear entornos por glob cambió entre versiones de Vitest.
- **Imports explícitos**: `import { describe, it, expect, vi } from 'vitest'`. No hay globals del runner configurados. Los archivos con RTL llaman a `afterEach(cleanup)` explícitamente; no hay `setupFiles`.
- **Configuración**: [vitest.config.js](vitest.config.js), separada a propósito de `vite.config.js`. Aquella vuelca todo el `.env` a `process.env` en el top level, lo que filtraría `API_TOKEN` y credenciales reales al proceso de test.
- **Lógica interna**: si hace falta testear un helper no exportado de `api/*.js`, agregarle un named export con un comentario que lo justifique (patrón ya usado en [api/soap.js](api/soap.js) y [api/orchestrate.js](api/orchestrate.js)). Exportar no crea funciones nuevas en Vercel: el entry sigue siendo el `export default`.
- **Variables de entorno leídas en el top level** (`api/_auth.js`, `api/_cors.js`, `src/apiFetch.js`): requieren `vi.stubEnv(...)` + `vi.resetModules()` + `await import(...)` dinámico en cada caso.

## Convención de commits

Se usan Conventional Commits, con scope opcional:

```
feat(task-monitor): paginar tabla y añadir Fin + Duración
fix(orchestrate): liberar el lock al cancelar un run
docs: actualizar ARCHITECTURE con el flujo de cron
chore: ...
```

Tipos habituales: `feat`, `fix`, `docs`, `chore`, `refactor`. El bump de versión es automático (ver abajo); no editar `package.json` manualmente para subir versión.

## Versionado y release

- Al hacer push a `master`, un GitHub Action sube la versión patch y commitea con `[skip ci]` ([.github/workflows/version-bump.yml](.github/workflows/version-bump.yml)).
- Para subir minor/major manualmente: `npm run release:minor` / `npm run release:major`.

## Flujo de PR

1. Crear una rama desde `master`.
2. Hacer cambios enfocados; correr `lint` y `build`.
3. Abrir el PR contra `master` con descripción del cambio y cómo probarlo.
4. El deploy de producción ocurre al mergear a `master`.

## Deuda técnica

Los problemas conocidos que no se abordan en un cambio puntual se registran en [docs/DEUDA-TECNICA.md](docs/DEUDA-TECNICA.md) y como issues en GitHub etiquetados por severidad. Si encontrás uno nuevo, agregarlo allí.
