import crypto from 'crypto'
import { buildBody, buildEnvelope, soapCall as rawSoapCall, parseResponse, parseFault } from './soap.js'

const REDIS_URL   = process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN

const SUCCESS_CODES      = new Set(['SUCCESS', 'SUCCESS_WITH_ERRORS_D', 'SUCCESS_WITH_ERRORS_E'])
const TERMINAL_ERR_CODES = new Set(['ERROR', 'TERMINATED', 'TERMINATION_FAILED', 'UNKNOWN'])
const NON_TERMINAL_CODES = new Set(['RUNNING', 'QUEUEING', 'IMPORTED', 'FETCHED'])
const SUCCESS_ALIASES    = new Set(['COMPLETED', 'FINISHED', 'DONE'])
const TERMINAL_RUN       = new Set(['success', 'error', 'cancelled'])
const DONE_NODE          = new Set(['success', 'success_with_errors', 'error', 'skipped', 'cancelled'])

const SOAP_ACTIONS = {
  runTask:               'function=runTask',
  getTaskStatusByRunId2: 'function=getTaskStatusByRunId2',
  cancelTask:            'function=cancelTask',
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function redisGetObj(key) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['GET', key]]),
  })
  const data = await resp.json()
  const result = data[0]?.result
  if (!result) return null
  try { return JSON.parse(result) } catch { return null }
}

async function redisGetRaw(key) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['GET', key]]),
  })
  const data = await resp.json()
  return data[0]?.result ?? null
}

async function redisSetObj(key, value, exSeconds = 172800) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, JSON.stringify(value), 'EX', exSeconds]]),
  })
  if (!resp.ok) throw new Error(`Redis set failed: ${resp.status}`)
}

async function redisSetNx(key, value, exSeconds) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, value, 'NX', 'EX', exSeconds]]),
  })
  if (!resp.ok) throw new Error(`Redis set NX failed: ${resp.status}`)
  const data = await resp.json()
  return data[0]?.result === 'OK'
}

async function redisDel(key) {
  const resp = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['DEL', key]]),
  })
  if (!resp.ok) throw new Error(`Redis del failed: ${resp.status}`)
}

async function withRunLock(orchestrationId, fn) {
  const lockKey = `cids:orch_run_lock:${orchestrationId}`
  const lockToken = crypto.randomUUID()
  const acquired = await redisSetNx(lockKey, lockToken, 15)
  if (!acquired) return null
  try {
    return await fn()
  } finally {
    try {
      const current = await redisGetRaw(lockKey)
      if (current === lockToken) await redisDel(lockKey)
    } catch {
      // lock expires automatically (EX), swallow cleanup errors
    }
  }
}

// ─── SOAP proxy ───────────────────────────────────────────────────────────────

async function soapRequest(connection, sessionId, operation, params) {
  const soapAction = SOAP_ACTIONS[operation] || `function=${operation}`
  const version    = operation === 'getTaskStatusByRunId2' ? '2.0' : null
  const body       = buildBody(operation, params)
  const envelope   = buildEnvelope(body, sessionId, version)
  const { ok, status, text } = await rawSoapCall(connection.hciUrl, soapAction, envelope)
  if (!ok) {
    const fault = parseFault(text)
    throw new Error(fault?.faultString || fault?.faultCode || `SOAP error HTTP ${status}`)
  }
  return parseResponse(operation, text)
}

// ─── Graph utilities ──────────────────────────────────────────────────────────

// Kahn's algorithm: returns array of waves (each wave = nodeIds that can run in parallel)
// nodeList must be pre-filtered (top-level or group children, never mixed)
function buildWaves(nodeList, edges) {
  const inDegree = {}, adjList = {}
  for (const n of nodeList) { inDegree[n.id] = 0; adjList[n.id] = [] }
  for (const e of edges) {
    if (e.source in adjList && e.target in inDegree) {
      adjList[e.source].push(e.target)
      inDegree[e.target]++
    }
  }
  const waves = []
  let ready = nodeList.filter(n => inDegree[n.id] === 0).map(n => n.id)
  while (ready.length > 0) {
    waves.push([...ready])
    const next = []
    for (const id of ready) for (const d of adjList[id]) if (--inDegree[d] === 0) next.push(d)
    ready = next
  }
  return waves
}

