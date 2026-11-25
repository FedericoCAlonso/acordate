# Acordate — App PWA de práctica musical (`v1.2.0`)

Aplicación web progresiva (**PWA**) offline para practicar **guitarra clásica, guitarra, bajo y piano** con foco en lectura de partitura, gran pentagrama, técnica, secuencias de acordes, escalas y *walking bass*.

- **Interfaz en español (Argentina)** y cifrado americano por defecto (`C`, `Dm7`, `G7`) con opción de ver cifrado latino (`Do`, `Rem7`, `Sol7`).
- **Sin tablatura en ninguna pantalla**: únicamente pentagrama (`treble-8` para guitarra clásica y guitarra, `bass` para bajo, gran pentagrama `treble + bass` para piano), grilla de cifrado, vista mixta (*lead sheet*) y digitaciones / funciones armónicas anotadas.
- **100% estática y offline**: sin backend ni paso de compilación obligatorio. Usa módulos ES nativos (`type="module"`), `abcjs@6.4.4` empaquetado localmente, síntesis de audio y metrónomo Web Audio API sin soundfonts remotos, IndexedDB y Service Worker con precaché completo.

---

## Cómo ejecutarla localmente

Como usa módulos ES y Service Worker, serví la carpeta raíz con cualquier servidor HTTP estático:

```bash
npm run serve
# o directamente:
python3 -m http.server 8080
```

Luego abrí `http://localhost:8080` en tu navegador (escritorio o móvil) y podés instalarla como PWA desde el menú del navegador.

### Tests unitarios (sin navegador)

Requiere Node.js 20+:

```bash
npm test
```

---

## Estructura del proyecto (Arquitectura MVVM)

```text
/
├── index.html                  # Shell HTML5 (carga tokens M3, abcjs 6.4.4 y src/main.js)
├── manifest.json               # Manifiesto PWA instalable
├── sw.js                       # Service Worker con precaché offline completo
├── assets/                     # Íconos SVG y PNG (192x192, 512x512)
├── vendor/abcjs/               # abcjs versión fija 6.4.4 empaquetada localmente
├── styles/
│   ├── tokens.css              # Tokens Material Design 3 (color, tipografía, forma, elevación)
│   ├── base.css                # Reset, accesibilidad, state layers, ripple, reduced-motion
│   ├── components.css          # Componentes M3 (Cards, Chips, Segmented, Sliders, FAB, Dialogs)
│   └── views.css               # Layouts adaptables (<600px, 600–839px, >=840px panel doble)
├── src/
│   ├── main.js                 # Raíz de composición e inyección de dependencias manual
│   ├── core/                   # Observable, EventBus, Router (#/), i18n, MusicTheory
│   ├── models/                 # Modelos puros sin DOM: Practice, Level, Exercise,
│   │                           # ChordProgression, Scale, UserProgress, Settings
│   ├── services/               # StorageService (IndexedDB), MetronomeService (lookahead),
│   │                           # AudioSynthService (multi-voz offline), AbcService,
│   │                           # ScaleGenerator, ProgressionGenerator, WalkingBassGenerator,
│   │                           # ImportExportService, ThemeService, WakeLockService
│   ├── viewmodels/             # Estado observable + comandos (desacoplados del DOM)
│   ├── views/                  # Componentes de UI puros (renderizado y delegación de eventos)
│   └── data/
│       ├── catalog.json        # Catálogo inicial (62 prácticas en 5 niveles x 3 instrumentos)
│       └── catalog.js          # Cargador y validador del catálogo
└── tests/                      # Tests unitarios de Models, MusicTheory, Generadores y ViewModels
```

### Rutas disponibles

