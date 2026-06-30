import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Carga TODAS las variables de entorno (no solo las VITE_) en process.env para que
// los handlers serverless de api/*.js — que leen process.env.X en el top-level
// (p. ej. API_TOKEN en api/_auth.js) — funcionen al montarlos en el dev server.
// No pisa las que ya estén definidas en el entorno real.
const fileEnv = loadEnv('development', process.cwd(), '')
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined) process.env[k] = v
}

// Lee el cuerpo de una request entrante y lo devuelve como string.
function readBody(req) {
  return new Promise((res, rej) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => res(data))
    req.on('error', rej)
  })
}

// Añade al res de Connect los helpers que esperan los handlers estilo Vercel
// (res.status().json(), res.send()). res.setHeader/res.end ya existen en Node.
function decorateRes(res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (data) => {
    if (data === undefined || data === null) { res.end(); return res }
    if (typeof data === 'string' || Buffer.isBuffer(data)) { res.end(data); return res }
    return res.json(data)
  }
  return res
}

// Plugin SOLO de desarrollo: monta los handlers serverless de api/*.js en el dev
// server de Vite para que `npm run dev` sirva frontend + /api en un único puerto
// (como el server.js de v7). En producción se usan las funciones de Vercel; este
// plugin no participa del build (apply: 'serve') y deja intactas las funciones.
function devApiPlugin() {
  const apiDir = resolve(process.cwd(), 'api')
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // Registrado directamente (no como hook post) para interceptar /api/* antes
      // del fallback SPA de Vite.
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/api/')) return next()

        const url = new URL(rawUrl, 'http://localhost')
        const segments = url.pathname.slice('/api/'.length).split('/').filter(Boolean)
        const name = segments[0] || ''

        // Equivalente a la reescritura de vercel.json: /api/connections/:id -> connections
        const routeId = name === 'connections' && segments[1] ? segments[1] : null

        if (!/^[a-zA-Z0-9_-]+$/.test(name)) return next()
        const file = resolve(apiDir, `${name}.js`)
        if (!existsSync(file)) return next()

        try {
          const bodyText = await readBody(req)
          if (bodyText) {
            try {
              req.body = JSON.parse(bodyText)
            } catch {
              decorateRes(res).status(400).json({ error: 'JSON inválido en el cuerpo' })
              return
            }
          } else {
            req.body = {}
          }
          req.query = Object.fromEntries(url.searchParams)
          if (routeId) req.query.id = routeId

          decorateRes(res)
          const mod = await import(pathToFileURL(file).href)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[dev-api] ${name}: ${err.stack || err.message}`)
          if (!res.headersSent) {
            decorateRes(res).status(500).json({ error: 'Error interno del servidor (dev-api)' })
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
