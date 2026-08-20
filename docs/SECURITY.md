# Seguridad

Resumen del modelo de seguridad de CIDS Studio: cómo se autentica, qué protege el backend y qué limitaciones conocidas existen. Complementa [ARCHITECTURE.md](ARCHITECTURE.md).

## Autenticación de la API interna (`/api/*`)

Todo endpoint exige `Authorization: Bearer <API_TOKEN>`. La validación está en [api/_auth.js](../api/_auth.js):

- Comparación timing-safe (`crypto.timingSafeEqual`) para evitar ataques de temporización.
- `API_TOKEN` debe tener al menos 16 caracteres; si falta o es corto, el endpoint responde `500` (fail-secure).
- Token incorrecto o ausente: `401`.

El token se genera con `npm run gen:secret` (32 bytes hex) y se configura como `API_TOKEN` (backend) y `VITE_API_TOKEN` (frontend).

En el cliente, el header lo inyecta el interceptor global de [src/apiFetch.js](../src/apiFetch.js), que solo lo agrega a llamadas `/api/*` **del mismo origen**: las tres formas de input (string, `URL`, `Request`) se resuelven contra `window.location.origin` antes de comparar. Antes se comparaba solo el `pathname`, de modo que una `URL` o un `Request` absolutos a otro host con path `/api/` se llevaban el token puesto. Cubierto por [tests/src/apiFetch.test.js](../tests/src/apiFetch.test.js).

### Limitación conocida: token de frontend público

`VITE_API_TOKEN` se inyecta en el bundle del cliente (Vite expone las variables con prefijo `VITE_`). Cualquiera con acceso al frontend puede leerlo y llamar a `/api/*` directamente. Para un despliegue con usuarios no confiables esto es equivalente a no tener auth de API.

Esto ya está anotado en [.env.example](../.env.example). Mitigación recomendada: mover a autenticación por sesión (cookie httpOnly emitida tras un login real) en lugar de un token compartido embebido. Registrado en [DEUDA-TECNICA.md](DEUDA-TECNICA.md).

## Autenticación contra SAP

### SAP CI-DS (SOAP)

Flujo por sesión, sin almacenar credenciales:

1. El usuario envía usuario y contraseña a `/api/sap-login`.
2. El backend hace `logon()` contra CI-DS y obtiene un `sessionId`.
3. El `sessionId` se devuelve al cliente y se guarda en `sessionStorage` (`sap_${connId}`), con alcance de pestaña.
4. Las llamadas siguientes pasan el `sessionId`; la contraseña no se vuelve a usar ni se persiste.

La contraseña no se guarda en Redis, ni en localStorage, ni en logs. Los `SessionId` se redactan antes de exponer cualquier XML de debug.

### SAP IBP (OData)

[api/ibp-proxy.js](../api/ibp-proxy.js) usa auth Basic, con credenciales pasadas por request y no almacenadas.

## Protección SSRF

Las funciones que hacen requests salientes a URLs provistas por el usuario (proxy IBP, Explorer) validan el destino con `validatePublicHttpsUrl` en [api/_ssrf.js](../api/_ssrf.js):

- Solo HTTPS.
- Resolución DNS del host y rechazo si cualquier dirección resuelta es privada o reservada: loopback (`127/8`, `::1`), RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), link-local y metadata de nube (`169.254/16`, `fe80::/10`), ULA IPv6 (`fc00::/7`), CGNAT (`100.64/10`), benchmarking (`198.18/15`), multicast y reservados (`>=224`), e IPs malformadas.
- Normaliza codificaciones IPv4 alternativas (decimal/hex/octal) e IPv4 mapeadas en IPv6, en las dos formas en que aparecen: la decimal que devuelve `dns.lookup` (`::ffff:127.0.0.1`) y la hexadecimal a la que `new URL()` normaliza el literal (`::ffff:7f00:1`), incluidas las variantes IPv4-compatible (`::a.b.c.d`) e IPv4-translated (`::ffff:0:a.b.c.d`).

Queda una ventana TOCTOU residual entre resolución y conexión (DNS rebinding); está documentada en el propio archivo y se consideró aceptable frente al costo de IP pinning completo.

Los tests de este guard están en [tests/api/ssrf.test.js](../tests/api/ssrf.test.js). Fueron los que destaparon un bypass: la comprobación de IPv4 mapeada solo contemplaba la forma decimal, que `new URL()` nunca produce, así que `https://[::ffff:169.254.169.254]/` alcanzaba el endpoint de metadata mientras `https://169.254.169.254/` se bloqueaba correctamente. Corregido; los casos quedaron como test de regresión.

Como defensa adicional, las llamadas salientes usan `redirect: 'manual'` para que una redirección no permita saltar la validación.

## CORS

[api/_cors.js](../api/_cors.js) refleja el `Origin` solo si está en la allowlist `ALLOWED_ORIGINS` (separada por comas). Maneja el preflight `OPTIONS` con `204` y agrega `Vary: Origin`. En producción `ALLOWED_ORIGINS` debe configurarse explícitamente; vacío significa que ningún origen externo es permitido.

## Cron

[api/cron-tick.js](../api/cron-tick.js) exige `Authorization: Bearer <CRON_SECRET>` (mínimo 16 chars; `500` si falta). Lo invoca Vercel Cron para avanzar las orquestaciones en curso.

## Manejo de secretos

- Los secretos viven en variables de entorno; `.env` está en `.gitignore`. La plantilla pública es [.env.example](../.env.example).
- No hay credenciales ni tokens hardcodeados en el código fuente.
- Acceso a Redis vía token REST de Upstash en variable de entorno.

## Variables de entorno sensibles

| Variable | Sensibilidad |
|---|---|
| `API_TOKEN` | Alta. Protege toda la API interna. |
| `VITE_API_TOKEN` | Alta y pública de facto (ver limitación arriba). |
| `CRON_SECRET` | Alta. Protege el endpoint de cron. |
| `KV_REST_API_TOKEN` | Alta. Acceso completo a Redis. |
| `ALLOWED_ORIGINS` | Media. Configuración de CORS. |

## Reporte de problemas

Para vulnerabilidades, contactar al equipo de GoSCM en vez de abrir un issue público.
