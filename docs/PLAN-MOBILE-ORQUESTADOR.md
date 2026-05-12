# Plan: Versión mobile-web del orquestador IBP-BOM-V9

> Documento de planificación para revisión. No implementa código todavía.
> Fecha: 2026-05-12. Versión app actual: 0.5.10.

---

## Índice

1. [Contexto y objetivo](#1-contexto-y-objetivo)
2. [Estrategia general responsive](#2-estrategia-general-responsive)
3. [Las 3 alternativas para el orquestador mobile](#3-las-3-alternativas-para-el-orquestador-mobile)
   - [Alternativa A: Outline jerárquico](#alternativa-a--outline-jerárquico-file-tree--outline)
   - [Alternativa B: Bloques anidables](#alternativa-b--bloques-anidables-estilo-notion--scratch)
   - [Alternativa C: Wizard / Stepper guiado](#alternativa-c--wizard--stepper-guiado)
4. [Comparativa rápida](#4-comparativa-rápida)
5. [Reutilización de código existente](#5-reutilización-de-código-existente)
6. [Archivos críticos a modificar / crear](#6-archivos-críticos-a-modificar--crear)
7. [Verificación](#7-verificación)
8. [Follow-up (fuera de scope)](#8-follow-up-fuera-de-scope)

---

## 1. Contexto y objetivo

La app actual (React 19 + Vite, inline styles, Vercel + Upstash Redis) tiene detección mobile básica (`useIsMobile` con 640px en `src/App.jsx:9-17`) y un sidebar drawer ya funcional, pero el resto de las vistas no está adaptado a pantallas pequeñas. El bloqueante principal es el orquestador: usa `@xyflow/react` con drag-and-drop, inviable en celular:

- el panning táctil compite con el scroll de la página,
- los edges son difíciles de seleccionar con el dedo,
- los drop targets para nodos son diminutos,
- el panel de configuración lateral consume todo el viewport.

### Objetivo

1. Definir la **estrategia general** de detección mobile/tablet/desktop (resumen ejecutable).
2. **Diseñar 3 alternativas mobile-friendly** para construir orquestaciones, sin drag-and-drop sobre canvas, manteniendo el mismo modelo `{ nodes[], edges[] }` para que el backend (`api/orchestrate.js`) ejecute sin cambios.
3. Listar el **resto de las vistas** como follow-up sin detalle.

Las 3 alternativas se presentan lado a lado para evaluar y decidir después; ninguna se descarta en este plan.

### Decisiones tomadas previamente

- **Presentación**: las 3 alternativas se documentan completas (sin elección anticipada).
- **Alcance**: foco profundo en el orquestador. Las otras vistas se mencionan como follow-up.
- **Breakpoints**: mobile / tablet / desktop (3 niveles).

---

## 2. Estrategia general responsive

### 2.1 Breakpoints (3 niveles)

Crear `src/hooks/useViewport.js` basado en `matchMedia` (no `resize`, es más eficiente):

| Nombre | Ancho |
|---|---|
| `isMobile` | `<= 640px` |
| `isTablet` | `641 - 1024px` |
| `isDesktop` | `> 1024px` |

API: `const { isMobile, isTablet, isDesktop, width } = useViewport()`.
Export retro-compatible: `useIsMobile` re-exportado desde el mismo módulo (hoy consumido en `src/App.jsx:33`).

En tablet, el sidebar queda fijo y angosto, y el orquestador puede seguir usando el canvas desktop con tap-zoom. La vista mobile del orquestador se activa solo en `isMobile`.

### 2.2 Variables CSS mobile

Añadir en `src/index.css` dentro de `:root`:

```
--pad-mobile: 12px;
--pad-desktop: 24px;
--tap-min: 44px;
--header-h-mobile: 56px;
--font-base-mobile: 14px;
```

Las media queries existentes (`@media (max-width: 640px)`) reasignan valores. Inline styles las consumen vía `var(--…)` o con branching JS cuando haga falta.

### 2.3 Shell mobile (cambios chicos, alto retorno)

- **Sidebar** (`src/components/Sidebar/Sidebar.jsx`): ya tiene drawer. Pendiente: cerrar al seleccionar item, `body { overflow: hidden }` mientras está abierto, swipe-to-close, ancho 280px en mobile.
- **Header** (`src/components/Header.jsx`): ocultar el título "Orquestador de integraciones" en mobile, dejar solo logo + hamburger.
- **Tabs SystemView** (`src/components/System/SystemView.jsx:104-112`): scroll horizontal con `scroll-snap-type: x mandatory` en mobile. NO bottom tab bar (choca con la UI del browser móvil) y NO dropdown (esconde el contexto activo).
- **Modales**: crear `src/components/ui/Sheet.jsx` que en desktop renderiza modal centrado y en mobile bottom-sheet 100vw/100vh con drag-handle. Migrar `SapLoginModal`, `RunModal`, `RunSingleModal`, `RunLogModal`, `ImportConnectionsModal`.

### 2.4 PWA-ready (opcional, costo bajo)

`vite-plugin-pwa` + `public/manifest.json` (name, theme color `#F7A800`, icons 192/512). NO cachear llamadas SAP (datos en vivo). Solo assets estáticos. Permite "Añadir a inicio" sin convertirse en app instalable. Beneficio bajo costo, recomendado dejarlo listo.

---

## 3. Las 3 alternativas para el orquestador mobile

Las tres mantienen el **mismo modelo de datos** `{ nodes[], edges[] }` que valida `api/orchestrations.js:87-106` y ejecuta `api/orchestrate.js` con Kahn topological sort. La detección de qué editor renderizar va en `src/components/Orchestrations/Orchestrations.jsx`:

```
if (isMobile) → uno de los tres editores mobile
else → canvas actual (React Flow)
```

---

### Alternativa A — Outline jerárquico (file-tree / outline)

#### Concepto

Lista vertical scrollable. Cada nodo es una fila con sangría por nivel de grupo. El orden vertical de hermanos equivale a orden serial por defecto; un toggle `∥` por fila lo convierte en paralelo con el hermano anterior. Las "olas" recomputadas se dibujan como separadores horizontales. Los edges se generan implícitamente; no se ven, viven solo en el modelo.

#### Wireframe (360px)

```
+----------------------------------------+
| < MiOrquestacion          [...][Run]   |
+----------------------------------------+
| Ola 1 ---------------------------------|
| > :: [ ] Cargar Ventas        i   ...  |
| > :: [ ] Cargar Stock     || i   ...   |
| Ola 2 ---------------------------------|
| v :: [G] Grupo Calculos (parallel) ... |
|    :: [ ] Forecast Demanda    i   ...  |
|    :: [ ] Forecast Supply  || i   ...  |
|    + Anadir task / grupo               |
| Ola 3 ---------------------------------|
| > :: [ ] Publicar Resultado   i   ...  |
+----------------------------------------+
| [+ Task]   [+ Grupo]      Guardar      |
+----------------------------------------+
```

Leyenda: `::` handle de reordenar, `[ ]` task, `[G]` grupo, `∥` paralelo con hermano anterior, `>/v` plegado/expandido.

#### Flujo de edición

- Tap `+ Task` abre bottom-sheet con `TaskPalette` mobile → tap inserta debajo del nodo seleccionado.
- `+ Grupo` crea contenedor vacío.
- Toggle `∥` en una fila alterna serial/paralelo con el hermano anterior.
- Tap en la fila abre `NodeConfigPanel`.
- Long-press en handle `::` reordena vertical (Pointer Events nativos, sin librerías).
- Swipe-left borra.

#### Jerarquía y orden

- **Jerarquía**: sangría visual + plegable de grupos con `>/v`.
- **Orden de ejecución**: implícito en el orden de la lista + flags `∥`. El backend ya soporta esto sin cambios.

#### Reutilización

Casi todo. Helper nuevo a añadir en `canvasUtils.js`:
- `computeWaves(nodes, edges)` (extraído de `autoLayout`)
- `linearGraphFromOrder(rows, parallelFlags)` que genera edges desde el orden visual.

#### Compromisos

No soporta DAGs arbitrarios con fan-in (ej. `A→C ∧ B→C` donde A y B no son paralelos). Para esos casos requiere envolver en un grupo paralelo. Si la orquestación importada del canvas tiene topología no-lineal, mostrarla en modo lectura o pedir confirmación para "linealizar".

#### Esfuerzo: **M**

Archivos nuevos:

- `src/components/Orchestrations/mobile/OutlineEditor.jsx`
- `src/components/Orchestrations/mobile/OutlineRow.jsx`
- `src/components/Orchestrations/mobile/MobileTaskPicker.jsx`
- `src/components/Orchestrations/mobile/useReorder.js`

#### Para quién

Power users que ya conocen orquestaciones desde desktop y necesitan editar densamente desde el celular.

---

### Alternativa B — Bloques anidables (estilo Notion / Scratch)

#### Concepto

Cada nodo es una card gruesa con su contenido visible (nombre, agente, retries, error strategy como chips). Los grupos son cards contenedoras con un slot interno. Hermanos seriales se apilan vertical con flecha `↓` entre ellos. Hermanos paralelos se renderizan **lado a lado en columnas** dentro del grupo padre (con scroll horizontal si hay más de 2). El toggle `groupMode` del grupo (parallel/serial) cambia entre columnas y stack vertical.

#### Wireframe (360px)

```
+----------------------------------------+
| < MiOrquestacion             [Run]     |
+----------------------------------------+
| ##################################     |
| # [ ] Cargar Ventas       agent: A1 #  |
| # retries:3  strategy:stop          #  |
| ##################################     |
|                v                       |
| ##################################     |
| # [G] GRUPO Calculos [parallel <>]  #  |
| # +------------+ +------------+     #  |
| # |[ ]Forecast | |[ ]Forecast |     #  |
| # | Demanda    | | Supply     |     #  |
| # +------------+ +------------+     #  |
| #           [+ Anadir]              #  |
| ##################################     |
|                v                       |
| [+ Bloque aqui]                        |
+----------------------------------------+
```

#### Flujo de edición

- Tap en cualquier slot `[+ Bloque aquí]` (entre cards o al final) abre el `MobileTaskPicker` → tap inserta exactamente ahí. El picker incluye "Nuevo grupo".
- Toggle `parallel ⇄ serial` en el header del grupo.
- Tap en card abre config.
- Long-press card → menú (duplicar / mover / borrar / envolver-en-grupo).
- Reordenar dentro de un stack con long-press + drag corto (viable porque cada card mide ~80px, target generoso).

#### Jerarquía y orden

- **Jerarquía**: por anidación física de cards con borde grueso.
- **Orden**:
  - Stack vertical = serial (edge entre hermanos).
  - Columnas paralelas = sin edges entre ellas.
  - El grupo es la unidad atómica de la transición en el DAG.

#### Reutilización

Igual que A, pero NO se usa `autoLayout` (las posiciones absolutas dejan de importar). Al guardar se ponen posiciones dummy `{x:0, y:0}`; el canvas desktop las recompone con `autoLayout` cuando alguien abra en escritorio.

Helpers nuevos en `canvasUtils.js`:
- `blocksToGraph(tree)`
- `graphToBlocks(nodes, edges)`

#### Compromisos

Cards grandes equivalen a menos densidad: orquestaciones de 30+ tasks requieren mucho scroll. Misma limitación de DAG arbitrario que A.

#### Esfuerzo: **L**

Archivos nuevos:

- `src/components/Orchestrations/mobile/BlocksEditor.jsx`
- `src/components/Orchestrations/mobile/Block.jsx` (task)
- `src/components/Orchestrations/mobile/GroupBlock.jsx`
- `src/components/Orchestrations/mobile/InsertSlot.jsx`
- `src/components/Orchestrations/mobile/MobileTaskPicker.jsx`

#### Para quién

Usuarios menos técnicos, foco didáctico. Cada bloque es autoexplicativo.

---

### Alternativa C — Wizard / Stepper guiado

#### Concepto

Construcción paso a paso. Una pila de "pasos" donde cada paso es una decisión del usuario: "siguiente task", "task en paralelo", "abrir rama paralela", "cerrar rama", "editar paso anterior". Cero drag, cero reordenar. Para editar una orquestación existente, se entra en modo "recorrer" con cards no-editables y un botón "editar este paso" que abre el config.

#### Wireframe (360px)

```
+----------------------------------------+
| < Construir orquestacion     [Run]     |
+----------------------------------------+
| Paso 1 - Cargar Ventas         (OK)    |
| Paso 2 - Cargar Stock (|| con 1) (OK)  |
| Paso 3 - > rama paralela {             |
|   3a - Forecast Demanda        (OK)    |
|   3b - Forecast Supply         (OK)    |
| } cerrar rama                          |
| Paso 4 - Publicar Resultado    (OK)    |
+----------------------------------------+
|  Que haces ahora?                      |
|  +----------------------------+        |
|  | +  Anadir task siguiente   |        |
|  | +  Anadir task en paralelo |        |
|  | >  Abrir rama paralela     |        |
|  | <- Deshacer ultimo paso    |        |
|  | *  Editar paso anterior    |        |
|  +----------------------------+        |
+----------------------------------------+
```

#### Flujo de edición

- Tap "Añadir task siguiente" abre `MobileTaskPicker` → tap task. Se crea nodo + edge desde la "última hoja del cursor".
- "Añadir task en paralelo" no crea edge desde el anterior.
- "Abrir rama paralela" crea un grupo `parallel` vacío y empuja el cursor adentro.
- "Cerrar rama" hace pop del cursor.
- Tap en un paso ya creado abre su config.

#### Jerarquía y orden

- **Jerarquía**: visualizada con `{ … }` y sangría. El cursor (posición actual de construcción) se renderiza como línea destacada.
- **Orden de ejecución**: determinístico por la secuencia de acciones del wizard.

#### Reutilización

- `TaskPalette` (modo mobile)
- `NodeConfigPanel`
- `useOrchestration.saveGraph`
- `canvasUtils.autoLayout` (para posiciones al exportar)

Estado nuevo: `cursorPath: [groupId|null, ...]`.

#### Compromisos

Lento para editar orquestaciones grandes ya existentes; cuesta tener panorama global. Solución natural: combinar con A (Outline) para edición.

#### Esfuerzo: **S-M**

Archivos nuevos:

- `src/components/Orchestrations/mobile/WizardEditor.jsx`
- `src/components/Orchestrations/mobile/WizardActions.jsx`
- `src/components/Orchestrations/mobile/useBuildCursor.js`
- `src/components/Orchestrations/mobile/MobileTaskPicker.jsx`

#### Para quién

Usuarios ocasionales que arman orquestaciones desde el celular en movimiento, sin conocer DAGs.

---

## 4. Comparativa rápida

| Eje | A: Outline | B: Bloques | C: Wizard |
|---|---|---|---|
| **Densidad** | Alta | Baja | Media |
| **Curva de aprendizaje** | Media | Baja | Muy baja |
| **Edición de orq. grandes** | Cómoda | Pesada | Incómoda |
| **Creación desde cero** | Buena | Buena | Excelente |
| **Esfuerzo** | M | L | S-M |
| **Touch primitives** | Tap, long-press reorder, swipe | Tap, long-press menú, drag corto | Solo taps + swipe-delete |
| **Soporta DAG arbitrario** | No (linealiza) | No (linealiza) | No (linealiza) |
| **Posiciones x/y del modelo** | Recomputables | Dummy 0,0 | Recomputables |

### Sugerencias de combinación

- **Solo A**: si el usuario quiere una sola implementación con balance entre simplicidad y poder.
- **C primero, A después**: si se prioriza shippear rápido y agregar densidad luego (comparten `MobileTaskPicker` y helpers).
- **Solo B**: si el target son usuarios completamente nuevos y se acepta el costo extra de UI.

---

## 5. Reutilización de código existente

Las tres alternativas reutilizan:

| Origen | Qué se reusa | Ruta |
|---|---|---|
| `canvasUtils.js` | `hasCycle()`, `autoLayout()` (extraer `computeWaves`), `migrateStepsToGraph()` | `src/components/Orchestrations/canvasUtils.js` |
| `useOrchestration.js` | `saveGraph()`, `handleStart()`, `handleCancel()`, polling | `src/components/Orchestrations/useOrchestration.js` |
| `NodeConfigPanel.jsx` | Tal cual, abierto como bottom-sheet | `src/components/Orchestrations/canvas/NodeConfigPanel.jsx` |
| `TaskPalette.jsx` | Añadir prop `mobile` que cambia `draggable` por `onClick` (tap-to-add) | `src/components/Orchestrations/panel/TaskPalette.jsx` |
| `api/orchestrations.js` | Validación backend sin cambios | `api/orchestrations.js:87-106` |
| `api/orchestrate.js` | Motor de ejecución sin cambios | `api/orchestrate.js` |

### Modelo de datos invariante

```json
{
  "id": "uuid",
  "connectionId": "conn_id",
  "name": "Nombre",
  "nodes": [
    {
      "id": "node_1",
      "type": "task|group",
      "position": { "x": 100, "y": 200 },
      "parentId": "group_1",
      "extent": "parent",
      "data": {
        "taskName": "SAP Task Name",
        "agentName": null,
        "errorStrategy": "stop|continue|retry",
        "globalVariables": [{ "name": "VAR", "value": "..." }]
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "node_1", "target": "node_2" }
  ]
}
```

Round-trip mobile ↔ desktop debe preservar este shape.

---

## 6. Archivos críticos a modificar / crear

### Existentes a tocar

- `src/App.jsx` (consumir `useViewport`, montar editor mobile)
- `src/components/Orchestrations/Orchestrations.jsx` (branching desktop vs mobile editor)
- `src/components/Orchestrations/canvasUtils.js` (extraer `computeWaves`, añadir helpers `linearGraphFromOrder` / `blocksToGraph` / `graphToBlocks` según alternativa elegida)
- `src/components/Orchestrations/panel/TaskPalette.jsx` (prop `mobile` con tap-to-add)
- `src/components/Orchestrations/canvas/NodeConfigPanel.jsx` (aceptar render como bottom-sheet)
- `src/index.css` (variables CSS mobile + media query 640px)

### Nuevos compartidos (las tres alternativas)

- `src/hooks/useViewport.js`
- `src/components/ui/Sheet.jsx`
- `src/components/Orchestrations/mobile/MobileTaskPicker.jsx`

### Nuevos por alternativa

Ver detalle en cada sección. Resumen:

- **A (Outline)**: 4 archivos nuevos.
- **B (Bloques)**: 5 archivos nuevos.
- **C (Wizard)**: 4 archivos nuevos.

---

## 7. Verificación

1. **Modelo invariante**: crear una orquestación con el editor mobile elegido, abrirla en desktop (canvas) y verificar que se visualiza idénticamente. Ejecutarla con `Run`: las olas deben respetar los grupos paralelos. Round-trip: editar en desktop, abrir en mobile, no debe romper.
2. **DevTools mobile** (Ctrl+Shift+M en Chrome): probar en iPhone SE (375), iPhone 14 (390), Pixel 7 (412), iPad (768). Sin scroll horizontal accidental, todos los tap-targets ≥ 44x44.
3. **Mobile real** con `vite --host` + ngrok: probar gestos (long-press, swipe, scroll-snap de tabs), teclado virtual (inputs no tapados), Safari iOS (quirks con `100vh` y `position: fixed`).
4. **Test de ejecución**: orquestación con 1 grupo paralelo de 2 tasks + 1 task secuencial. Verificar polling cada 5s (o 15s si se decide adaptativo), estados se reflejan en el editor mobile (chip de estado por fila/card/paso).
5. **Validación backend**: golpear `POST /api/orchestrations` con el JSON producido por el editor mobile, debe pasar `validateNode`/`validateNodeData` sin errores (`api/orchestrations.js:87-106`).
6. **Lighthouse mobile audit**: performance y accessibility >= 90.

---

## 8. Follow-up (fuera de scope)

El resto de las vistas necesita adaptación mobile, pero se trabaja en planes posteriores:

| Vista | Estado | Acción pendiente |
|---|---|---|
| **Resumen / GlobalResumen** | Needs full rework | Envolver Recharts en `ResponsiveContainer`, KPI grid 2col en mobile, filtros apilados verticalmente |
| **TaskMonitor** | Needs full rework | Tabla de 7+ columnas → cards/accordion con campos clave + expand para detalles. Conservar resize solo en desktop |
| **Tasks browser** | Needs adaptation | Tap-targets ≥ 44px, padding reducido (28px → 12px) en mobile |
| **Conexiones / Forms / Importer** | Needs adaptation | Grid 1 columna, inputs full-width, importador con `Sheet` |
| **Polling adaptativo** | Optimización | x3 cuando `isMobile`, pausar con `visibilitychange` |
| **Lazy load por tab** | Optimización | `React.lazy` en `SystemView.jsx` para reducir bundle inicial (Recharts y React Flow son los más pesados) |

Estos no bloquean el orquestador mobile y pueden hacerse incrementalmente.

---

## Apéndice: glosario rápido

- **DAG**: Directed Acyclic Graph. Lo que produce el modelo `{ nodes, edges }`.
- **Ola / Wave**: nivel del topological sort (Kahn). Tasks en la misma ola ejecutan en paralelo.
- **Group node**: nodo contenedor con `groupMode` parallel/serial.
- **`parentId` / `extent:'parent'`**: relación visual y lógica entre un task y su grupo padre.
- **`autoConnect`**: feature actual del canvas que conecta cada nuevo task al último soltado en el mismo contexto.
- **Bottom-sheet**: modal que entra desde abajo ocupando 100vw, patrón estándar en iOS/Android.