// Migrate legacy steps[] to nodes/edges for execution
function migrateStepsToNodes(steps) {
  const nodes = steps.map((s, i) => ({
    id: s.id, type: 'task', parentId: null,
    position: { x: 100, y: 80 + i * 180 },
    data: { ...s, label: s.taskName },
  }))
  const edges = steps.slice(0, -1).map((s, i) => ({
    id: `e-${s.id}-${steps[i + 1].id}`,
    source: s.id, target: steps[i + 1].id,
  }))
  return { nodes, edges }
}

function resolveGraph(orch) {
  if (orch.nodes && orch.nodes.length > 0) return { nodes: orch.nodes, edges: orch.edges || [] }
  return migrateStepsToNodes(orch.steps || [])
}

// ─── Orchestration lookup ─────────────────────────────────────────────────────

async function getOrchestration(orchestrationId) {
  const all = await redisGetObj('cids:orchestrations')
  const arr = Array.isArray(all) ? all : []
  return arr.find(o => o.id === orchestrationId) || null
}

// ─── Node state initializer ───────────────────────────────────────────────────

function initNodeState(node, allNodes) {
  if (node.type === 'group') {
    const children = allNodes.filter(n => n.parentId === node.id)
    return {
      nodeId: node.id, type: 'group', status: 'pending',
      startedAt: null, finishedAt: null, error: null,
      groupWaves: [], currentGroupWave: 0,
      children: Object.fromEntries(children.map(c => [c.id, {
        nodeId: c.id, status: 'pending', sapRunId: null, sapStatusCode: null,
        startedAt: null, finishedAt: null, error: null, retryCount: 0, retryAt: null,
      }])),
    }
  }
  return {
    nodeId: node.id, type: 'task', status: 'pending',
    startedAt: null, finishedAt: null, error: null,
    sapRunId: null, sapStatusCode: null, retryCount: 0, retryAt: null,
  }
}

// ─── Task execution helpers ───────────────────────────────────────────────────

function mergeVariables(taskVars = [], globalVars = []) {
  if (!globalVars || globalVars.length === 0) return taskVars
  return taskVars.map(v => {
    const override = globalVars.find(g => g.name === v.name)
    return override ? { ...v, value: override.value } : v
  })
}

async function launchTask(connection, sessionId, nodeDef, defaults = {}) {
  const taskVars   = nodeDef.data.globalVariables || []
  const globalVars = defaults.globalVariables || []
  const params = {
    taskName:        nodeDef.data.taskName,
    agentName:       nodeDef.data.agentName   || defaults.agentName  || undefined,
    profileName:     nodeDef.data.profileName || defaults.profileName || undefined,
    globalVariables: mergeVariables(taskVars, globalVars),
  }
  try {
    const result = await soapRequest(connection, sessionId, 'runTask', params)
    if (!result.runId) throw new Error('SAP no retornó runId')
    return result.runId
  } catch (e) {
    // Session errors won't resolve with the same sessionId — don't retry.
    if (/session/i.test(e.message)) throw e
    // SAP can reject the first runTask call transiently (cold-start / service init).
    // A single retry after a brief wait is safe: a non-200 SOAP response guarantees
    // SAP did not start the task, so there is no risk of double execution.
    await new Promise(r => setTimeout(r, 1500))
    const result = await soapRequest(connection, sessionId, 'runTask', params)
    if (!result.runId) throw new Error('SAP no retornó runId')
    return result.runId
  }
}

async function pollSapStatus(connection, sessionId, sapRunId) {
  const r = await soapRequest(connection, sessionId, 'getTaskStatusByRunId2', { runId: sapRunId })
  return {
    code: (r.statusCode || '').toUpperCase(),
    endTime: r.endTime || null,
    statusMsg: r.statusMsg || null,
  }
}

// ─── Group wave helper ────────────────────────────────────────────────────────

async function launchGroupWave(run, ns, waveIds, allNodes, defaults) {
  if (!waveIds || waveIds.length === 0) return
  await Promise.allSettled(waveIds.map(async childId => {
    const childDef = allNodes.find(n => n.id === childId)
    const cs = ns.children[childId]
    if (!childDef || !cs || cs.status !== 'pending') return
    cs.status = 'running'; cs.startedAt = new Date().toISOString()
    try { cs.sapRunId = await launchTask(run.connection, run.sessionId, childDef, defaults) }
    catch (e) { cs.status = 'error'; cs.finishedAt = new Date().toISOString(); cs.error = e.message }
  }))
}

