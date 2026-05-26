import crypto from 'crypto'
import { applyCors } from './_cors.js'
import { requireAuth } from './_auth.js'

const REDIS_URL   = process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN
const KEY = 'cids:connections'

async function redisGet(key) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['GET', key]])
  })
  const data = await resp.json()
  const result = data[0]?.result
  if (!result) return []
  try {
    const parsed = JSON.parse(result)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[connections] redis JSON parse failed for', key, e.message, 'raw:', String(result).slice(0, 200))
    return []
  }
}

async function redisSet(key, value) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, JSON.stringify(value)]])
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error(`Redis SET failed (${resp.status}): ${JSON.stringify(data)}`)
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (!requireAuth(req, res)) return

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis no configurado: faltan KV_REST_API_URL o KV_REST_API_TOKEN' })
  }

  try {
    const connections = await redisGet(KEY)

    if (req.method === 'GET') {
      return res.json(connections)
    }

    if (req.method === 'POST') {
      const { name, serviceUrl, orgName, user, isProduction, logoUrl } = req.body
      if (!name)       return res.status(400).json({ error: 'El nombre es obligatorio' })
      if (!serviceUrl) return res.status(400).json({ error: 'La URL del servicio es obligatoria' })
      if (!orgName)    return res.status(400).json({ error: 'El nombre de organización es obligatorio' })
      if (!user)       return res.status(400).json({ error: 'El usuario es obligatorio' })

      const newConn = {
        id:           crypto.randomUUID(),
        name,
        serviceUrl:   serviceUrl.replace(/\/$/, ''),
        orgName,
        user,
        isProduction: !!isProduction,
        logoUrl:      logoUrl || '',
      }
      connections.push(newConn)
      await redisSet(KEY, connections)
      return res.status(201).json(newConn)
    }

    const id = req.body?.id
    if (!id) return res.status(400).json({ error: 'Falta id' })

    if (req.method === 'PUT') {
      const idx = connections.findIndex(c => c.id === id)
      if (idx === -1) return res.status(404).json({ error: 'No encontrado' })
      const existing = connections[idx]
      const { name, serviceUrl, orgName, user, isProduction, logoUrl } = req.body

      connections[idx] = {
        ...existing,
        ...(name        !== undefined && { name }),
        ...(serviceUrl  !== undefined && { serviceUrl: serviceUrl.replace(/\/$/, '') }),
        ...(orgName     !== undefined && { orgName }),
        ...(user        !== undefined && { user }),
        ...(isProduction !== undefined && { isProduction: !!isProduction }),
        ...(logoUrl     !== undefined && { logoUrl }),
      }
      // Drop any legacy password field on update so it doesn't linger in Redis
      delete connections[idx].password
      await redisSet(KEY, connections)
      return res.json(connections[idx])
    }

    if (req.method === 'DELETE') {
      const idx = connections.findIndex(c => c.id === id)
      if (idx === -1) return res.status(404).json({ error: 'No encontrado' })
      connections.splice(idx, 1)
      await redisSet(KEY, connections)
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e.message })
  }
}
