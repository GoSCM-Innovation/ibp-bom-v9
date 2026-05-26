import { logon } from './soap.js'
import { applyCors } from './_cors.js'
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { hciUrl, orgName, isProduction, user, password } = req.body || {}
  if (!hciUrl || !orgName || !user || !password) {
    return res.status(400).json({ error: 'hciUrl, orgName, user y password son requeridos' })
  }
  if (typeof isProduction !== 'boolean') {
    return res.status(400).json({ error: 'isProduction debe ser boolean (no se asume default)' })
  }

  try {
    const sessionId = await logon(hciUrl, orgName, user, password, isProduction)
    return res.json({ sessionId })
  } catch (e) {
    return res.status(401).json({ error: e.message })
  }
}