// ─── Poll helpers ─────────────────────────────────────────────────────────────

function applyTaskResult(ns, sapStatus, strategy, maxRetries, retryDelaySec) {
  const code = (sapStatus?.code || '').toUpperCase()
  const hasEndTime = Boolean(sapStatus?.endTime)
  const statusMsg = (sapStatus?.statusMsg || '').toLowerCase()
  if (SUCCESS_CODES.has(code)) {
    ns.status = code === 'SUCCESS' ? 'success' : 'success_with_errors'
    ns.sapStatusCode = code; ns.finishedAt = new Date().toISOString()
  } else if (SUCCESS_ALIASES.has(code)) {
    ns.status = 'success'
    ns.sapStatusCode = code; ns.finishedAt = new Date().toISOString()
  } else if (TERMINAL_ERR_CODES.has(code)) {
    const msg = sapStatus?.statusMsg ? ` - ${sapStatus.statusMsg}` : ''
    if (strategy === 'retry' && ns.retryCount < maxRetries) {
      ns.status = 'pending'; ns.sapRunId = null; ns.sapStatusCode = null
      ns.retryCount++; ns.error = `SAP: ${code}${msg} (intento ${ns.retryCount}/${maxRetries})`
      ns.retryAt = new Date(Date.now() + retryDelaySec * 1000).toISOString()
    } else {
      ns.status = 'error'; ns.sapStatusCode = code
      ns.finishedAt = new Date().toISOString(); ns.error = `SAP: ${code}${msg}`
    }
  } else if (hasEndTime && !NON_TERMINAL_CODES.has(code)) {
    // Defensive fallback: some tenants return non-documented terminal codes.
    const looksError = statusMsg.includes('error') || statusMsg.includes('fail')
    ns.status = looksError ? 'error' : 'success'
    ns.sapStatusCode = code || 'ENDTIME_ONLY'
    ns.finishedAt = new Date().toISOString()
    if (looksError) ns.error = `SAP: ${code || 'UNKNOWN'}${sapStatus?.statusMsg ? ` - ${sapStatus.statusMsg}` : ''}`
  }
}

async function pollTaskNode(run, nodeId, nodeDef) {
  const ns = run.nodes[nodeId]
  const defaults = { agentName: run.defaultAgent, profileName: run.defaultProfile, globalVariables: run.globalVariables || [] }
  // Re-launch if pending retry and delay elapsed
  if (ns.status === 'pending' && ns.retryAt && new Date(ns.retryAt).getTime() <= Date.now()) {
    ns.status = 'running'; ns.retryAt = null; ns.sapRunId = null
    try { ns.sapRunId = await launchTask(run.connection, run.sessionId, nodeDef, defaults) }
    catch (e) { ns.status = 'error'; ns.finishedAt = new Date().toISOString(); ns.error = e.message }
    return
  }
  if (ns.status !== 'running' || !ns.sapRunId) return
  let sapStatus
  try { sapStatus = await pollSapStatus(run.connection, run.sessionId, ns.sapRunId) }
  catch { return }
  applyTaskResult(ns, sapStatus,
    nodeDef.data?.errorStrategy || 'stop',
    nodeDef.data?.maxRetries    || 0,
    nodeDef.data?.retryDelaySec || 30)
}

