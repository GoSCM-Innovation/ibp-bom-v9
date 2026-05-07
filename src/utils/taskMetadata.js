// Hipótesis de claves comunes en getTaskInfo.properties[]. Las exactas varían
// según la versión de SAP CI-DS y el cliente. Validar con sesión real activando
// `localStorage.setItem('ibpSoapDebug','1')` y revisar consola al expandir.
const SOURCE_KEYS = [
  'SourceDataStoreName',
  'SourceSystem',
  'SrcDataStoreName',
  'srcSystem',
  'src_ds',
  'sourceDS',
  'source',
]

const TARGET_KEYS = [
  'TargetDataStoreName',
  'TargetSystem',
  'TgtDataStoreName',
  'tgtSystem',
  'tgt_ds',
  'targetDS',
  'target',
]

function findProp(properties, candidates) {
  if (!Array.isArray(properties)) return null
  for (const key of candidates) {
    const p = properties.find(x => x?.name === key)
    if (p?.value) return p.value
  }
  // Fallback case-insensitive
  for (const key of candidates) {
    const lower = key.toLowerCase()
    const p = properties.find(x => (x?.name || '').toLowerCase() === lower)
    if (p?.value) return p.value
  }
  return null
}

export function extractTaskMetadata(properties) {
  return {
    sourceSystem: findProp(properties, SOURCE_KEYS),
    targetSystem: findProp(properties, TARGET_KEYS),
    raw: Array.isArray(properties) ? properties : [],
  }
}
