// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  TZ_OPTIONS, getTzMode, setTzMode, getTzOffsetHours, getTzLabel,
  toSapTs, parseSapTs, formatSapTs, formatSapTsShort, dayLabel,
  formatEpochMs, dayLabelEpoch, toInputDate, inputDateToDate,
} from '../../src/utils/dateUtils.js'

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('modo de zona horaria', () => {
  it('expone las tres opciones', () => {
    expect(TZ_OPTIONS.map(o => o.value)).toEqual(['utc', 'utc-4', 'local'])
  })

  it('usa utc por defecto', () => {
    expect(getTzMode()).toBe('utc')
  })

  it('persiste y lee el modo elegido', () => {
    setTzMode('utc-4')
    expect(getTzMode()).toBe('utc-4')
  })

  it('cae a utc si el valor guardado no es válido', () => {
    localStorage.setItem('ibp_tz_mode', 'marte')
    expect(getTzMode()).toBe('utc')
  })
})

describe('getTzOffsetHours', () => {
  it('devuelve el offset fijo de cada modo', () => {
    expect(getTzOffsetHours('utc')).toBe(0)
    expect(getTzOffsetHours('utc-4')).toBe(-4)
  })

  it('usa el offset del navegador en modo local', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(180) // UTC-3
    expect(getTzOffsetHours('local')).toBe(-3)
  })

  it('lee el modo guardado cuando no se pasa argumento', () => {
    setTzMode('utc-4')
    expect(getTzOffsetHours()).toBe(-4)
  })

  it('devuelve 0 ante un modo desconocido', () => {
    expect(getTzOffsetHours('marte')).toBe(0)
  })
})

describe('getTzLabel', () => {
  it('devuelve la etiqueta fija de los modos con offset entero', () => {
    expect(getTzLabel('utc')).toBe('UTC')
    expect(getTzLabel('utc-4')).toBe('UTC-4')
  })

  it('construye la etiqueta del modo local con offset negativo', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(180)
    expect(getTzLabel('local')).toBe('UTC-3')
  })

  it('construye la etiqueta del modo local con offset positivo', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120)
    expect(getTzLabel('local')).toBe('UTC+2')
  })

  it('incluye los minutos en zonas de media hora', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330) // UTC+5:30
    expect(getTzLabel('local')).toBe('UTC+5:30')
  })

  it('etiqueta UTC+0 cuando el navegador está en UTC', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0)
    expect(getTzLabel('local')).toBe('UTC+0')
  })

  it('cae a UTC ante un modo desconocido', () => {
    expect(getTzLabel('marte')).toBe('UTC')
  })
})

describe('toSapTs', () => {
  it('formatea un Date como timestamp SAP en UTC', () => {
    expect(toSapTs(new Date(Date.UTC(2026, 0, 5, 9, 7, 3)))).toBe('20260105090703.0000000')
  })

  it('rellena con ceros los componentes de un dígito', () => {
    expect(toSapTs(new Date(Date.UTC(2026, 8, 1, 0, 0, 0)))).toBe('20260901000000.0000000')
  })
})

describe('parseSapTs', () => {
  it('interpreta el timestamp como UTC', () => {
    expect(parseSapTs('20260105090703').toISOString()).toBe('2026-01-05T09:07:03.000Z')
  })

  it('acepta el sufijo de fracción de segundo', () => {
    expect(parseSapTs('20260105090703.0000000').toISOString()).toBe('2026-01-05T09:07:03.000Z')
  })

  it('asume medianoche cuando solo viene la fecha', () => {
    expect(parseSapTs('20260105').toISOString()).toBe('2026-01-05T00:00:00.000Z')
  })

  it('devuelve null con entrada vacía o demasiado corta', () => {
    expect(parseSapTs(null)).toBeNull()
    expect(parseSapTs('')).toBeNull()
    expect(parseSapTs('2026')).toBeNull()
  })

  it('hace round-trip con toSapTs', () => {
    const d = new Date(Date.UTC(2026, 6, 29, 18, 45, 12))
    expect(parseSapTs(toSapTs(d)).getTime()).toBe(d.getTime())
  })
})

describe('formatSapTs', () => {
  it('formatea en UTC', () => {
    expect(formatSapTs('20260105090703', 'utc')).toBe('05/01/2026 09:07:03')
  })

  it('desplaza la hora en modo utc-4', () => {
    expect(formatSapTs('20260105090703', 'utc-4')).toBe('05/01/2026 05:07:03')
  })

  // El caso que se rompe si alguien toca el cálculo del offset.
  it('retrocede al día anterior cuando el desplazamiento cruza medianoche', () => {
    expect(formatSapTs('20260105020000', 'utc-4')).toBe('04/01/2026 22:00:00')
  })

  it('cruza también el cambio de año', () => {
    expect(formatSapTs('20260101010000', 'utc-4')).toBe('31/12/2025 21:00:00')
  })

  it('usa el modo guardado cuando no se pasa argumento', () => {
    setTzMode('utc-4')
    expect(formatSapTs('20260105090703')).toBe('05/01/2026 05:07:03')
  })

  it('devuelve el guion largo con entrada inválida o incompleta', () => {
    expect(formatSapTs(null, 'utc')).toBe('—')
    expect(formatSapTs('', 'utc')).toBe('—')
    expect(formatSapTs('2026010509', 'utc')).toBe('—')
  })
})