- `#/practicas` — Catálogo filtrable (en escritorio `>=840 px` muestra panel doble: lista + práctica activa).
- `#/practica/:id` — Reproductor completo con pentagrama, cifrado, mixto, transposición, bucle y mezclador.
- `#/metronomo` — Metrónomo independiente de precisión con Tap Tempo, entrenador de velocidad y compás silencioso.
- `#/editor/:id` (o `#/editor/nueva`) — Editor de prácticas con vista previa en vivo, grilla de cifrado, plantillas, generadores e importar/exportar.
- `#/progreso` — Racha de días, resumen semanal, desbloqueo/salto de niveles y respaldo JSON.
- `#/ajustes` — Tema claro/oscuro/automático, color semilla dinámico Material 3, cifrado americano/latino y Wake Lock.

---

## Cómo agregar una práctica

### Desde la app (sin tocar código)

1. Abrí **Editor** (`#/editor/nueva`) o presioná **Nueva práctica** en la barra superior.
2. Elegí una plantilla, usá uno de los generadores o escribí tu partitura directamente en notación ABC.
3. Revisá la vista previa en vivo, escuchala y presioná **Guardar**. Se almacena localmente en IndexedDB y podés exportarla en `.json` o `.abc`.
4. Si querés modificar una práctica incluida en el catálogo, abrí **Duplicar y editar** para crear tu copia editable.

### Al catálogo base (`src/data/catalog.json`)

Agregá un objeto que cumpla con el esquema validado por `validatePracticeSchema` en `src/models/Practice.js`:

```json
{
  "id": "bajo-walking-ejemplo-01",
  "version": 1,
  "title": "Walking bass: ejemplo en Bb",
  "instruments": ["bajo"],
  "category": "walking",
  "level": 4,
  "tags": ["jazz", "walking"],
  "key": "Bb",
  "timeSignature": "4/4",
  "tempo": { "start": 90, "target": 140, "step": 5 },
  "abc": "X:1\nT:Ejemplo\nM:4/4\nL:1/4\nK:Bb clef=bass\n\"Cm7\"C, E, G, ^F, | \"F7\"F, A, C A, | \"Bbmaj7\"B,, D, F, A, | \"Bbmaj7\"B, A, F, D, |]",
  "fingerings": { "1": "2" },
  "goals": ["Mantener el pulso ligado"],
  "notes": "Tocá la raíz firme en el tiempo 1.",
  "origin": "builtin",
  "createdAt": "2026-11-19T00:00:00Z"
}
```

> **Importante**: usá `clef=treble-8` para guitarra clásica y guitarra, y `clef=bass` para bajo. Nunca incluyas directivas de tablatura. Ejecutá `npm test` para verificar automáticamente el esquema.

---

## Cómo extender los generadores

Todos los generadores viven en `src/services/` como servicios puros (sin DOM ni estado global):

1. **Nuevas escalas, modos o arpegios**: agregá una entrada en `SCALE_DEFINITIONS` dentro de `src/models/Scale.js` con `{ name, intervals, kind }`. `ScaleGenerator` y el diálogo del editor la incorporarán automáticamente.
2. **Nuevas progresiones de acordes**: agregá una entrada en `PROGRESSION_TEMPLATES` dentro de `src/models/ChordProgression.js` indicando su nombre y arreglo de grados romanos (`degrees`). Si necesitás un grado romano nuevo, registralo en `ROMAN_DEGREE_MAP` en `src/services/ProgressionGenerator.js`.
3. **Nuevas variantes de walking bass**: extendé `_chooseMiddleBeats` o agregá una nueva variante en `WalkingBassGenerator.generate()` (`src/services/WalkingBassGenerator.js`) y añadí la opción correspondiente en `_openWalkingGeneratorDialog()` dentro de `src/views/EditorView.js`.
4. **Tests**: agregá un caso unitario en `tests/generators.test.js` y corré `npm test`.

## Licencia

**© 2026 Federico C. Alonso — Todos los derechos reservados (All Rights Reserved).**  
El código fuente, diseño, arquitectura y catálogo pedagógico de Acordate son propietarios (ver [LICENSE](./LICENSE)). No se permite copiar, modificar, redistribuir ni utilizar comercialmente sin autorización escrita del titular.

- **Terceros:** el motor de partituras `abcjs 6.4.4` (`vendor/abcjs/`) se incluye bajo Licencia MIT (Paul Rosen & Gregory Dyke).
