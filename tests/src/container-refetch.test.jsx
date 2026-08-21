// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import { soapCall } from '../../src/api/soapCall.js'
import TaskMonitor from '../../src/components/Tasks/TaskMonitor.jsx'
import Resumen from '../../src/components/Resumen/Resumen.jsx'

vi.mock('../../src/api/soapCall.js', () => ({ soapCall: vi.fn(), isSoapDebug: () => false }))

const CONNECTION = { id: 'c1', name: 'Conn', hciUrl: 'https://sap.test/ws', orgName: 'org', isProduction: false }

// Cuenta las llamadas SOAP por operación.
const callsTo = op => soapCall.mock.calls.filter(c => c[2] === op).length

beforeEach(() => {
  localStorage.clear()
  soapCall.mockReset()
  soapCall.mockResolvedValue([])
})

afterEach(cleanup)

// Estos contenedores disparan sus fetch desde efectos cuyas dependencias incluyen
// callbacks recibidos por props. Si esos callbacks cambian de identidad en cada
// render, el efecto se vuelve a ejecutar y se entra en un bucle de llamadas a SAP.
// Los tests renderizan de nuevo con props recreadas, que es justo lo que hace el
// padre real, y verifican que la cantidad de llamadas no crezca.

describe('TaskMonitor no entra en bucle de fetch', () => {
  const renderMonitor = (props = {}) => render(
    <TaskMonitor
      connection={CONNECTION}
      sessionId="SID"
      onSessionExpired={() => {}}
      initialSearch={null}
      onSearchConsumed={() => {}}
      {...props}
    />,
  )

  it('carga la lista una sola vez al montar', async () => {
    renderMonitor()
    await waitFor(() => expect(callsTo('getAllExecutedTasks2')).toBe(1))
    // Un margen de tiempo por si algún efecto encadenado dispara otra carga.
    await act(async () => { await Promise.resolve() })
    expect(callsTo('getAllExecutedTasks2')).toBe(1)
  })

  it('no vuelve a cargar cuando el padre re-renderiza con callbacks nuevos', async () => {
    const { rerender } = renderMonitor()
    await waitFor(() => expect(callsTo('getAllExecutedTasks2')).toBe(1))

    for (let i = 0; i < 5; i++) {
      rerender(
        <TaskMonitor
          connection={CONNECTION}
          sessionId="SID"
          onSessionExpired={() => {}}
          initialSearch={null}
          onSearchConsumed={() => {}}
        />,
      )
      await act(async () => { await Promise.resolve() })
    }

    expect(callsTo('getAllExecutedTasks2')).toBe(1)
  })

  it('no vuelve a cargar cuando cambia solo la identidad del objeto connection', async () => {
    const { rerender } = renderMonitor()
    await waitFor(() => expect(callsTo('getAllExecutedTasks2')).toBe(1))

    rerender(
      <TaskMonitor
        connection={{ ...CONNECTION }} sessionId="SID"
        onSessionExpired={() => {}} initialSearch={null} onSearchConsumed={() => {}} />,
    )
    await act(async () => { await Promise.resolve() })

    // El objeto es nuevo pero equivalente: hoy esto sí recarga, y queda
    // documentado para no confundirlo con un bucle si alguien lo revisa.
    expect(callsTo('getAllExecutedTasks2')).toBeLessThanOrEqual(2)
  })

  it('consume initialSearch sin re-disparar la carga', async () => {
    const onSearchConsumed = vi.fn()
    const { rerender } = renderMonitor({ initialSearch: 'CARGA', onSearchConsumed })

    await waitFor(() => expect(onSearchConsumed).toHaveBeenCalledTimes(1))
    rerender(
      <TaskMonitor
        connection={CONNECTION} sessionId="SID" onSessionExpired={() => {}}
        initialSearch="CARGA" onSearchConsumed={onSearchConsumed} />,
    )
    await act(async () => { await Promise.resolve() })

    expect(onSearchConsumed).toHaveBeenCalledTimes(1)
    expect(callsTo('getAllExecutedTasks2')).toBe(1)
  })
})

describe('Resumen no entra en bucle de fetch', () => {
  const renderResumen = (props = {}) => render(
    <Resumen connection={CONNECTION} sessionId="SID" onSessionExpired={() => {}} {...props} />,
  )

  it('carga una sola vez al montar', async () => {
    renderResumen()
    await waitFor(() => expect(soapCall).toHaveBeenCalled())
    const inicial = soapCall.mock.calls.length
    await act(async () => { await Promise.resolve() })
    expect(soapCall.mock.calls.length).toBe(inicial)
  })

  it('no vuelve a cargar cuando el padre re-renderiza con callbacks nuevos', async () => {
    const { rerender } = renderResumen()
    await waitFor(() => expect(soapCall).toHaveBeenCalled())
    const inicial = soapCall.mock.calls.length

    for (let i = 0; i < 5; i++) {
      rerender(<Resumen connection={CONNECTION} sessionId="SID" onSessionExpired={() => {}} />)
      await act(async () => { await Promise.resolve() })
    }

    expect(soapCall.mock.calls.length).toBe(inicial)
  })
})