describe('formatSapTsShort', () => {
  it('omite los segundos', () => {
    expect(formatSapTsShort('20260105090703', 'utc')).toBe('05/01/2026 09:07')
  })

  it('aplica el offset del modo', () => {
    expect(formatSapTsShort('20260105090703', 'utc-4')).toBe('05/01/2026 05:07')
  })

  it('acepta timestamps de 12 caracteres pero no más cortos', () => {
    expect(formatSapTsShort('202601050907', 'utc')).toBe('05/01/2026 09:07')
    expect(formatSapTsShort('20260105090', 'utc')).toBe('—')
  })
})

describe('dayLabel', () => {
  it('devuelve DD/MM', () => {
    expect(dayLabel('20260105090703', 'utc')).toBe('05/01')
  })

  it('refleja el cambio de día por el offset', () => {
    expect(dayLabel('20260105020000', 'utc-4')).toBe('04/01')
  })

  it('devuelve el signo de pregunta con entrada inválida', () => {
    expect(dayLabel(null, 'utc')).toBe('?')
    expect(dayLabel('2026', 'utc')).toBe('?')
  })
})

describe('formatEpochMs', () => {
  const EPOCH = Date.UTC(2026, 0, 5, 9, 7, 3)

  it('formatea epoch en milisegundos', () => {
    expect(formatEpochMs(EPOCH, 'utc')).toBe('05/01/2026 09:07:03')
  })

  it('acepta el epoch como string', () => {
    expect(formatEpochMs(String(EPOCH), 'utc')).toBe('05/01/2026 09:07:03')
  })

  it('aplica el offset del modo', () => {
    expect(formatEpochMs(EPOCH, 'utc-4')).toBe('05/01/2026 05:07:03')
  })

  it('devuelve el guion largo con valores falsy o no numéricos', () => {
    expect(formatEpochMs(null, 'utc')).toBe('—')
    expect(formatEpochMs(0, 'utc')).toBe('—')
    expect(formatEpochMs('no-es-numero', 'utc')).toBe('—')
  })
})

describe('dayLabelEpoch', () => {
  it('devuelve DD/MM del epoch', () => {
    expect(dayLabelEpoch(Date.UTC(2026, 0, 5, 9, 0, 0), 'utc')).toBe('05/01')
  })

  it('refleja el cambio de día por el offset', () => {
    expect(dayLabelEpoch(Date.UTC(2026, 0, 5, 2, 0, 0), 'utc-4')).toBe('04/01')
  })

  it('devuelve el signo de pregunta con entrada inválida', () => {
    expect(dayLabelEpoch(null, 'utc')).toBe('?')
    expect(dayLabelEpoch('no-es-numero', 'utc')).toBe('?')
  })
})

describe('inputs datetime-local', () => {
  it('toInputDate muestra la hora UTC en modo utc', () => {
    expect(toInputDate(new Date(Date.UTC(2026, 0, 5, 9, 7)), 'utc')).toBe('2026-01-05T09:07')
  })

  it('toInputDate desplaza la hora en modo utc-4', () => {
    expect(toInputDate(new Date(Date.UTC(2026, 0, 5, 9, 7)), 'utc-4')).toBe('2026-01-05T05:07')
  })

  it('inputDateToDate interpreta el valor en la zona elegida', () => {
    expect(inputDateToDate('2026-01-05T05:07', 'utc-4').toISOString())
      .toBe('2026-01-05T09:07:00.000Z')
  })

  it('inputDateToDate en modo utc no desplaza', () => {
    expect(inputDateToDate('2026-01-05T09:07', 'utc').toISOString())
      .toBe('2026-01-05T09:07:00.000Z')
  })

  it('devuelve null con valor vacío', () => {
    expect(inputDateToDate('', 'utc')).toBeNull()
    expect(inputDateToDate(null, 'utc')).toBeNull()
  })

  it.each(['utc', 'utc-4'])('hace round-trip en modo %s', (mode) => {
    const original = new Date(Date.UTC(2026, 6, 29, 18, 45))
    expect(inputDateToDate(toInputDate(original, mode), mode).getTime()).toBe(original.getTime())
  })

  it('usa el modo guardado cuando no se pasa argumento', () => {
    setTzMode('utc-4')
    expect(toInputDate(new Date(Date.UTC(2026, 0, 5, 9, 7)))).toBe('2026-01-05T05:07')
  })
})
