import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config separada de vite.config.js a propósito: aquel vuelca todo el .env a
// process.env en el top level (loadEnv), lo que filtraría API_TOKEN, CRON_SECRET
// y credenciales de Redis reales al proceso de test y haría que los tests de
// _auth/_cors dependieran de la máquina local. Vitest da precedencia a este
// archivo y no mergea vite.config.js.
export default defineConfig({
  plugins: [react()],
  test: {
    // El default es node; los archivos que necesitan DOM lo declaran por archivo
    // con el docblock `// @vitest-environment jsdom` en la primera línea.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
})
