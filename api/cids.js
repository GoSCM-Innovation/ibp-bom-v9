import { applyCors } from './_cors.js'
import { requireAuth } from './_auth.js'
import { validatePublicHttpsUrl } from './_ssrf.js'
import { logon, buildBody, buildEnvelope, soapCall, parseResponse, parseFault } from './soap.js'

// ─────────────────────────────────────────────────────────────────────────────
// CI-DS connection for the legacy "Integration Explorer" module
// (public/legacy/js/explorer.js). Lets the Explorer mark which integrations are
// promoted to a CI-DS repository. Reuses the SOAP helpers already shipped in
// api/soap.js. Two actions behind one endpoint: login | soap.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_OPS = new Set(['getProjects', 'getProjectTasks', 'logout', 'ping'])

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, hciUrl } = req.body || {}
  if (!hciUrl) return res.status(400).json({ error: 'hciUrl requerido' })
  // Anti-SSRF: CI-DS hosts are tenant-specific (Kyma/Neo) so no host allowlist is
  // possible, but we reject any URL whose host resolves to a private/reserved IP.
  const urlError = await validatePublicHttpsUrl(hciUrl)
  if (urlError) return res.status(400).json({ error: urlError })

  // ── Login ────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const { orgName, user, password, isProduction } = req.body
    if (!orgName || !user || !password) {
      return res.status(400).json({ error: 'orgName, user y password son requeridos' })
    }
    try {
      const sessionId = await logon(hciUrl, orgName, user, password, !!isProduction)
      return res.json({ sessionId })
    } catch (e) {
      console.error('[cids:login]', e.message)
      return res.status(401).json({ error: e.message })
    }
  }

  // ── SOAP operation ─────────────────────────────────────────────────────────
  if (action === 'soap') {
    const { sessionId, operation, params = {} } = req.body
    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' })
    if (!operation) return res.status(400).json({ error: 'operation requerida' })
    if (!ALLOWED_OPS.has(operation)) return res.status(400).json({ error: 'Operación no permitida' })

    const soapActionMap = {
      getProjects:     'function=getAllProjects',
      getProjectTasks: 'function=getAllProjectTasks',
      logout:          'function=logoff',
    }
    try {
      const body = buildBody(operation, { ...params, sessionId })
      const envelope = buildEnvelope(body, sessionId)
      const { ok, status, text } = await soapCall(hciUrl, soapActionMap[operation] || `function=${operation}`, envelope)
      if (!ok) {
        const fault = parseFault(text)
        const isSessionError = /session/i.test(fault?.faultCode || '') || /session/i.test(fault?.faultString || '')
        if (isSessionError) return res.status(401).json({ error: 'SESSION_EXPIRED' })
        return res.status(status).json({ error: fault?.faultString || `SOAP error HTTP ${status}` })
      }
      return res.json(parseResponse(operation, text))
    } catch (e) {
      console.error('[cids:soap]', e.message)
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'action inválida' })
}
