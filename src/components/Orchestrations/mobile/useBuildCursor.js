import { useState, useRef, useEffect } from 'react'

// For each context (parentId or null = top-level), find the "head" node:
// the node with no outgoing edges within that context AND the highest column
// in the local Kahn ordering. Returns Map<ctx, nodeId>.
function reconstructLastLeaf(nodes, edges) {
  const byContext = new Map()
  for (const n of nodes) {
    const ctx = n.parentId ?? null
    if (!byContext.has(ctx)) byContext.set(ctx, [])
    byContext.get(ctx).push(n)
  }
  const lastLeaf = new Map()
  for (const [ctx, ctxNodes] of byContext.entries()) {
    if (ctxNodes.length === 0) continue
    const ids = new Set(ctxNodes.map(n => n.id))
    const inDegree = {}
    const adj = {}
    for (const n of ctxNodes) { inDegree[n.id] = 0; adj[n.id] = [] }
    for (const e of edges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        adj[e.source].push(e.target)
        inDegree[e.target]++
      }
    }
    const colOf = {}
    let ready = ctxNodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
    let col = 0
    while (ready.length > 0) {
      ready.forEach(id => { colOf[id] = col })
      const next = []
      for (const id of ready) {
        for (const d of adj[id]) {
          if (--inDegree[d] === 0) next.push(d)
        }
      }
      ready = next; col++
    }
    let bestId = null, bestCol = -1
    for (const n of ctxNodes) {
      const hasOut = adj[n.id]?.length > 0
      if (hasOut) continue
      const c = colOf[n.id] ?? 0
      if (c > bestCol) { bestCol = c; bestId = n.id }
    }
    if (bestId) lastLeaf.set(ctx, bestId)
  }
  return lastLeaf
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function makeTaskNode(parentCtx, taskData) {
  return {
    id: makeId('task'),
    type: 'task',
    position: { x: 0, y: 0 },
    ...(parentCtx ? { parentId: parentCtx, extent: 'parent' } : {}),
    data: {
      taskName: taskData.taskName,
      taskGuid: taskData.taskGuid,
      taskType: taskData.type,
      label: taskData.taskName,
      errorStrategy: 'stop',
      maxRetries: 1,
      retryDelaySec: 30,
      globalVariables: [],
    },
  }
}

function makeGroupNode(parentCtx, mode = 'parallel') {
  return {
    id: makeId('group'),
    type: 'group',
    position: { x: 0, y: 0 },
    ...(parentCtx ? { parentId: parentCtx, extent: 'parent' } : {}),
    data: {
      label: mode === 'parallel' ? 'Grupo paralelo' : 'Grupo',
      groupMode: mode,
    },
    style: { width: 320, height: 200 },
  }
}

export function useBuildCursor({ nodes, edges, onChange }) {
  const [cursorPath, setCursorPath] = useState([null])
  const [undoCount, setUndoCount] = useState(0)
  const undoStackRef = useRef([])
  const lastLeafRef  = useRef(reconstructLastLeaf(nodes, edges))

  useEffect(() => {
    lastLeafRef.current = reconstructLastLeaf(nodes, edges)
  }, [nodes, edges])

  const currentContext = cursorPath[cursorPath.length - 1]

  function pushUndo() {
    undoStackRef.current.push({
      nodes: nodes.slice(),
      edges: edges.slice(),
      cursor: cursorPath.slice(),
    })
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
    setUndoCount(undoStackRef.current.length)
  }

  function commit(newNodes, newEdges) {
    onChange(newNodes, newEdges)
    lastLeafRef.current = reconstructLastLeaf(newNodes, newEdges)
  }

  function addTaskSequential(taskData) {
    pushUndo()
    const ctx = currentContext
    const node = makeTaskNode(ctx, taskData)
    const prev = lastLeafRef.current.get(ctx)
    const newNodes = [...nodes, node]
    const newEdges = prev
      ? [...edges, { id: `e_${prev}_${node.id}`, source: prev, target: node.id }]
      : edges.slice()
    commit(newNodes, newEdges)
  }

  function addTaskParallel(taskData) {
    pushUndo()
    const ctx = currentContext
    const node = makeTaskNode(ctx, taskData)
    const newNodes = [...nodes, node]
    commit(newNodes, edges.slice())
  }

  function openParallelBranch() {
    pushUndo()
    const ctx = currentContext
    const group = makeGroupNode(ctx, 'parallel')
    const prev = lastLeafRef.current.get(ctx)
    const newNodes = [...nodes, group]
    const newEdges = prev
      ? [...edges, { id: `e_${prev}_${group.id}`, source: prev, target: group.id }]
      : edges.slice()
    commit(newNodes, newEdges)
    setCursorPath(p => [...p, group.id])
  }

  function closeBranch() {
    if (cursorPath.length <= 1) return
    setCursorPath(p => p.slice(0, -1))
  }

  function undo() {
    const last = undoStackRef.current.pop()
    setUndoCount(undoStackRef.current.length)
    if (!last) return
    commit(last.nodes, last.edges)
    setCursorPath(last.cursor)
  }

  function setCursorToContext(ctx) {
    if (ctx === null || ctx === undefined) {
      setCursorPath([null])
      return
    }
    const chain = []
    let cur = nodes.find(n => n.id === ctx)
    while (cur) {
      chain.unshift(cur.id)
      cur = cur.parentId ? nodes.find(n => n.id === cur.parentId) : null
    }
    setCursorPath([null, ...chain])
  }

  return {
    cursorPath,
    currentContext,
    addTaskSequential,
    addTaskParallel,
    openParallelBranch,
    closeBranch,
    undo,
    canUndo: undoCount > 0,
    canClose: cursorPath.length > 1,
    setCursorToContext,
  }
}
