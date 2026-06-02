import { lookup } from 'node:dns/promises'
import net from 'node:net'

// ─────────────────────────────────────────────────────────────────────────────
// Anti-SSRF guard for user-supplied outbound URLs (SAP IBP proxy / CI-DS SOAP).
// Requires HTTPS and rejects any host that resolves to a private / reserved
// address. DNS resolution also normalizes alternate IPv4 encodings (decimal,
// hex, octal) since getaddrinfo canonicalizes them, and catches hostnames that
// point at internal IPs. A residual DNS-rebinding TOCTOU window remains (resolve
// then connect) — acceptable here; full IP pinning would be disproportionate.
// ─────────────────────────────────────────────────────────────────────────────

function ipv4IsPrivate(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true // malformed → unsafe
  const [a, b] = p
  if (a === 0) return true                       // 0.0.0.0/8
  if (a === 10) return true                      // 10/8
  if (a === 127) return true                     // loopback
  if (a === 169 && b === 254) return true        // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true        // 192.168/16
  if (a === 192 && b === 0 && p[2] === 0) return true // 192.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true   // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18/15
  if (a >= 224) return true                      // multicast / reserved 224+
  return false
}

function ipv6IsPrivate(ip) {
  const lc = ip.toLowerCase()
  if (lc === '::1' || lc === '::') return true
  // IPv4-mapped / -compatible (::ffff:a.b.c.d or ::a.b.c.d)
  const mapped = lc.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped) return ipv4IsPrivate(mapped[1])
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true   // ULA fc00::/7
  if (lc.startsWith('fe8') || lc.startsWith('fe9') ||
      lc.startsWith('fea') || lc.startsWith('feb')) return true // link-local fe80::/10
  return false
}

function isPrivateAddress(ip) {
  const fam = net.isIP(ip)
  if (fam === 4) return ipv4IsPrivate(ip)
  if (fam === 6) return ipv6IsPrivate(ip)
  return true // not a recognizable IP → treat as unsafe
}

// Returns an error string when the URL is unsafe, or null when it is allowed.
export async function validatePublicHttpsUrl(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { return 'URL inválida' }
  if (parsed.protocol !== 'https:') return 'Solo se permite HTTPS'

  const host = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets

  // Direct IP literal (incl. decimal/hex via lookup below if not a literal)
  if (net.isIP(host)) {
    return isPrivateAddress(host) ? 'Host no permitido' : null
  }

  let addresses
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    return 'No se pudo resolver el host'
  }
  if (!addresses.length) return 'No se pudo resolver el host'
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) return 'Host no permitido'
  }
  return null
}
