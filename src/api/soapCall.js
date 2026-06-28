// Cliente SOAP único del frontend.
//
// Reemplaza las definiciones locales que estaban duplicadas en cada componente
// (TaskMonitor, Tasks, Resumen, GlobalResumen, RunModal, RunSingleModal,
// RunLogModal, NodeConfigPanel, TaskPalette). Es el superconjunto de todas las
// variantes previas: parseo seguro del cuerpo, manejo de sesión expirada (401)
// y modo debug.
//
// El token Bearer NO se gestiona aquí: lo inyecta el interceptor global de
// `src/apiFetch.js` en todas las llamadas a `/api/*`.
//
// Modo debug: activo con `import.meta.env.DEV` o `localStorage.ibpSoapDebug === '1'`.
// En ese caso se envía `_debug: true` y el backend responde con metadatos
// (`_result`, `_operation`, `_soapAction`, `_requestBodyXml`, ...). Se loguean y
// se devuelve `_result` para que la forma de la respuesta coincida con producción.

export function isSoapDebug() {
  return typeof window !== 'undefined'
    && (import.meta.env.DEV || localStorage.getItem('ibpSoapDebug') === '1')
}

export async function soapCall(connection, sessionId, operation, params = {}) {
  const debugSoap = isSoapDebug()
  const res = await fetch('/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: {
        hciUrl: connection.hciUrl,
        orgName: connection.orgName,
        isProduction: connection.isProduction,
      },
      sessionId,
      operation,
      params: debugSoap ? { ...params, _debug: true } : params,
    }),
  })
  const raw = await res.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch { /* respuesta no-JSON: data queda null */ }
  if (res.status === 401) throw Object.assign(new Error('Sesión SAP expirada'), { isSessionExpired: true })
  if (!res.ok) {
    const msg = data?.error || raw?.slice(0, 240) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (!data) throw new Error(raw?.slice(0, 240) || 'Respuesta inválida del servidor')
  if (data.error) throw new Error(data.error)
  if (debugSoap && data?._result !== undefined) {
    console.log(`[SOAP DEBUG] op=${data._operation || operation}`, {
      soapAction: data._soapAction,
      requestBodyXml: data._requestBodyXml,
      requestEnvelopeXml: data._requestEnvelopeXml,
      rawXml: data._rawXml,
    })
    return data._result
  }
  return data
}

export default soapCall
