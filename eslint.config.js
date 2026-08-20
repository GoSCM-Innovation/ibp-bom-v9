import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Archivos de configuración (vite.config.js, etc.): corren en Node.
    files: ['**/*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Funciones serverless: runtime Node (process, Buffer, crypto, fetch...).
    files: ['api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // __APP_VERSION__ lo inyecta el `define` de Vite (ver vite.config.js).
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: { __APP_VERSION__: 'readonly' } },
  },
  {
    // Los tests importan describe/it/expect/vi desde 'vitest' explícitamente, así
    // que no hacen falta globals del runner; sí los de Node y los del DOM, según
    // el entorno que declare cada archivo.
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Módulos heredados (Explorer y Mapping Dataflow): scripts globales clásicos
    // cargados con <script src> en orden fijo desde los dos HTML, no módulos ES.
    // El orden y los helpers compartidos están documentados en
    // docs/MODULOS-LEGACY.md; esta lista debe mantenerse en sincronía con eso.
    // Su código no se modifica, pero sí se lintea: `no-undef` es justamente la
    // regla que aporta valor en 280 KB de JS vanilla con estado global.
    files: ['public/legacy/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        I18n: 'readonly',          // i18n.js
        CFG: 'writable',           // state.js
        IDB: 'writable',           // state.js
        escH: 'readonly',          // utils.js
        log: 'readonly',           // utils.js
        fetchAllPages: 'readonly', // api.js
        apiJson: 'readonly',       // api.js
        apiXml: 'readonly',        // api.js
        buildSelect: 'readonly',   // docs.js
        normalizeRows: 'readonly', // docs.js
        parseBatchCsv: 'readonly', // docs.js
        parseIntegration: 'readonly', // docs.js
        parseATL: 'readonly',      // docs.js
        JSZip: 'readonly',         // CDN, ambas páginas
        vis: 'readonly',           // CDN (vis-network), integration-explorer.html
      },
    },
    rules: {
      // Son scripts de scope global: ESLint no ve los usos desde los onclick del
      // HTML ni desde otro archivo cargado después. Serían falsos positivos.
      'no-unused-vars': 'off',
      // Los globals de arriba se declaran para los archivos que los consumen; en
      // el archivo que los define chocan con su propia declaración.
      'no-redeclare': 'off',
      // Ruido cosmético real, pero este código no se edita: queda como aviso.
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  {
    // TODO(#2): baseline de deuda de hooks. Se degrada a warning solo en los
    // archivos que ya la arrastran, para que la regla siga siendo error en el
    // resto del repo y no entre código nuevo con el mismo problema.
    // setState síncrono dentro de un efecto, casi siempre para marcar "cargando"
    // antes de un fetch. En NodeConfigPanel estos avisos estaban ocultos: con los
    // hooks detrás de un early return la regla no llegaba a analizar el efecto.
    files: [
      'src/App.jsx',
      'src/components/Orchestrations/canvas/NodeConfigPanel.jsx',
      'src/components/Orchestrations/mobile/MobileTaskPicker.jsx',
      'src/components/System/SystemView.jsx',
      'src/hooks/usePromotedTasks.js',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
])
