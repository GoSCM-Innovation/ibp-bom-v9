import crypto from 'crypto'

const API_TOKEN = process.env.API_TOKEN

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export function requireAuth(req, res) {
  if (!API_TOKEN || API_TOKEN.length < 16) {
    res.status(500).json({ error: 'API_TOKEN no configurado o demasiado corto (min 16 chars)' })
    return false
  }
  const header = req.headers?.authorization || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m || !timingSafeEqualStr(m[1], API_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
