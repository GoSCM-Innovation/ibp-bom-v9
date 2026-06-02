import { applyCors } from './_cors.js'
import { requireAuth } from './_auth.js'
import { validatePublicHttpsUrl } from './_ssrf.js'

// ─────────────────────────────────────────────────────────────────────────────
// SAP IBP OData proxy — used by the legacy "Mapping Dataflow Generator" module
// (public/legacy/js/{api,docs}.js). Forwards OData requests to SAP IBP, handling
// auth (Basic) and CORS. Ported from ibp-bom-v7 server.js; the three former
// endpoints (/api/proxy, /api/proxy-xml, /api/proxy-next) are consolidated here
// behind a `kind` discriminator to stay within the serverless function budget.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_SERVICES = ['MASTER_DATA_API_SRV', 'PLANNING_DATA_API_SRV', 'BC_EXT_APPJOB_MANAGEMENT']
const ODATA_PREFIX_IBP = '/sap/opu/odata/IBP/'
const ODATA_PREFIX_SAP = '/sap/opu/odata/sap/' // lowercase — BC_EXT_APPJOB_MANAGEMENT
const PREFIX_MAP = { IBP: ODATA_PREFIX_IBP, SAP: ODATA_PREFIX_SAP }

// Validates the base URL: must be HTTPS and end with the allowed host suffix.
// Blocks loopback and private IP ranges (RFC 1918 / RFC 5735) to prevent SSRF.
function validateProxyUrl(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { return 'URL inválida' }
  if (parsed.protocol !== 'https:') return 'Solo se permite HTTPS'
  const host = parsed.hostname
  if (/^(localhost|127\.|10\.|169\.254\.|::1$)/.test(host)) return 'Host no permitido'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'Host no permitido'
  if (/^192\.168\./.test(host)) return 'Host no permitido'
  const suffix = process.env.ALLOWED_HOST_SUFFIX || '.ondemand.com'
  if (!host.endsWith(suffix)) return 'Host no permitido'
  return null
}

function validateService(service) {
  if (!service) return 'Servicio no permitido'
  const baseName = service.split(';')[0]
  if (!ALLOWED_SERVICES.includes(baseName)) return 'Servicio no permitido'
  return null
}

function validateEntityPath(entityPath) {
  if (!entityPath) return 'Path requerido'
  if (!/^\$?[a-zA-Z][a-zA-Z0-9_]*$/.test(entityPath)) return 'Path de entidad inválido'
  return null
}

async function sapFetch(url, accept, user, password, timeoutMs) {
  const auth = Buffer.from(`${user}:${password}`).toString('base64')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: accept },
      signal: controller.signal,
      // Anti-SSRF: an allowlisted host could 302 to an internal address.
      // SAP pagination uses explicit next-links (a separate request), not 3xx.
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { kind, base, service, path: entityPath, query, prefix, url, user, password } = req.body || {}

  if (!user || !password) return res.status(400).json({ error: 'Faltan parámetros requeridos' })

  try {
    // ── JSON entity request ──────────────────────────────────────────────
    if (kind === 'json') {
      if (!base || !service || !entityPath) return res.status(400).json({ error: 'Faltan parámetros requeridos' })
      const baseError = validateProxyUrl(base + '/')
      const svcError = validateService(service)
      const pathError = validateEntityPath(entityPath)
      if (baseError) return res.status(400).json({ error: baseError })
      if (svcError) return res.status(400).json({ error: svcError })
      if (pathError) return res.status(400).json({ error: pathError })
      const ssrfError = await validatePublicHttpsUrl(base)
      if (ssrfError) return res.status(400).json({ error: ssrfError })

      const odataPrefix = PREFIX_MAP[prefix] || ODATA_PREFIX_IBP
      const target = `${base}${odataPrefix}${service}/${entityPath}${query ? '?' + query : ''}`
      const resp = await sapFetch(target, 'application/json', user, password, 120000)
      if (!resp.ok) {
        const text = await resp.text()
        console.error('[ibp-proxy:json] SAP error', resp.status, text.substring(0, 200))
        return res.status(resp.status).json({ error: `Error al conectar con SAP IBP (${resp.status})` })
      }
      return res.json(await resp.json())
    }

    // ── $metadata XML request ────────────────────────────────────────────
    if (kind === 'xml') {
      if (!base || !service) return res.status(400).json({ error: 'Faltan parámetros requeridos' })
      const baseError = validateProxyUrl(base + '/')
      const svcError = validateService(service)
      if (baseError) return res.status(400).json({ error: baseError })
      if (svcError) return res.status(400).json({ error: svcError })
      const ssrfError = await validatePublicHttpsUrl(base)
      if (ssrfError) return res.status(400).json({ error: ssrfError })

      const odataPrefix = PREFIX_MAP[prefix] || ODATA_PREFIX_IBP
      const target = `${base}${odataPrefix}${service}/$metadata`
      const resp = await sapFetch(target, 'application/xml', user, password, 60000)
      if (!resp.ok) {
        const text = await resp.text()
        console.error('[ibp-proxy:xml] SAP error', resp.status, text.substring(0, 200))
        return res.status(resp.status).json({ error: `Error al conectar con SAP IBP (${resp.status})` })
      }
      res.setHeader('Content-Type', 'text/xml')
      return res.send(await resp.text())
    }

    // ── Pagination next-link (full URL returned by SAP) ──────────────────
    if (kind === 'next') {
      if (!url) return res.status(400).json({ error: 'Faltan parámetros requeridos' })
      const urlError = validateProxyUrl(url)
      if (urlError) return res.status(400).json({ error: urlError })
      let parsed
      try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'URL inválida' }) }
      const lcPath = parsed.pathname.toLowerCase()
      if (!lcPath.startsWith('/sap/opu/odata/ibp/') && !lcPath.startsWith('/sap/opu/odata/sap/')) {
        return res.status(400).json({ error: 'Path no permitido' })
      }
      const ssrfError = await validatePublicHttpsUrl(url)
      if (ssrfError) return res.status(400).json({ error: ssrfError })
      const resp = await sapFetch(url, 'application/json', user, password, 120000)
      if (!resp.ok) {
        const text = await resp.text()
        console.error('[ibp-proxy:next] SAP error', resp.status, text.substring(0, 200))
        return res.status(resp.status).json({ error: `Error al conectar con SAP IBP (${resp.status})` })
      }
      return res.json(await resp.json())
    }

    return res.status(400).json({ error: 'kind inválido' })
  } catch (err) {
    console.error('[ibp-proxy error]', err.message)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