async function pollGroupNode(run, nodeId, nodeDef, allNodes, allEdges) {
  const ns = run.nodes[nodeId]
  if (!['running', 'pending'].includes(ns.status)) return
  const groupChildren = allNodes.filter(n => n.parentId === nodeId)
  if (groupChildren.length === 0) { ns.status = 'success'; ns.finishedAt = new Date().toISOString(); return }

  const defaults = { agentName: run.defaultAgent, profileName: run.defaultProfile, globalVariables: run.globalVariables || [] }

  const groupEdges = allEdges.filter(e =>
    groupChildren.some(c => c.id === e.source) && groupChildren.some(c => c.id === e.target)
  )

  // Predecessor map for group children — same dependency-based approach as top-level tick
  const predMap = {}
  for (const c of groupChildren) predMap[c.id] = []
  for (const e of groupEdges) {
    if (e.target in predMap && e.source in predMap) predMap[e.target].push(e.source)
  }

  // 1. Poll running children + handle pending-retry children
  await Promise.allSettled(groupChildren.map(async child => {
    const cs = ns.children[child.id]
    if (!cs) return
    if (cs.status === 'running' && cs.sapRunId) {
      let sapStatus
      try { sapStatus = await pollSapStatus(run.connection, run.sessionId, cs.sapRunId) }
      catch { return }
      applyTaskResult(cs, sapStatus,
        child.data?.errorStrategy || 'stop',
        child.data?.maxRetries    || 0,
        child.data?.retryDelaySec || 30)
    } else if (cs.status === 'pending' && cs.retryAt && new Date(cs.retryAt).getTime() <= Date.now()) {
      cs.retryAt = null; cs.status = 'running'
      try { cs.sapRunId = await launchTask(run.connection, run.sessionId, child, defaults) }
      catch (e) { cs.status = 'error'; cs.finishedAt = new Date().toISOString(); cs.error = e.message }
    }
  }))

  // 2. Launch pending children whose direct predecessors are all done
  await Promise.allSettled(groupChildren.map(async child => {
    const cs = ns.children[child.id]
    if (!cs || cs.status !== 'pending' || cs.retryAt) return
    const preds = predMap[child.id]
    if (!preds.every(pid => DONE_NODE.has(ns.children[pid]?.status))) return

    const blocked = preds.some(pid => {
      const ps = ns.children[pid]?.status
      if (ps === 'skipped') return true
      if (ps === 'error') return (allNodes.find(x => x.id === pid)?.data?.errorStrategy || 'stop') === 'stop'
      return false
    })
    if (blocked) { cs.status = 'skipped'; return }

    cs.status = 'running'; cs.startedAt = new Date().toISOString()
    try { cs.sapRunId = await launchTask(run.connection, run.sessionId, child, defaults) }
    catch (e) { cs.status = 'error'; cs.finishedAt = new Date().toISOString(); cs.error = e.message }
  }))

  // 3. Check group completion
  if (groupChildren.every(c => DONE_NODE.has(ns.children[c.id]?.status))) {
    ns.status = groupChildren.some(c => ns.children[c.id]?.status === 'error') ? 'error' : 'success'
    ns.finishedAt = new Date().toISOString()
  }
}

// ─── Resume run ───────────────────────────────────────────────────────────────
// Reset non-successful nodes to pending so execution continues from where it failed,
// preserving the results of nodes that already completed successfully.

async function resumeRun(orchestrationId, connection, sessionId) {
  return withRunLock(orchestrationId, async () => {
    const RUN_KEY = `cids:orch_run:${orchestrationId}`
    const run = await redisGetObj(RUN_KEY)
    if (!run) throw new Error('No hay ejecución registrada')
    if (run.status === 'running') {
      const err = new Error('Ya hay una ejecución activa'); err.statusCode = 409; throw err
    }
    if (run.status === 'success') {
      const err = new Error('La orquestación ya finalizó correctamente'); err.statusCode = 409; throw err
    }

    run.connection = connection
    run.sessionId  = sessionId
    run.status     = 'running'
    run.finishedAt = null

    function resetNs(ns) {
      if (ns.status === 'success' || ns.status === 'success_with_errors') return
      ns.status = 'pending'; ns.startedAt = null; ns.finishedAt = null
      ns.error = null; ns.sapRunId = null; ns.sapStatusCode = null
      ns.retryCount = 0; ns.retryAt = null
    }

    for (const ns of Object.values(run.nodes)) {
      if (ns.type === 'group') {
        if (ns.status === 'success' || ns.status === 'success_with_errors') continue
        ns.status = 'pending'; ns.startedAt = null; ns.finishedAt = null
        ns.error = null; ns.currentGroupWave = 0
        for (const cs of Object.values(ns.children || {})) resetNs(cs)
      } else {
        resetNs(ns)
      }
    }

    await redisSetObj(RUN_KEY, run)
    return run
  })
}

// ─── Start run ────────────────────────────────────────────────────────────────

