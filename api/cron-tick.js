import { tick } from './orchestrate.js'

const REDIS_URL   = process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN
const CRON_SECRET = process.env.CRON_SECRET

async function redisGetArr(key) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['GET', key]]),
  })
  const data = await resp.json()
  const result = data[0]?.result
  if (!result) return []
  try { const p = JSON.parse(result); return Array.isArray(p) ? p : [] } catch { return [] }
}

async function redisGetMany(keys) {
  if (!keys.length) return []
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(keys.map(k => ['GET', k])),
  })
  const data = await resp.json()
  return data.map(d => {
    if (!d?.result) return null
    try { return JSON.parse(d.result) } catch { return null }
  })
}

export default async function handler(req, res) {
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const orchs = await redisGetArr('cids:orchestrations')
  if (!orchs.length) return res.json({ ticked: 0 })

  const runKeys = orchs.map(o => `cids:orch_run:${o.id}`)
  const runs    = await redisGetMany(runKeys)

  const running = orchs
    .map((o, i) => ({ id: o.id, run: runs[i] }))
    .filter(({ run }) => run?.status === 'running')

  if (!running.length) return res.json({ ticked: 0 })

  const results = await Promise.allSettled(running.map(({ id }) => tick(id)))

  const ticked = results.filter(r => r.status === 'fulfilled').length
  const errors = results
    .map((r, i) => r.status === 'rejected' ? { id: running[i].id, error: r.reason?.message } : null)
    .filter(Boolean)

  return res.json({ ticked, errors: errors.length ? errors : undefined })
}
