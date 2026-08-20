import { describe, it, expect, vi, beforeEach } from 'vitest'

// El módulo resuelve el hostname con dns.lookup; se mockea para no depender de la red.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

const { lookup } = await import('node:dns/promises')
const { validatePublicHttpsUrl } = await import('../../api/_ssrf.js')

// Resuelve todo hostname a una IP pública salvo que un test diga otra cosa.
beforeEach(() => {
  lookup.mockReset()
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

describe('validatePublicHttpsUrl · protocolo y forma', () => {
  it('rechaza una URL inválida', async () => {
    expect(await validatePublicHttpsUrl('no-es-una-url')).toBe('URL inválida')
    expect(await validatePublicHttpsUrl('')).toBe('URL inválida')
  })

  it('rechaza cualquier esquema que no sea https', async () => {
    expect(await validatePublicHttpsUrl('http://example.com')).toBe('Solo se permite HTTPS')
    expect(await validatePublicHttpsUrl('ftp://example.com')).toBe('Solo se permite HTTPS')
    expect(await validatePublicHttpsUrl('file:///etc/passwd')).toBe('Solo se permite HTTPS')
  })

  it('acepta un host público que resuelve a una IP pública', async () => {
    expect(await validatePublicHttpsUrl('https://example.com/path')).toBeNull()
  })
})

describe('validatePublicHttpsUrl · literales IPv4', () => {
  // No pasan por DNS: se evalúan directo como literal.
  it.each([
    ['0.0.0.0',         'red 0.0.0.0/8'],
    ['10.1.2.3',        'privada 10/8'],
    ['127.0.0.1',       'loopback'],
    ['169.254.169.254', 'metadata de cloud'],
    ['172.16.0.1',      'privada 172.16/12 (borde inferior)'],
    ['172.31.255.254',  'privada 172.16/12 (borde superior)'],
    ['192.168.1.1',     'privada 192.168/16'],
    ['192.0.0.1',       'reservada 192.0.0/24'],
    ['100.64.0.1',      'CGNAT 100.64/10'],
    ['100.127.255.254', 'CGNAT (borde superior)'],
    ['198.18.0.1',      'benchmarking 198.18/15'],
    ['198.19.0.1',      'benchmarking 198.18/15'],
    ['224.0.0.1',       'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('rechaza %s (%s)', async (ip) => {
    expect(await validatePublicHttpsUrl(`https://${ip}/`)).toBe('Host no permitido')
  })

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.15.0.1'],   // justo debajo del rango privado
    ['172.32.0.1'],   // justo encima del rango privado
    ['100.63.255.255'], // justo debajo de CGNAT
    ['223.255.255.255'], // justo debajo de multicast
  ])('acepta la IP pública %s', async (ip) => {
    expect(await validatePublicHttpsUrl(`https://${ip}/`)).toBeNull()
  })

  it('no consulta DNS cuando el host ya es un literal IP', async () => {
    await validatePublicHttpsUrl('https://8.8.8.8/')
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('validatePublicHttpsUrl · literales IPv6', () => {
  it.each([
    ['[::1]',                 'loopback'],
    ['[::]',                  'unspecified'],
    ['[fc00::1]',             'ULA fc00::/7'],
    ['[fd12:3456::1]',        'ULA fd00::/8'],
    ['[fe80::1]',             'link-local'],
  ])('rechaza %s (%s)', async (host) => {
    expect(await validatePublicHttpsUrl(`https://${host}/`)).toBe('Host no permitido')
  })

  it('acepta una IPv6 pública', async () => {
    expect(await validatePublicHttpsUrl('https://[2606:4700:4700::1111]/')).toBeNull()
  })

  // Regresión: new URL() reescribe el cuádruple decimal como hex
  // (::ffff:127.0.0.1 → ::ffff:7f00:1). Mientras la comprobación solo miraba la
  // forma decimal, estas URLs esquivaban el guard por completo.
  describe('IPv4 embebida, normalizada a hex por el parser de URL', () => {
    it.each([
      ['[::ffff:169.254.169.254]', 'metadata de cloud, IPv4-mapped'],
      ['[::ffff:127.0.0.1]',       'loopback, IPv4-mapped'],
      ['[::ffff:10.0.0.1]',        'red privada, IPv4-mapped'],
      ['[::ffff:192.168.0.1]',     'red privada, IPv4-mapped'],
      ['[::127.0.0.1]',            'loopback, IPv4-compatible'],
      ['[::10.0.0.1]',             'red privada, IPv4-compatible'],
      ['[::ffff:0:127.0.0.1]',     'loopback, IPv4-translated'],
      ['[::ffff:0:10.0.0.1]',      'red privada, IPv4-translated'],
    ])('rechaza %s (%s)', async (host) => {
      expect(await validatePublicHttpsUrl(`https://${host}/`)).toBe('Host no permitido')
    })

    it.each([
      ['[::ffff:8.8.8.8]'],
      ['[::ffff:1.1.1.1]'],
    ])('acepta %s por ser IPv4 pública embebida', async (host) => {
      expect(await validatePublicHttpsUrl(`https://${host}/`)).toBeNull()
    })
  })

  // dns.lookup sí devuelve la forma decimal, que es la que cubre la otra rama.
  it('rechaza la forma decimal IPv4-mapped tal como la devuelve dns.lookup', async () => {
    lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }])
    expect(await validatePublicHttpsUrl('https://interno.example.com')).toBe('Host no permitido')
  })
})

describe('validatePublicHttpsUrl · resolución DNS', () => {
  it('rechaza un hostname que resuelve a una IP privada', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect(await validatePublicHttpsUrl('https://interno.example.com')).toBe('Host no permitido')
  })

  it('rechaza si cualquiera de las direcciones resueltas es privada', async () => {
    lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ])
    expect(await validatePublicHttpsUrl('https://mixto.example.com')).toBe('Host no permitido')
  })

  it('rechaza un hostname que resuelve a IPv6 privada', async () => {
    lookup.mockResolvedValue([{ address: 'fd00::1', family: 6 }])
    expect(await validatePublicHttpsUrl('https://interno.example.com')).toBe('Host no permitido')
  })

  it('rechaza cuando la resolución falla', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'))
    expect(await validatePublicHttpsUrl('https://noexiste.example.com'))
      .toBe('No se pudo resolver el host')
  })

  it('rechaza cuando la resolución devuelve lista vacía', async () => {
    lookup.mockResolvedValue([])
    expect(await validatePublicHttpsUrl('https://vacio.example.com'))
      .toBe('No se pudo resolver el host')
  })

  it('resuelve con la opción all para revisar todas las direcciones', async () => {
    await validatePublicHttpsUrl('https://example.com')
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true })
  })

  // getaddrinfo canonicaliza las codificaciones alternativas de IPv4 (decimal, hex,
  // octal), así que el guard las cubre por la vía de la resolución.
  it('rechaza la forma decimal de una IP privada vía DNS', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect(await validatePublicHttpsUrl('https://2130706433/')).toBe('Host no permitido')
  })
})