async function startRun(orchestrationId, connection, sessionId, defaultAgent = null, defaultProfile = null, globalVariables = []) {
  return withRunLock(orchestrationId, async () => {
    const orch = await getOrchestration(orchestrationId)
    if (!orch) throw new Error('Orquestación no encontrada')

    const { nodes, edges } = resolveGraph(orch)
    if (nodes.filter(n => !n.parentId).length === 0) throw new Error('La orquestación no tiene nodos')

    const RUN_KEY = `cids:orch_run:${orchestrationId}`
    const existing = await redisGetObj(RUN_KEY)
    if (existing?.status === 'running') {
      const err = new Error('Ya hay una ejecución activa'); err.statusCode = 409; throw err
    }

    const waves = buildWaves(nodes.filter(n => !n.parentId), edges)
    if (waves.length === 0) throw new Error('No se pudo determinar el orden de ejecución (¿ciclo detectado?)')

    const run = {
      runId: crypto.randomUUID(),
      orchestrationId,
      connection, sessionId,
      status: 'running', currentWave: 0,
      startedAt: new Date().toISOString(), finishedAt: null,
      defaultAgent: defaultAgent || null, defaultProfile: defaultProfile || null,
      globalVariables: globalVariables || [],
      waves,
      nodes: Object.fromEntries(nodes.map(n => [n.id, initNodeState(n, nodes)])),
    }

    await redisSetObj(RUN_KEY, run)
    return run
  })
}

// ─── Tick ─────────────────────────────────────────────────────────────────────
// Each top-level node is scheduled independently based on its own predecessors,
// not by wave. This allows independent chains (A→B, C→D) to advance in parallel
// without waiting for every chain in the same "wave" to finish.

async function tick(orchestrationId) {
  const locked = await withRunLock(orchestrationId, async () => {
    const RUN_KEY = `cids:orch_run:${orchestrationId}`
    let run = await redisGetObj(RUN_KEY)
    if (!run || TERMINAL_RUN.has(run.status)) return run

    const orch = await getOrchestration(orchestrationId)
    if (!orch) {
      run.status = 'error'; run.finishedAt = new Date().toISOString()
      await redisSetObj(RUN_KEY, run); return run
    }

    const { nodes, edges } = resolveGraph(orch)
    const topNodes = nodes.filter(n => !n.parentId)
    const defaults = { agentName: run.defaultAgent, profileName: run.defaultProfile, globalVariables: run.globalVariables || [] }

    // Build direct-predecessor map for top-level nodes
    const predMap = {}
    for (const n of topNodes) predMap[n.id] = []
    for (const e of edges) {
      if (e.target in predMap && e.source in predMap) predMap[e.target].push(e.source)
    }

    // 1. Poll all currently running nodes (and pending-retry nodes)
    await Promise.allSettled(topNodes.map(async n => {
      const ns = run.nodes[n.id]
      if (!ns) return
      if (ns.status === 'running') {
        if (n.type === 'task')  await pollTaskNode(run, n.id, n)
        if (n.type === 'group') await pollGroupNode(run, n.id, n, nodes, edges)
      } else if (ns.status === 'pending' && ns.retryAt) {
        await pollTaskNode(run, n.id, n) // handles retry re-launch
      }
    }))

    // 2. Launch any pending node whose direct predecessors are all done
    await Promise.allSettled(topNodes.map(async n => {
      const ns = run.nodes[n.id]
      if (!ns || ns.status !== 'pending' || ns.retryAt) return
      const preds = predMap[n.id]
      if (!preds.every(pid => DONE_NODE.has(run.nodes[pid]?.status))) return

      // Propagate skip when a predecessor errored with strategy=stop or was itself skipped
      const blocked = preds.some(pid => {
        const ps = run.nodes[pid]?.status
        if (ps === 'skipped') return true
        if (ps === 'error') return (nodes.find(x => x.id === pid)?.data?.errorStrategy || 'stop') === 'stop'
        return false
      })
      if (blocked) { ns.status = 'skipped'; return }

      if (n.type === 'task') {
        ns.status = 'running'; ns.startedAt = new Date().toISOString()
        try { ns.sapRunId = await launchTask(run.connection, run.sessionId, n, defaults) }
        catch (e) { ns.status = 'error'; ns.finishedAt = new Date().toISOString(); ns.error = e.message }
      } else if (n.type === 'group') {
        ns.status = 'running'; ns.startedAt = new Date().toISOString()
        const groupChildren = nodes.filter(nd => nd.parentId === n.id)
        if (groupChildren.length === 0) { ns.status = 'success'; ns.finishedAt = new Date().toISOString(); return }
        const groupEdges = edges.filter(e =>
          groupChildren.some(c => c.id === e.source) && groupChildren.some(c => c.id === e.target)
        )
        ns.groupWaves = buildWaves(groupChildren, groupEdges)
        ns.currentGroupWave = 0
        await launchGroupWave(run, ns, ns.groupWaves[0], nodes, defaults)
      }
    }))

    // 3. Check overall completion
    if (topNodes.every(n => DONE_NODE.has(run.nodes[n.id]?.status))) {
      run.status = topNodes.some(n => run.nodes[n.id]?.status === 'error') ? 'error' : 'success'
      run.finishedAt = new Date().toISOString()
    }

    await redisSetObj(RUN_KEY, run)
    return run
  })
  if (locked !== null) return locked
  return redisGetObj(`cids:orch_run:${orchestrationId}`)
}

