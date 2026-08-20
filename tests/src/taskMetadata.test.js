import { describe, it, expect } from 'vitest'
import { extractTaskMetadata } from '../../src/utils/taskMetadata.js'

const prop = (name, value) => ({ name, value })

describe('extractTaskMetadata', () => {
  it('extrae origen y destino por la clave preferida', () => {
    const props = [
      prop('SourceDataStoreName', 'ECC'),
      prop('TargetDataStoreName', 'DS_IBP'),
    ]
    expect(extractTaskMetadata(props)).toMatchObject({ sourceSystem: 'ECC', targetSystem: 'DS_IBP' })
  })

  it('respeta el orden de prioridad entre claves candidatas', () => {
    const props = [
      prop('source', 'ultima'),
      prop('SourceSystem', 'segunda'),
      prop('SourceDataStoreName', 'primera'),
    ]
    expect(extractTaskMetadata(props).sourceSystem).toBe('primera')
  })

  it.each([
    'SourceDataStoreName', 'SourceSystem', 'SrcDataStoreName',
    'srcSystem', 'src_ds', 'sourceDS', 'source',
  ])('reconoce la clave de origen %s', (key) => {
    expect(extractTaskMetadata([prop(key, 'ECC')]).sourceSystem).toBe('ECC')
  })

  it.each([
    'TargetDataStoreName', 'TargetSystem', 'TgtDataStoreName',
    'tgtSystem', 'tgt_ds', 'targetDS', 'target',
  ])('reconoce la clave de destino %s', (key) => {
    expect(extractTaskMetadata([prop(key, 'DS_IBP')]).targetSystem).toBe('DS_IBP')
  })

  it('cae a la comparación sin distinguir mayúsculas', () => {
    expect(extractTaskMetadata([prop('SOURCEDATASTORENAME', 'ECC')]).sourceSystem).toBe('ECC')
    expect(extractTaskMetadata([prop('targetdatastorename', 'DS_IBP')]).targetSystem).toBe('DS_IBP')
  })

  it('prefiere la coincidencia exacta sobre la insensible a mayúsculas', () => {
    const props = [prop('SOURCESYSTEM', 'insensible'), prop('SourceDataStoreName', 'exacta')]
    expect(extractTaskMetadata(props).sourceSystem).toBe('exacta')
  })

  it('salta las propiedades con valor vacío', () => {
    const props = [prop('SourceDataStoreName', ''), prop('SourceSystem', 'ECC')]
    expect(extractTaskMetadata(props).sourceSystem).toBe('ECC')
  })

  it('devuelve null cuando ninguna clave coincide', () => {
    expect(extractTaskMetadata([prop('OtraCosa', 'x')]))
      .toMatchObject({ sourceSystem: null, targetSystem: null })
  })

  it('tolera entradas nulas dentro del array', () => {
    expect(() => extractTaskMetadata([null, undefined, prop('source', 'ECC')])).not.toThrow()
    expect(extractTaskMetadata([null, prop('source', 'ECC')]).sourceSystem).toBe('ECC')
  })

  it('tolera propiedades sin name', () => {
    expect(extractTaskMetadata([{ value: 'x' }, prop('source', 'ECC')]).sourceSystem).toBe('ECC')
  })

  it('devuelve raw vacío y nulls cuando la entrada no es un array', () => {
    for (const input of [null, undefined, 'texto', {}]) {
      expect(extractTaskMetadata(input)).toEqual({ sourceSystem: null, targetSystem: null, raw: [] })
    }
  })

  it('devuelve las propiedades originales en raw', () => {
    const props = [prop('source', 'ECC')]
    expect(extractTaskMetadata(props).raw).toBe(props)
  })
})
