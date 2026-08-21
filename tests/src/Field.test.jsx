// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Field from '../../src/components/ui/Field.jsx'
import { inputStyle, selectStyle, labelStyle, filterInputStyle, filterSelectStyle } from '../../src/styles/forms.js'

afterEach(cleanup)

describe('Field', () => {
  it('renderiza el label asociado por encima del control', () => {
    render(<Field label="Agente"><select data-testid="c" /></Field>)
    expect(screen.getByText('Agente').tagName).toBe('LABEL')
    expect(screen.getByTestId('c')).toBeTruthy()
  })

  it('separa con 12px por defecto y respeta el gap explicito', () => {
    const { container } = render(<Field label="A"><i /></Field>)
    expect(container.firstChild.style.marginBottom).toBe('12px')
    cleanup()
    const { container: c2 } = render(<Field label="A" gap={14}><i /></Field>)
    expect(c2.firstChild.style.marginBottom).toBe('14px')
  })
})

describe('estilos de formulario', () => {
  it('select es input mas el cursor, en las dos familias', () => {
    expect(selectStyle).toEqual({ ...inputStyle, cursor: 'pointer' })
    expect(filterSelectStyle).toEqual({ ...filterInputStyle, cursor: 'pointer' })
  })

  it('las dos familias se distinguen por fondo, tamano y ancho', () => {
    // control: dentro de un modal, elevado sobre la superficie y a ancho completo
    expect(inputStyle.background).toBe('var(--bg3)')
    expect(inputStyle.width).toBe('100%')
    // filter: en la barra de herramientas sobre el fondo de la vista, sin ancho fijo
    expect(filterInputStyle.background).toBe('var(--bg2)')
    expect(filterInputStyle.width).toBeUndefined()
    expect(filterInputStyle.fontSize).toBeLessThan(inputStyle.fontSize)
  })

  it('no declara fontFamily: index.css ya lo aplica a input/select/textarea', () => {
    for (const s of [inputStyle, selectStyle, filterInputStyle, filterSelectStyle]) {
      expect(s.fontFamily).toBeUndefined()
    }
  })

  it('el label es el mismo en toda la app', () => {
    expect(labelStyle.textTransform).toBe('uppercase')
    expect(labelStyle.display).toBe('block')
  })
})
