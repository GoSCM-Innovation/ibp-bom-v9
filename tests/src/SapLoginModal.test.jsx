// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import SapLoginModal from '../../src/components/Connections/SapLoginModal.jsx'

const SANDBOX = {
  id: 'c1', name: 'Mi conexion', hciUrl: 'https://host/webservices',
  orgName: 'org', isProduction: false, user: '',
}
const PROD = { ...SANDBOX, isProduction: true }

function setup(connection = SANDBOX) {
  const onSuccess = vi.fn()
  const onCancel = vi.fn()
  render(<SapLoginModal connection={connection} onSuccess={onSuccess} onCancel={onCancel} />)
  return { onSuccess, onCancel }
}

const field = label => screen.getByText(label).parentElement.querySelector('input')
const type = (label, value) => fireEvent.change(field(label), { target: { value } })
const login = () => fireEvent.click(screen.getByText('Conectar'))

const credentials = () => {
  type('Usuario', 'usuario')
  type('Contraseña', 'secreto')
}

// Responde con un sessionId distinto segun el flag isProduction del body.
function mockLogin({ prodOk = true, sandboxOk = true } = {}) {
  const fetchMock = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body)
    const ok = body.isProduction ? prodOk : sandboxOk
    return {
      ok,
      json: async () => ok
        ? { sessionId: body.isProduction ? 'SID-PROD' : 'SID-SANDBOX' }
        : { error: body.isProduction ? 'prod rechazado' : 'Credenciales invalidas' },
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => { sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('SapLoginModal · render', () => {
  it('muestra el nombre y el tipo de repositorio', () => {
    setup()
    expect(screen.getByText(/Mi conexion/)).toBeTruthy()
    expect(screen.getByText(/Sandbox/)).toBeTruthy()
  })

  it('marca la conexion productiva', () => {
    setup(PROD)
    expect(screen.getByText(/Productivo/)).toBeTruthy()
  })

  it('prerellena el usuario de la conexion', () => {
    setup({ ...SANDBOX, user: 'usuarioGuardado' })
    expect(field('Usuario').value).toBe('usuarioGuardado')
    expect(field('Contraseña').value).toBe('')
  })

  it('la contraseña va enmascarada', () => {
    setup()
    expect(field('Contraseña').type).toBe('password')
  })
})

describe('SapLoginModal · validacion', () => {
  it('exige usuario y contraseña', () => {
    const fetchMock = mockLogin()
    setup()
    login()
    expect(screen.getByText(/Usuario y contraseña son requeridos/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exige la contraseña aunque haya usuario', () => {
    const fetchMock = mockLogin()
    setup()
    type('Usuario', 'usuario')
    login()
    expect(screen.getByText(/Usuario y contraseña son requeridos/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('SapLoginModal · login', () => {
  it('envia las credenciales y los datos de la conexion', async () => {
    const fetchMock = mockLogin()
    const { onSuccess } = setup(PROD)
    credentials()
    login()

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sap-login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      hciUrl: 'https://host/webservices', orgName: 'org',
      isProduction: true, user: 'usuario', password: 'secreto',
    })
  })

  it('devuelve el sessionId por onSuccess', async () => {
    mockLogin()
    const { onSuccess } = setup(PROD)
    credentials()
    login()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('SID-PROD'))
  })

  it('entra con la tecla Enter', async () => {
    mockLogin()
    const { onSuccess } = setup(PROD)
    credentials()
    fireEvent.keyDown(field('Contraseña'), { key: 'Enter' })
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('muestra el error que devuelve el backend', async () => {
    mockLogin({ sandboxOk: false })
    const { onSuccess } = setup()
    credentials()
    login()
    await waitFor(() => expect(screen.getByText(/Credenciales invalidas/)).toBeTruthy())
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('deshabilita el boton mientras conecta y lo rehabilita al fallar', async () => {
    mockLogin({ sandboxOk: false })
    setup()
    credentials()
    login()
    expect(screen.getByText('Conectando...').disabled).toBe(true)
    await waitFor(() => expect(screen.getByText('Conectar').disabled).toBe(false))
  })
})

describe('SapLoginModal · sesion productiva paralela en sandbox', () => {
  // En sandbox se abre ademas una sesion contra el repo productivo para poder
  // marcar que tasks estan promovidas. Es best effort: no debe bloquear el login.
  it('abre las dos sesiones y guarda la productiva', async () => {
    const fetchMock = mockLogin()
    const { onSuccess } = setup()
    credentials()
    login()

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('SID-SANDBOX'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem('sap_prod_c1')).toBe('SID-PROD')
  })

  it('sigue adelante si la sesion productiva falla', async () => {
    mockLogin({ prodOk: false })
    const { onSuccess } = setup()
    credentials()
    login()

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('SID-SANDBOX'))
    expect(screen.queryByText(/prod rechazado/)).toBeNull()
  })

  it('limpia la clave previa cuando la sesion productiva falla', async () => {
    sessionStorage.setItem('sap_prod_c1', 'SID-VIEJO')
    mockLogin({ prodOk: false })
    const { onSuccess } = setup()
    credentials()
    login()

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(sessionStorage.getItem('sap_prod_c1')).toBeNull()
  })

  it('en conexion productiva no abre sesion extra', async () => {
    const fetchMock = mockLogin()
    const { onSuccess } = setup(PROD)
    credentials()
    login()

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('sap_prod_c1')).toBeNull()
  })
})

describe('SapLoginModal · cancelar', () => {
  it('llama a onCancel sin pedir credenciales', () => {
    const fetchMock = mockLogin()
    const { onCancel } = setup()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
