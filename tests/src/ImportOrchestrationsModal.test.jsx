// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ImportOrchestrationsModal from '../../src/components/Orchestrations/ImportOrchestrationsModal.jsx'

afterEach(cleanup)

const orch = (name, over = {}) => ({ name, nodes: [], edges: [], ...over })

function setup({ parsed = {}, existing = [], currentConnection = { orgName: 'org' } } = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ImportOrchestrationsModal
      parsed={{ orchestrations: [], ...parsed }}
      existing={existing}
      fileName="export.json"
      currentConnection={currentConnection}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

// El contador va interpolado, asi que el texto queda partido en varios nodos:
// se consulta por nombre accesible y por textContent, no con getByText.
const importBtn = () => screen.getByRole('button', { name: /^Importar/ })
const replaceCheckbox = () => screen.getByRole('checkbox')
const replaceLabel = () => replaceCheckbox().parentElement.textContent

describe('ImportOrchestrationsModal · clasificacion', () => {
  it('marca como nuevas las que no existen', () => {
    setup({ parsed: { orchestrations: [orch('Nueva A'), orch('Nueva B')] } })
    expect(screen.getAllByText('NUEVA')).toHaveLength(2)
    expect(screen.getByText('2 nuevas')).toBeTruthy()
  })

  it('detecta duplicadas por nombre', () => {
    setup({
      parsed: { orchestrations: [orch('Existente'), orch('Nueva')] },
      existing: [{ id: 'o1', name: 'Existente' }],
    })
    expect(screen.getByText('1 ya existen')).toBeTruthy()
    expect(screen.getByText('1 nuevas')).toBeTruthy()
  })

  it('compara nombres ignorando mayusculas y espacios', () => {
    setup({
      parsed: { orchestrations: [orch('  CARGA diaria  ')] },
      existing: [{ id: 'o1', name: 'carga DIARIA' }],
    })
    expect(screen.getByText('1 ya existen')).toBeTruthy()
  })

  it('cuenta nodos y conexiones con singular y plural', () => {
    setup({
      parsed: {
        orchestrations: [
          orch('Una', { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] }),
          orch('Varias', { nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] }),
        ],
      },
    })
    expect(screen.getByText('1 nodo · 1 conexion')).toBeTruthy()
    expect(screen.getByText('2 nodos · 0 conexiones')).toBeTruthy()
  })

  it('tolera nodes y edges ausentes', () => {
    setup({ parsed: { orchestrations: [{ name: 'Sin grafo' }] } })
    expect(screen.getByText('0 nodos · 0 conexiones')).toBeTruthy()
  })

  it('marca sin nombre las entradas sin name', () => {
    setup({ parsed: { orchestrations: [orch('')] } })
    expect(screen.getByText('(sin nombre)')).toBeTruthy()
  })
})

describe('ImportOrchestrationsModal · estrategia de duplicadas', () => {
  const withDup = {
    parsed: { orchestrations: [orch('Existente'), orch('Nueva')] },
    existing: [{ id: 'o1', name: 'Existente' }],
  }

  it('por defecto omite las duplicadas', () => {
    setup(withDup)
    expect(replaceCheckbox().checked).toBe(false)
    expect(screen.getByText('OMITIR')).toBeTruthy()
    expect(importBtn().textContent).toContain('1')
  })

  it('al marcar el check pasa a reemplazarlas', () => {
    setup(withDup)
    fireEvent.click(replaceCheckbox())
    expect(screen.getByText('REEMPLAZAR')).toBeTruthy()
    expect(importBtn().textContent).toContain('2')
  })

  it('no ofrece la opcion cuando no hay duplicadas', () => {
    setup({ parsed: { orchestrations: [orch('Nueva')] } })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('concuerda el texto en singular y plural', () => {
    setup(withDup)
    // El articulo va fijo en "las"; solo concuerdan el sustantivo y el adjetivo.
    expect(replaceLabel()).toContain('1 orquestacion ya existente con')
    cleanup()
    setup({
      parsed: { orchestrations: [orch('A'), orch('B')] },
      existing: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }],
    })
    expect(replaceLabel()).toContain('2 orquestaciones ya existentes con')
  })
})

