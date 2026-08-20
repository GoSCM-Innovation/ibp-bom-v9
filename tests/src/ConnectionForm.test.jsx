// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ConnectionForm from '../../src/components/Connections/ConnectionForm.jsx'

afterEach(cleanup)

function setup(initial = undefined) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<ConnectionForm initial={initial} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel }
}

const field = label => screen.getByText(label).parentElement.querySelector('input')
const type = (label, value) => fireEvent.change(field(label), { target: { value } })
const save = () => fireEvent.click(screen.getByText(/Crear conexiones|Guardar cambios/))

const fillRequired = () => {
  type('Nombre conexión', 'Mi conexion')
  type('Organización (orgName)', 'miOrg')
  type('URL del servicio SOAP', 'https://us.cids.cloud.sap/webservices')
}

describe('ConnectionForm · modo creacion', () => {
  it('arranca con los campos vacios', () => {
    setup()
    expect(field('Nombre conexión').value).toBe('')
    expect(field('URL del servicio SOAP').value).toBe('')
  })

  it('titula como nueva conexion', () => {
    setup()
    expect(screen.getByText('Nueva conexión')).toBeTruthy()
    expect(screen.getByText('Crear conexiones')).toBeTruthy()
  })

  it('avisa que se crearan dos conexiones', () => {
    setup()
    expect(screen.getByText(/Se crearán dos conexiones/)).toBeTruthy()
  })

  it('no incluye id ni isProduction en el payload', () => {
    const { onSave } = setup()
    fillRequired()
    save()
    const payload = onSave.mock.calls[0][0]
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('isProduction')
  })
})

describe('ConnectionForm · validacion', () => {
  it('exige el nombre primero', () => {
    const { onSave } = setup()
    save()
    expect(screen.getByText(/El nombre es obligatorio/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('exige la URL una vez que hay nombre', () => {
    const { onSave } = setup()
    type('Nombre conexión', 'Mi conexion')
    save()
    expect(screen.getByText(/La URL del servicio es obligatoria/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('exige la organizacion al final', () => {
    const { onSave } = setup()
    type('Nombre conexión', 'Mi conexion')
    type('URL del servicio SOAP', 'https://us.cids.cloud.sap/webservices')
    save()
    expect(screen.getByText(/El nombre de organización es obligatorio/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('limpia el error cuando el formulario se completa', () => {
    const { onSave } = setup()
    save()
    expect(screen.getByText(/El nombre es obligatorio/)).toBeTruthy()
    fillRequired()
    save()
    expect(screen.queryByText(/es obligatori/)).toBeNull()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('no exige usuario ni logo', () => {
    const { onSave } = setup()
    fillRequired()
    save()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ user: '', logoUrl: '' })
  })
})

describe('ConnectionForm · normalizacion de la URL', () => {
  it('quita la barra final', () => {
    const { onSave } = setup()
    type('Nombre conexión', 'C')
    type('Organización (orgName)', 'O')
    type('URL del servicio SOAP', 'https://us.cids.cloud.sap/webservices/')
    save()
    expect(onSave.mock.calls[0][0].hciUrl).toBe('https://us.cids.cloud.sap/webservices')
  })

  it('deja intacta una URL sin barra final', () => {
    const { onSave } = setup()
    fillRequired()
    save()
    expect(onSave.mock.calls[0][0].hciUrl).toBe('https://us.cids.cloud.sap/webservices')
  })

  it('quita solo la ultima barra', () => {
    const { onSave } = setup()
    type('Nombre conexión', 'C')
    type('Organización (orgName)', 'O')
    type('URL del servicio SOAP', 'https://host/DSoD/webservices//')
    save()
    expect(onSave.mock.calls[0][0].hciUrl).toBe('https://host/DSoD/webservices/')
  })
})

describe('ConnectionForm · modo edicion', () => {
  const INITIAL = {
    id: 'conn-1', name: 'Existente', hciUrl: 'https://host/webservices',
    orgName: 'org', user: 'usuario', logoUrl: 'https://logo', isProduction: false,
  }

  it('precarga los valores', () => {
    setup(INITIAL)
    expect(field('Nombre conexión').value).toBe('Existente')
    expect(field('Organización (orgName)').value).toBe('org')
    expect(screen.getByText('Editar conexión')).toBeTruthy()
  })

  it('conserva id e isProduction en el payload', () => {
    const { onSave } = setup(INITIAL)
    type('Nombre conexión', 'Renombrada')
    save()
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: 'conn-1', isProduction: false, name: 'Renombrada',
    })
  })

  it('asume produccion cuando isProduction no esta definido', () => {
    const { onSave } = setup({ ...INITIAL, isProduction: undefined })
    save()
    expect(onSave.mock.calls[0][0].isProduction).toBe(true)
  })

  it('muestra el repositorio como texto, no editable', () => {
    setup(INITIAL)
    expect(screen.getByText('Sandbox')).toBeTruthy()
    cleanup()
    setup({ ...INITIAL, isProduction: true })
    expect(screen.getByText('Producción')).toBeTruthy()
  })
})

describe('ConnectionForm · cancelar', () => {
  it('llama a onCancel sin validar', () => {
    const { onCancel, onSave } = setup()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
