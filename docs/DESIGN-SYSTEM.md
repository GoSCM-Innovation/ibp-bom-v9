# Design system

Estilos compartidos de la SPA. Referencia para el issue [#3](https://github.com/GoSCM-Innovation/ibp-bom-v9/issues/3).

La app usa objetos `style={{ ... }}` inline, no CSS Modules ni utilidades tipo Tailwind. Esto no cambia: lo que se consolidó son los **valores** y los **patrones repetidos**, no la forma de aplicarlos. Convertir 735 objetos inline a clases es un cambio de otra escala, con un diff enorme sobre componentes que no tienen cobertura de tests.

## Dónde vive cada cosa

| Módulo | Qué contiene |
|---|---|
| [src/index.css](../src/index.css) | La paleta, las variables de layout y las reglas responsive. Fuente de verdad de los colores. |
| [src/styles/tokens.js](../src/styles/tokens.js) | Nombres de la paleta para JS (`color`, `hex`, `alpha`), las escalas (`space`, `fontSize`, `radius`, `fontWeight`) y `withAlpha()`. |
| [src/styles/forms.js](../src/styles/forms.js) | `inputStyle`, `selectStyle`, `labelStyle` y sus variantes de barra de herramientas. |
| [src/styles/buttons.js](../src/styles/buttons.js) | `primaryBtn`, `secondaryBtn`, `toolbarBtn`, `softBtn`, `iconBtn()`, `disabled`. |
| [src/constants/status.js](../src/constants/status.js) | Los estados que devuelve SAP CI-DS, con su color, etiqueta y tintes. |
| [src/constants/taskType.js](../src/constants/taskType.js) | Colores del badge PROCESS / TASK. |
| [src/constants/avatar.js](../src/constants/avatar.js) | Rueda de color de los avatares de conexión y punto de entorno. |
| [src/components/ui/Field.jsx](../src/components/ui/Field.jsx) | Label en mayúsculas sobre su control. |

## Colores

La paleta se define **una sola vez**, en `index.css`, y el triplete RGB es el valor primario:

```css
--accent-rgb: 247,168,0;
--accent:     rgb(var(--accent-rgb));
```

El triplete existe para poder componer versiones translúcidas sin repetir el literal. Once colores: los seis de marca (`accent`, `accent2`, `cyan`, `green`, `red`, `purple`) y cinco semánticos (`warning`, `info`, `violet`, `slate`, `running`).

`--running` (#22c55e) es el verde de **ejecución** y no es el mismo que `--green` (#34d399), que es el de **éxito**.

### Las tres formas de usar un color

Elegir mal falla, y hasta hace poco fallaba en silencio:

| Forma | Cuándo | Ejemplo |
|---|---|---|
| `color.accent` | El valor se usa tal cual en un estilo. Es `'var(--accent)'`. | `{ color: color.accent }` |
| `alpha.accent(.4)` | Hace falta el mismo color con transparencia. | `{ background: alpha.accent(.4) }` |
| `hex.accent` | Un helper recibe el color y le deriva tintes con `withAlpha()`, o el valor va a un atributo SVG (`fill` de recharts, `nodeColor` del minimapa). Un `var()` no sirve ahí. | `actionBtn(hex.green, false)` |

Regla práctica: **usar `color.*` salvo que algo tenga que operar sobre el color**. Si hay que descomponerlo o pasarlo a un atributo SVG, `hex.*`.

`withAlpha()` lanza `TypeError` si recibe cualquier cosa que no sea un hex de seis dígitos. Antes devolvía `NaN` y pintaba transparente sin avisar, que es el error fácil al elegir entre `color.*` y `hex.*`.

Lo que no se debe hacer, y que los tests bloquean:

```js
// no: duplica la paleta, y cambiar --accent ya no alcanza
{ background: 'rgba(247,168,0,.4)' }
{ color: '#f7a800' }
// no: concatenar el canal alfa al hex. Se rompe si el color es un var()
{ background: color + '22' }
```

### Colores que siguen sueltos

Quedan **12 usos de 10 colores** que no están en la paleta, y se dejaron a propósito: el degradado oscuro de la cabecera, el azul del panel de ayuda, los bordes oscuros de los handles del canvas y el naranja de "0 encontrados". Son valores únicos, no la paleta duplicada; darle un token a cada uno sería peor.

La rueda de avatares ([avatar.js](../src/constants/avatar.js)) también queda fuera del sistema, y es deliberado: es identidad, no tema. Si un cambio de marca recoloreara los avatares, el usuario perdería la asociación visual con sus conexiones.

## Escalas

Las tres salieron de la distribución real del código, quedándose con los pasos dominantes.

```js
space   0  1  2  4  6  8  10  12  14  16  20  24  28  32  40
font    9  10  11  12  14  16  |  20  24  32  40
radius  2  4  6  8  10  12  |  pill  circle
```

Dos cosas que no son un paso regular, y por qué:

- **`space.hair` (1px).** Es el padding vertical de los micro-badges, en doce sitios. Redondearlo a 0 los colapsa y a 2 los duplica: es un cambio cualitativo, no de rejilla.
- **Los cuatro pasos grandes de `fontSize`** (20, 24, 32, 40) no son texto sino glifos: los emoji de los estados vacíos y las cruces de cerrar. Una escala de texto que termina en 16 habría aplastado un emoji de 40px.

`radius.pill` es para lo que debe quedar completamente redondeado sin depender de su altura. Antes se escribía como un radio de 20.

## Estados

`constants/status.js` es la fuente de verdad de los códigos que devuelve SAP. Cada entrada trae `label` (texto completo), `chartLabel` (versión corta para la leyenda del donut), `color` (hex, porque termina en el `fill` de un `<Cell>`) y `bg`/`border` derivados de `color` con `withAlpha()`.

Se usa siempre `taskStatus(code)`, que nunca devuelve `undefined`: un código que SAP agregue mañana cae en `UNKNOWN` conservando su texto original.

**No confundir con los estados de nodo del canvas** (`pending`, `running`, `skipped`, … en [canvasUtils.js](../src/components/Orchestrations/canvasUtils.js), con su accesor `nodeStatusColor()`). Describen el avance de un nodo dentro de una corrida propia, no lo que reporta SAP para una task. Comparten paleta, no dominio.

## Formularios

Dos familias, y la distinción es real:

- **`inputStyle` / `selectStyle` / `labelStyle`** — campos dentro de un modal o panel de configuración. Fondo `--bg3`, elevado sobre la superficie `--bg2` del modal, ancho completo.
- **`filterInputStyle` / `filterSelectStyle`** — campos de las barras de herramientas, sobre el fondo de la vista. Más chicos, fondo `--bg2`, sin ancho fijo porque van en una fila flex.

Ninguno declara `fontFamily`: `index.css` ya aplica `var(--font)` a `input`, `select` y `textarea`.

Para el patrón label-sobre-control, usar `<Field label="...">`.

## Botones

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

## Las guardas

[tests/src/designTokens.test.js](../tests/src/designTokens.test.js) escanea `src/` y falla si:

- aparece un `rgba()` o un hex de la paleta escrito a mano,
- aparece un hex de ocho dígitos (el canal alfa va por `alpha.*()`),
- se usa `'#fff'` o `'#000'` en vez de `color.white` / `color.onAccent`,
- alguien redefine `inputStyle`/`selectStyle`/`labelStyle` por su cuenta,
- un `padding`, `margin`, `gap`, `fontSize` o `borderRadius` usa un valor fuera de escala,
- algo completamente redondeado usa un radio grande en vez de `radius.pill`.

Sin esto, la consolidación se deshace sola con el próximo componente. La única duplicación admitida de la paleta es `index.css` ↔ `tokens.hex`, y hay un test que falla si una deriva de la otra.

## Lo que falta

Los 11 handlers `onMouseEnter`/`onMouseLeave` que simulan `:hover` en JS (6 archivos) y la conversión de los estilos inline a clases se tratan aparte: son el mismo problema, y no se resuelven sin dejar de aplicar los estilos inline.