describe('ImportOrchestrationsModal · confirmacion', () => {
  it('confirma con la estrategia elegida', () => {
    const { onConfirm } = setup({ parsed: { orchestrations: [orch('Nueva')] } })
    fireEvent.click(importBtn())
    expect(onConfirm).toHaveBeenCalledWith({ replaceDuplicates: false })
  })

  it('confirma con reemplazo cuando esta marcado', () => {
    const { onConfirm } = setup({
      parsed: { orchestrations: [orch('Existente')] },
      existing: [{ id: 'o1', name: 'Existente' }],
    })
    fireEvent.click(replaceCheckbox())
    fireEvent.click(importBtn())
    expect(onConfirm).toHaveBeenCalledWith({ replaceDuplicates: true })
  })

  it('deshabilita importar cuando no hay nada que traer', () => {
    const { onConfirm } = setup({
      parsed: { orchestrations: [orch('Existente')] },
      existing: [{ id: 'o1', name: 'Existente' }],
    })
    expect(importBtn().disabled).toBe(true)
    fireEvent.click(importBtn())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancela sin confirmar', () => {
    const { onCancel, onConfirm } = setup({ parsed: { orchestrations: [orch('Nueva')] } })
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cierra al hacer click en el fondo', () => {
    const { onCancel } = setup({ parsed: { orchestrations: [orch('Nueva')] } })
    fireEvent.click(importBtn().closest('[style*="position: fixed"]'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ImportOrchestrationsModal · archivo vacio o invalido', () => {
  it('avisa cuando el archivo no trae orquestaciones validas', () => {
    setup({ parsed: { orchestrations: [] } })
    expect(screen.getByText(/no contiene orquestaciones válidas/)).toBeTruthy()
    expect(importBtn().disabled).toBe(true)
  })

  it('lista las entradas invalidas con su motivo', () => {
    setup({
      parsed: {
        orchestrations: [orch('Nueva')],
        invalid: [{ index: 0, reason: 'sin nombre' }, { index: 3, reason: 'nodes no es array' }],
      },
    })
    expect(screen.getByText('2 inválidas')).toBeTruthy()
    expect(screen.getByText('#1: sin nombre')).toBeTruthy()
    expect(screen.getByText('#4: nodes no es array')).toBeTruthy()
  })

  it('trunca el listado de invalidas a cinco', () => {
    setup({
      parsed: {
        orchestrations: [orch('Nueva')],
        invalid: Array.from({ length: 8 }, (_, i) => ({ index: i, reason: `motivo ${i}` })),
      },
    })
    expect(screen.getByText('#5: motivo 4')).toBeTruthy()
    expect(screen.queryByText('#6: motivo 5')).toBeNull()
    expect(screen.getByText(/y 3 más/)).toBeTruthy()
  })
})

describe('ImportOrchestrationsModal · aviso de tenant distinto', () => {
  const parsed = {
    orchestrations: [orch('Nueva')],
    sourceConnection: { name: 'Origen', orgName: 'otraOrg' },
  }

  it('avisa cuando el origen es de otra organizacion', () => {
    setup({ parsed, currentConnection: { orgName: 'org' } })
    expect(screen.getByText('Tenant SAP distinto')).toBeTruthy()
  })

  it('no avisa cuando coinciden ignorando mayusculas', () => {
    setup({
      parsed: { ...parsed, sourceConnection: { orgName: '  ORG  ' } },
      currentConnection: { orgName: 'org' },
    })
    expect(screen.queryByText('Tenant SAP distinto')).toBeNull()
  })

  it('no avisa cuando falta el dato de origen o de destino', () => {
    setup({ parsed: { orchestrations: [orch('Nueva')] }, currentConnection: { orgName: 'org' } })
    expect(screen.queryByText('Tenant SAP distinto')).toBeNull()
    cleanup()
    setup({ parsed, currentConnection: {} })
    expect(screen.queryByText('Tenant SAP distinto')).toBeNull()
  })

  it('muestra el nombre del archivo y de la conexion de origen', () => {
    setup({ parsed, currentConnection: { orgName: 'org' } })
    expect(screen.getByText(/export.json/)).toBeTruthy()
    expect(screen.getByText(/origen: Origen/)).toBeTruthy()
  })
})
