# Design system

Estilos compartidos de la SPA. Referencia para el issue [#3](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/3).

La app usa objetos `style={{ ... }}` inline, no CSS Modules ni utilidades tipo Tailwind. Esto no cambia: lo que se consolidó son los **valores** y los **patrones repetidos**, no la forma de aplicarlos. Convertir 735 objetos inline a clases es un cambio de otra escala, con un diff enorme sobre componentes que no tienen cobertura de tests.

## Dónde vive cada cosa

| Módulo | Qué contiene |
|---|---|
| [src/index.css](../src/index.css) | La paleta, las variables de layout y las reglas responsive. Fuente de verdad de los colores. |
| [src/styles/tokens.js](../src/styles/tokens.js) | Nombres de la paleta para JS (`color`, `hex`, `alpha`), escalas (`fontSize`, `radius`, `fontWeight`) y `withAlpha()`. |
| [src/styles/forms.js](../src/styles/forms.js) | `inputStyle`, `selectStyle`, `labelStyle` y sus variantes de barra de herramientas. |
| [src/styles/buttons.js](../src/styles/buttons.js) | `primaryBtn`, `secondaryBtn`, `toolbarBtn`, `softBtn`, `iconBtn()`, `disabled`. |
| [src/constants/status.js](../src/constants/status.js) | Los estados que devuelve SAP CI-DS, con su color, etiqueta y tintes. |
| [src/components/ui/Field.jsx](../src/components/ui/Field.jsx) | Label en mayúsculas sobre su control. |

## Colores

La paleta se define **una sola vez**, en `index.css`, y el triplete RGB es el valor primario:

```css
--accent-rgb: 247,168,0;
--accent:     rgb(var(--accent-rgb));
```

El triplete existe para poder componer versiones translúcidas sin repetir el literal. Desde JS hay tres formas de usar un color, y elegir mal falla en silencio:

| Forma | Cuándo | Ejemplo |
|---|---|---|
| `color.accent` | El valor se usa tal cual en un estilo. Es `'var(--accent)'`. | `{ color: color.accent }` |
| `alpha.accent(.4)` | Hace falta el mismo color con transparencia. | `{ background: alpha.accent(.4) }` |
| `hex.accent` | Un helper recibe el color y le deriva tintes con `withAlpha()`, o el valor va a un atributo SVG. Un `var()` no sirve acá. | `actionBtn(hex.green, false)` |

Regla práctica: **usar `color.*` salvo que algo tenga que operar sobre el color**. Si hay que descomponerlo o pasarlo a un atributo SVG, `hex.*`.

Lo que no se debe hacer, y que los tests bloquean:

```js
// no: duplica la paleta, y cambiar --accent ya no alcanza
{ background: 'rgba(247,168,0,.4)' }
{ color: '#f7a800' }
// no: concatenar el canal alfa al hex. Se rompe en silencio si el color es un var()
{ background: color + '22' }
```

`tests/src/designTokens.test.js` escanea `src/` y falla si aparece un color de la paleta escrito a mano. La única duplicación admitida es `index.css` ↔ `tokens.hex`, y hay un test que verifica que las dos coincidan.

### Colores que no son de la paleta

Quedan unos 38 usos de tonos que no están en la paleta (ámbar, azul, violeta, cian), sobre todo los colores de estado usados de forma decorativa fuera de `constants/status.js`. No se tocaron: decidir si entran a la paleta o se derivan del estado es parte de lo que queda abierto en #3.

`#fff` y `#000` también siguen sueltos (35 usos). Tienen token (`color.white`, `color.onAccent`) pero se usan con dos sentidos distintos —jerarquía tipográfica y contraste sobre el acento— y unificarlos requiere decidir cuál es cuál en cada sitio.

## Estados

`constants/status.js` es la fuente de verdad de los códigos que devuelve SAP. Cada entrada trae:

- `label` — texto completo, para badges y filtros.
- `chartLabel` — versión corta, para la leyenda del donut.
- `color` — hex, porque termina en el `fill` de un `<Cell>` de recharts.
- `bg` / `border` — derivados de `color` con `withAlpha()`, nunca escritos a mano.

Se usa siempre `taskStatus(code)`, que nunca devuelve `undefined`: un código que SAP agregue mañana cae en `UNKNOWN` conservando su texto original.

**No confundir con los estados de nodo del canvas** (`pending`, `running`, `skipped`, … en [canvasUtils.js](../src/components/Orchestrations/canvasUtils.js)). Describen el avance de un nodo dentro de una corrida propia, no lo que reporta SAP para una task. Comparten paleta, no dominio, y por eso son dos mapas.

## Formularios

Dos familias, y la distinción es real:

- **`inputStyle` / `selectStyle` / `labelStyle`** — campos dentro de un modal o panel de configuración. Fondo `--bg3`, elevado sobre la superficie `--bg2` del modal, ancho completo.
- **`filterInputStyle` / `filterSelectStyle`** — campos de las barras de herramientas, sobre el fondo de la vista. Más chicos, fondo `--bg2`, sin ancho fijo porque van en una fila flex.

Ninguno declara `fontFamily`: `index.css` ya aplica `var(--font)` a `input`, `select` y `textarea`.

Para el patrón label-sobre-control, usar `<Field label="...">`.

## Botones

Cuatro variantes, más un helper:

| Variante | Uso |
|---|---|
| `primaryBtn` | Acción principal de un modal o formulario. Fondo acento, texto negro. |
| `secondaryBtn` | Acción secundaria al lado de una primaria: cancelar, volver. |
| `toolbarBtn` | Barra de herramientas: refrescar, copiar, paginar. |
| `softBtn` | Dentro de un modal o panel, sobre la superficie elevada. |
| `iconBtn(size, tone)` | El botón es solo un glifo: cerrar, expandir, quitar. |

Se componen con spread cuando hace falta un ajuste puntual:

```jsx
<button style={{ ...toolbarBtn, color: 'var(--text3)' }}>Limpiar</button>
<button style={{ ...primaryBtn, ...(busy ? disabled : {}) }}>Guardar</button>
```

Quedan fuera los botones que son de verdad únicos: el FAB del wizard móvil, las pestañas y los toggles con estado activo.

## Escalas

`fontSize` y `radius` salieron de la distribución que el código ya tenía, quedándose con los pasos dominantes: adoptarlas no movió ningún píxel. **El espaciado no tiene escala todavía.** Los 27 valores distintos de `padding`/`margin` se concentran en 8 números (2, 4, 6, 8, 10, 12, 14, 16), así que definirla es viable, pero implica mover píxeles en los casos sueltos y eso queda abierto en #3.
