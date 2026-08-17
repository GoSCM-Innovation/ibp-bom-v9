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

// Expand an IPv6 in hex notation to its 8 numeric groups. Returns null when the
// address carries a decimal tail (handled separately) or is not expandable.
function expandIpv6(lc) {
  if (lc.includes('.')) return null
  const halves = lc.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  if (halves.length === 1) return head.length === 8 ? head.map(h => parseInt(h, 16)) : null
  const tail = halves[1] ? halves[1].split(':') : []
  if (head.length + tail.length > 8) return null
  const groups = [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
  return groups.map(h => parseInt(h || '0', 16))
}

function ipv6IsPrivate(ip) {
  const lc = ip.toLowerCase()
  // IPv4-mapped / -compatible in decimal form (::ffff:a.b.c.d or ::a.b.c.d).
  // This is what dns.lookup returns, not what survives new URL().
  const mapped = lc.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped) return ipv4IsPrivate(mapped[1])
  // Same address once normalized: the WHATWG parser rewrites the decimal quad as
  // hex (::ffff:127.0.0.1 -> ::ffff:7f00:1), so for user-supplied URLs the branch
  // above never fires. Anything with the first 64 bits zeroed (::, ::1,
  // ::a.b.c.d, ::ffff:a.b.c.d and the translated ::ffff:0:a.b.c.d) carries an
  // embedded IPv4 in the low 32 bits: decode it and apply the IPv4 policy.
  const g = expandIpv6(lc)
  if (g && g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0) {
    return ipv4IsPrivate([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.'))
  }
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