// ─── Cancel run ───────────────────────────────────────────────────────────────

async function cancelRun(orchestrationId) {
  const doCancel = async () => withRunLock(orchestrationId, async () => {
    const RUN_KEY = `cids:orch_run:${orchestrationId}`
    const run = await redisGetObj(RUN_KEY)
    if (!run) throw new Error('No hay ejecución registrada')
    if (TERMINAL_RUN.has(run.status)) {
      const err = new Error('La ejecución ya está en estado terminal'); err.statusCode = 409; throw err
    }

    const now = new Date().toISOString()
    await Promise.allSettled(Object.values(run.nodes).flatMap(ns => {
      const tasks = []
      if (ns.type === 'task' && ns.status === 'running' && ns.sapRunId) {
        tasks.push(soapRequest(run.connection, run.sessionId, 'cancelTask', { runId: ns.sapRunId }).catch(() => {}))
      }
      if (ns.type === 'group') {
        for (const cs of Object.values(ns.children || {})) {
          if (cs.status === 'running' && cs.sapRunId) {
            tasks.push(soapRequest(run.connection, run.sessionId, 'cancelTask', { runId: cs.sapRunId }).catch(() => {}))
          }
        }
      }
      return tasks
    }))

    run.status = 'cancelled'; run.finishedAt = now
    for (const ns of Object.values(run.nodes)) {
      if (ns.status === 'running') { ns.status = 'cancelled'; ns.finishedAt = now }
      if (ns.status === 'pending') ns.status = 'skipped'
      if (ns.type === 'group') {
        for (const cs of Object.values(ns.children || {})) {
          if (cs.status === 'running') { cs.status = 'cancelled'; cs.finishedAt = now }
          if (cs.status === 'pending') cs.status = 'skipped'
        }
      }
    }

    await redisSetObj(RUN_KEY, run)
    return run
  })

  // Retry up to 5 times (500 ms apart) in case a tick holds the lock
  for (let i = 0; i < 5; i++) {
    const result = await doCancel()
    if (result !== null) return result
    await new Promise(r => setTimeout(r, 500))
  }
  return redisGetObj(`cids:orch_run:${orchestrationId}`)
}

export { tick }

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'Redis no configurado' })

  try {
    if (req.method === 'POST') {
      const { orchestrationId, action, defaultAgent, defaultProfile, globalVariables } = req.body || {}
      if (!orchestrationId) return res.status(400).json({ error: 'orchestrationId requerido' })
      if (!['start', 'resume'].includes(action)) return res.status(400).json({ error: 'action debe ser "start" o "resume"' })
      const { connection, sessionId } = req.body || {}
      if (!connection?.hciUrl || !sessionId) return res.status(400).json({ error: 'connection y sessionId requeridos' })
      if (action === 'resume') {
        await resumeRun(orchestrationId, connection, sessionId)
        const run = await tick(orchestrationId)
        return res.status(200).json(run)
      }
      await startRun(orchestrationId, connection, sessionId, defaultAgent || null, defaultProfile || null, globalVariables || [])
      const run = await tick(orchestrationId)
      return res.status(201).json(run)
    }

    if (req.method === 'GET') {
      const { orchestrationId, action } = req.query
      if (!orchestrationId) return res.status(400).json({ error: 'orchestrationId requerido' })
      if (action === 'tick') return res.json(await tick(orchestrationId))
      return res.json(await redisGetObj(`cids:orch_run:${orchestrationId}`))
    }

    if (req.method === 'DELETE') {
      const { orchestrationId } = req.body || {}
      if (!orchestrationId) return res.status(400).json({ error: 'orchestrationId requerido' })
      return res.json(await cancelRun(orchestrationId))
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message })
  }
}
