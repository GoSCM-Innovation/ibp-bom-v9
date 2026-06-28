# Guía de contribución

Cómo desarrollar y aportar a CIDS Studio (ibp-bom-v9). Para entender la arquitectura antes de tocar código, leer [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup

```bash
nvm use                # Node >=20.19.0 (ver .nvmrc)
npm ci                 # instalar dependencias desde el lockfile
cp .env.example .env   # configurar variables (ver README)
```

- `npm run dev` levanta solo el frontend (las llamadas a `/api/*` no responden).
- `npm run dev:full` (`vercel dev`) levanta frontend + funciones serverless; requiere tener la Vercel CLI y las variables de entorno configuradas.

## Scripts

| Script | Uso |
|---|---|
| `npm run dev` | Desarrollo frontend (Vite). |
| `npm run dev:full` | Frontend + funciones `/api` (`vercel dev`). |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build localmente. |
| `npm run lint` | ESLint sobre el repo. |
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

Antes de abrir un PR, correr `npm run lint` y `npm run build`. Nota: el repo arrastra advertencias y errores de lint preexistentes (ver [docs/DEUDA-TECNICA.md](docs/DEUDA-TECNICA.md)); no introducir nuevos en los archivos que toques.

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
