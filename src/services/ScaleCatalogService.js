import { formatChordSymbol } from '../core/i18n.js';
import {
  NOTE_TO_PC,
  midiToAbcPitch,
  mod12,
  pcToNoteName,
  prefersFlats
} from '../core/MusicTheory.js';
import { getPitchPolicy, soundingMidiToWrittenMidi } from '../core/PitchPolicy.js';
import { getTuningForVoicingInstrument, normalizeVoicingInstrument } from './FingeringDesignService.js';

/** Orden diatónico de letras naturales y sus clases de altura (C=0..B=11). */
const DIATONIC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Familias pedagógicas para agrupar el catálogo de escalas y modos.
 */
export const SCALE_FAMILIES = [
  { id: 'basicas', label: 'Básicas y Pentatónicas' },
  { id: 'modos', label: 'Modos griegos' },
  { id: 'menores', label: 'Menores y Blues' },
  { id: 'jazz-color', label: 'Dominantes, Jazz y Simétricas' }
];

/**
 * Sistemas de digitación disponibles según el instrumento elegido (sin tablatura).
 */
export const SCALE_FINGERING_SYSTEMS = {
  guitarra: [
    { id: 'caged', label: '5 cajas CAGED', description: 'Vincula la escala con la forma del acorde CAGED en la misma zona.' },
    { id: '3nps', label: '3 notas por cuerda (3NPS)', description: '7 digitaciones parejas ideales para púa alternada, legato y patrones.' },
    { id: 'abierta', label: 'Posición abierta (0–4)', description: 'Aprovecha cuerdas al aire en primera posición.' },
    { id: 'completo', label: 'Todo el diapasón', description: 'Vista panorámica de trastes 0 a 15.' }
  ],
  'guitarra-clasica': [
    { id: 'primera-posicion', label: '1.ª posición (abierta)', description: 'Lectura clásica en trastes 0–4 con cuerdas al aire y dedos 1–4.' },
    { id: 'segovia', label: 'Esquema Segovia (2 oct.)', description: 'Digitación clásica en 2 octavas con traslados limpios y p-i-m-a.' },
    { id: 'completo', label: 'Todo el diapasón', description: 'Vista panorámica de trastes 0 a 12.' }
  ],
  bajo: [
    { id: 'caja-1oct', label: '3 cajas de 1 octava', description: 'Iniciando con dedo 1, dedo 2 o dedo 4; usa Simandl (1-2-4) en trastes 1–4 y 1FPC desde traste 5+.' },
    { id: 'diagonal-2oct', label: '2 octavas diagonal', description: 'Traslado controlado en grado 3 o 5 para cubrir 2 octavas en 4 cuerdas.' },
    { id: 'completo', label: 'Todo el diapasón', description: 'Vista panorámica de trastes 0 a 15.' }
  ],
  'bajo-5': [
    { id: 'caja-1oct', label: '3 cajas de 1 octava', description: 'Iniciando con dedo 1, dedo 2 o dedo 4; usa Simandl (1-2-4) en trastes 1–4 y 1FPC desde traste 5+.' },
    { id: 'diagonal-2oct', label: '2 octavas (aprovecha Si grave)', description: 'Explota la 5.ª cuerda (B0) para tocar 2 octavas sin desplazamientos bruscos.' },
    { id: 'completo', label: 'Todo el diapasón', description: 'Vista panorámica de trastes 0 a 15.' }
  ]
};

/**
 * Patrones de estudio melódico y técnico reproducibles sobre cualquier escala.
 */
export const SCALE_STUDY_PATTERNS = [
  { id: 'asc-desc', label: 'Ascendente y descendente', description: 'Recorrido completo de ida y vuelta cuidando afinación y pulso.' },
  { id: 'terceras', label: 'Terceras diatónicas', description: '1–3, 2–4, 3–5… Entrena oído interválico y agilidad de cambio de cuerda.' },
  { id: 'grupos-3', label: 'Grupos de 3 notas', description: '1–2–3, 2–3–4, 3–4–5… Excelente para fraseo y tresillos.' },
  { id: 'grupos-4', label: 'Grupos de 4 notas', description: '1–2–3–4, 2–3–4–5… Ideal para semicorcheas y control de mano derecha.' },
  { id: 'arpegios', label: 'Arpegios diatónicos', description: 'Tríadas/cuatríadas sobre cada grado de la escala: puente directo a los acordes.' }
];

/**
 * Catálogo musicológico de 22 escalas y modos (Niveles 1 a 5), consensuado por los especialistas
 * en teoría/técnica instrumental y repertorio de Acordate.
 */
export const SCALE_CATALOG = [
  // === NIVEL 1 ===
  {
    id: 'mayor',
    name: 'Mayor (Jónico)',
    family: 'basicas',
    level: 1,
    heptatonic: true,
    brightnessRank: 2,
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degreeLabels: ['1', '2', '3', '4', '5', '6', '7'],
    characteristicIndices: [2, 6],
    avoidIndices: [3],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'maj7',
    droneVoicingLabel: 'Imaj7',
    associatedChords: [
      { offset: 0, quality: 'maj7', role: 'I (Tónica)' },
      { offset: 2, quality: 'm7', role: 'ii7' },
      { offset: 4, quality: 'm7', role: 'iii7' },
      { offset: 5, quality: 'maj7', role: 'IVmaj7' },
      { offset: 7, quality: '7', role: 'V7' },
      { offset: 9, quality: 'm7', role: 'vi7' },
      { offset: 11, quality: 'm7b5', role: 'viiø7' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: '1.º modo de la tonalidad mayor' },
    uses: 'Base del sistema tonal occidental: clásica, pop, folk, bossa nova, jazz mayor y melodías luminosas.',
    avoidNoteExplanation: 'La 4.ª justa choca por 2.ª menor (b9) con la 3.ª mayor en un acorde maj7; usala como nota de paso.',
    techniqueTip: 'Escuchá la atracción de la 7.ª mayor (sensible) resolviendo medio tono hacia la raíz.',
    repertoireIds: ['rep-clas-bach-minueto-sol', 'rep-clas-tarrega-lagrima', 'rep-trad-danny-boy', 'rep-jazz-all-the-things']
  },
  {
    id: 'menor-natural',
    name: 'Menor natural (Eólico)',
    family: 'basicas',
    level: 1,
    heptatonic: true,
    brightnessRank: 5,
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degreeLabels: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    characteristicIndices: [5],
    avoidIndices: [5],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'm7',
    droneVoicingLabel: 'im7',
    associatedChords: [
      { offset: 0, quality: 'm7', role: 'im7 (Tónica)' },
      { offset: 2, quality: 'm7b5', role: 'iiø7' },
      { offset: 3, quality: 'maj7', role: 'bIIImaj7' },
      { offset: 5, quality: 'm7', role: 'ivm7' },
      { offset: 7, quality: 'm7', role: 'vm7' },
      { offset: 8, quality: 'maj7', role: 'bVImaj7' },
      { offset: 10, quality: '7', role: 'bVII7' }
    ],
    relativeParent: { semitoneOffset: 3, modeLabel: '6.º modo de la tonalidad mayor relativa' },
    uses: 'Rock, pop, folk, música clásica, baladas menores y secciones menores de jazz/tango.',
    avoidNoteExplanation: 'La b6 crea fuerte tensión (b9 sobre la 5.ª) al sostenerla sobre un acorde m7 de tónica; resolvela hacia la 5.ª.',
    techniqueTip: 'Comparala en paralelo con Dórico (6 natural) para entrenar el oído a reconocer la b6 melancólica.',
    repertoireIds: ['rep-clas-narvaez-emperador', 'rep-jazz-autumn-leaves', 'rep-jazz-blue-bossa', 'rep-lat-por-una-cabeza']
  },
  {
    id: 'pentatonica-mayor',
    name: 'Pentatónica mayor',
    family: 'basicas',
    level: 1,
    heptatonic: false,
    intervals: [0, 2, 4, 7, 9],
    degreeLabels: ['1', '2', '3', '5', '6'],
    characteristicIndices: [2, 4],
    avoidIndices: [],
    chordToneIndices: [0, 2, 3],
    droneChordQuality: '6',
    droneVoicingLabel: 'I6 / Imaj7',
    associatedChords: [
      { offset: 0, quality: '', role: 'I (Tríada mayor)' },
      { offset: 0, quality: 'maj7', role: 'Imaj7' },
      { offset: 0, quality: '6', role: 'I6' },
      { offset: 0, quality: 'add9', role: 'Iadd9' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Mayor sin 4.ª ni 7.ª (cero avoid notes)' },
    uses: 'Folk, country, gospel, pop, rock clásico y melodías abiertas y cantables sin disonancias.',
    avoidNoteExplanation: 'No tiene avoid notes: las 5 notas son completamente consonantes sobre acordes mayores.',
    techniqueTip: 'Nunca la pienses solo como «la relativa menor»: apoyá tus frases en la 1.ª, 3.ª mayor y 6.ª.',
    repertoireIds: ['rep-trad-amazing-grace', 'rep-trad-danny-boy']
  },
  {
    id: 'pentatonica-menor',
    name: 'Pentatónica menor',
    family: 'basicas',
    level: 1,
    heptatonic: false,
    intervals: [0, 3, 5, 7, 10],
    degreeLabels: ['1', 'b3', '4', '5', 'b7'],
    characteristicIndices: [1, 4],
    avoidIndices: [],
    chordToneIndices: [0, 1, 3, 4],
    droneChordQuality: 'm7',
    droneVoicingLabel: 'im7',
    associatedChords: [
      { offset: 0, quality: 'm', role: 'i (Tríada menor)' },
      { offset: 0, quality: 'm7', role: 'im7' },
      { offset: 0, quality: '7', role: 'I7 (Blues / Rock)' }
    ],
    relativeParent: { semitoneOffset: 3, modeLabel: 'Menor natural sin 2.ª ni b6' },
    uses: 'Blues, rock, funk, soul, pop y base directa para improvisación menor en guitarra y bajo.',
    avoidNoteExplanation: 'No tiene avoid notes; funciona limpia sobre acordes menores y en blues sobre acordes dominantes I7.',
    techniqueTip: 'Visualizá los 2 trastes por cuerda y marcá la raíz y la b3 en cada caja para no sonar mecánico.',
    repertoireIds: ['rep-trad-rising-sun', 'rep-jazz-summertime', 'rep-jazz-blues-minor-am', 'rep-jazz-mr-pc']
  },

  // === NIVEL 2 ===
  {
    id: 'blues-menor',
    name: 'Escala de Blues menor',
    family: 'menores',
    level: 2,
    heptatonic: false,
    intervals: [0, 3, 5, 6, 7, 10],
    degreeLabels: ['1', 'b3', '4', 'b5', '5', 'b7'],
    characteristicIndices: [3],
    avoidIndices: [],
    chordToneIndices: [0, 1, 4, 5],
    droneChordQuality: '7',
    droneVoicingLabel: 'I7 / im7',
    associatedChords: [
      { offset: 0, quality: '7', role: 'I7 (Blues)' },
      { offset: 0, quality: 'm7', role: 'im7 (Blues menor)' },
      { offset: 5, quality: '7', role: 'IV7' },
      { offset: 7, quality: '7', role: 'V7' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Pentatónica menor + b5 (blue note)' },
    uses: 'Blues de 12 compases, jazz blues, rock, funk y soul.',
    avoidNoteExplanation: 'La b5 (blue note) funciona como nota de paso expresiva hacia la 4.ª o la 5.ª, no como reposo largo.',
    techniqueTip: 'Probá resolver la b5 con ligado descendente hacia la 4.ª o ascendente hacia la 5.ª.',
    repertoireIds: ['rep-jazz-blues-shuffle-a', 'rep-jazz-blues-quick-f', 'rep-jazz-blues-minor-am', 'rep-jazz-billies-bounce']
  },
  {
    id: 'blues-mayor',
    name: 'Escala de Blues mayor',
    family: 'menores',
    level: 2,
    heptatonic: false,
    intervals: [0, 2, 3, 4, 7, 9],
    degreeLabels: ['1', '2', 'b3', '3', '5', '6'],
    characteristicIndices: [2, 3],
    avoidIndices: [],
    chordToneIndices: [0, 3, 4],
    droneChordQuality: '7',
    droneVoicingLabel: 'I7 / I6',
    associatedChords: [
      { offset: 0, quality: '7', role: 'I7 (Swing / Blues)' },
      { offset: 0, quality: '6', role: 'I6' },
      { offset: 0, quality: '', role: 'I mayor' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Pentatónica mayor + b3 (paso cromático a 3)' },
    uses: 'Blues alegre (estilo B.B. King), swing, country, gospel y ragtime.',
    avoidNoteExplanation: 'La b3 resuelve típicamente hacia la 3.ª mayor en un giro muy expresivo.',
    techniqueTip: 'Alterná Blues mayor sobre el I7 y Blues menor sobre el IV7 para lograr fraseo blusero profesional.',
    repertoireIds: ['rep-jazz-blues-shuffle-a', 'rep-trad-saints', 'rep-trad-entertainer']
  },
  {
    id: 'menor-armonica',
    name: 'Menor armónica',
    family: 'menores',
    level: 2,
    heptatonic: true,
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degreeLabels: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    characteristicIndices: [6],
    avoidIndices: [5],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'mMaj7',
    droneVoicingLabel: 'im / V7b9',
    associatedChords: [
      { offset: 0, quality: 'm', role: 'i (Tónica menor)' },
      { offset: 0, quality: 'mMaj7', role: 'imMaj7' },
      { offset: 2, quality: 'm7b5', role: 'iiø7' },
      { offset: 7, quality: '7', role: 'V7 (Dominante con sensible)' },
      { offset: 11, quality: 'dim7', role: 'vii°7' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Menor natural con 7.ª mayor (sensible)' },
    uses: 'Repertorio clásico y barroco, tango rioplatense, flamenco, gypsy jazz y cadencias iiø–V7–i.',
    avoidNoteExplanation: 'El salto característico de 2.ª aumentada (b6 → 7) define su color dramático; cuidá la afinación y digitación.',
    techniqueTip: 'Usala sobre el acorde V7 que resuelve al i menor (ej. A7 → Dm en El choclo, B7 → Em en Romance).',
    repertoireIds: ['rep-lat-el-choclo', 'rep-lat-la-cumparsita', 'rep-clas-bach-preludio-999', 'rep-clas-romance-anonimo', 'rep-clas-sor-op35-n22']
  },
  {
    id: 'menor-melodica',
    name: 'Menor melódica (clásica / jazz)',
    family: 'menores',
    level: 2,
    heptatonic: true,
    hasClassicalDualMode: true,
    intervals: [0, 2, 3, 5, 7, 9, 11],
    descendingIntervals: [0, 2, 3, 5, 7, 8, 10],
    degreeLabels: ['1', '2', 'b3', '4', '5', '6', '7'],
    characteristicIndices: [5, 6],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'mMaj7',
    droneVoicingLabel: 'imMaj7 / im6',
    associatedChords: [
      { offset: 0, quality: 'mMaj7', role: 'imMaj7' },
      { offset: 0, quality: 'm6', role: 'im6' },
      { offset: 5, quality: '7', role: 'IV7 (Lidio dom.)' },
      { offset: 9, quality: 'm7b5', role: 'viø7 (Locrio ♮2)' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Mayor con b3 (escala madre de modos de jazz)' },
    uses: 'En música clásica/barroca asciende con 6–7 y desciende natural (b7–b6); en jazz se usa fija (1–2–b3–4–5–6–7) subiendo y bajando.',
    avoidNoteExplanation: 'Sin avoid notes duras en su forma jazz; suaviza la 2.ª aumentada de la menor armónica.',
    techniqueTip: 'Probá el selector «Clásica asc./desc.» vs. «Jazz fija» y escuchá la diferencia en la bajada.',
    repertoireIds: ['rep-clas-bach-bourree-996', 'rep-trad-greensleeves', 'rep-jazz-summertime']
  },

  // === NIVEL 3 (MODOS GRIEGOS) ===
  {
    id: 'dorico',
    name: 'Dórico',
    family: 'modos',
    level: 3,
    heptatonic: true,
    brightnessRank: 4,
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degreeLabels: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    characteristicIndices: [5],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'm7',
    droneVoicingLabel: 'im7 / m6',
    associatedChords: [
      { offset: 0, quality: 'm7', role: 'i7 (Centro dórico)' },
      { offset: 0, quality: 'm6', role: 'im6 (resalta la 6.ª)' },
      { offset: 5, quality: '7', role: 'IV7 (cadencia dórica)' },
      { offset: 2, quality: 'm7', role: 'iim7' }
    ],
    relativeParent: { semitoneOffset: -2, modeLabel: '2.º modo de la escala mayor' },
    uses: 'Jazz modal (So What), funk, soul, rock latino (Santana), baladas celtas/folk y sobre el ii7 en ii–V–I.',
    avoidNoteExplanation: 'No tiene avoid notes duras: la 6.ª mayor es precisamente su nota característica luminosa.',
    techniqueTip: 'Activá el pedal armónico (drone) en m7 y resolvé tus frases pasando por la 6.ª mayor.',
    repertoireIds: ['rep-jazz-so-what', 'rep-trad-scarborough-fair', 'rep-trad-rising-sun', 'rep-jazz-autumn-leaves']
  },
  {
    id: 'frigio',
    name: 'Frigio',
    family: 'modos',
    level: 3,
    heptatonic: true,
    brightnessRank: 6,
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degreeLabels: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    characteristicIndices: [1],
    avoidIndices: [1, 5],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'm7',
    droneVoicingLabel: 'im7 / susb9',
    associatedChords: [
      { offset: 0, quality: 'm7', role: 'im7 (modal)' },
      { offset: 1, quality: 'maj7', role: 'bIImaj7 (cadencia frigia)' },
      { offset: 10, quality: 'm7', role: 'bviim7' }
    ],
    relativeParent: { semitoneOffset: -4, modeLabel: '3.º modo de la escala mayor' },
    uses: 'Música española/andaluza menor, metal, jazz modal oscuro y sobre el iii7 en contextos tonales.',
    avoidNoteExplanation: 'La b2 y la b6 son muy tensas en armonía tonal; en contexto modal, la b2 resolviendo a la raíz es su sello.',
    techniqueTip: 'No lo confundas con Frigio dominante (que lleva 3.ª mayor): el Frigio puro tiene 3.ª menor (b3).',
    repertoireIds: ['rep-clas-albeniz-asturias']
  },
  {
    id: 'lidio',
    name: 'Lidio',
    family: 'modos',
    level: 3,
    heptatonic: true,
    brightnessRank: 1,
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degreeLabels: ['1', '2', '3', '#4', '5', '6', '7'],
    characteristicIndices: [3],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'maj7',
    droneVoicingLabel: 'Imaj7(#11)',
    associatedChords: [
      { offset: 0, quality: 'maj7', role: 'Imaj7 (IVmaj7 tonal)' },
      { offset: 2, quality: '', role: 'II mayor (tríada superior)' },
      { offset: 11, quality: 'm7', role: 'viim7' }
    ],
    relativeParent: { semitoneOffset: -5, modeLabel: '4.º modo de la escala mayor (el más brillante)' },
    uses: 'Bandas sonoras, jazz moderno sobre IVmaj7 y maj7#11, rock progresivo y bossa nova.',
    avoidNoteExplanation: 'Es el modo más consonante de todos: al elevar el 4.º grado a #4 elimina la avoid note de la escala mayor.',
    techniqueTip: 'Hacé brillar la #4 (#11) resolviendo hacia la 5.ª o la 3.ª sobre un acorde maj7 sostenido.',
    repertoireIds: ['rep-jazz-misty', 'rep-jazz-fly-me-to-the-moon', 'rep-jazz-ipanema']
  },
  {
    id: 'mixolidio',
    name: 'Mixolidio',
    family: 'modos',
    level: 3,
    heptatonic: true,
    brightnessRank: 3,
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degreeLabels: ['1', '2', '3', '4', '5', '6', 'b7'],
    characteristicIndices: [6],
    avoidIndices: [3],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: '7',
    droneVoicingLabel: 'V7 / I7',
    associatedChords: [
      { offset: 0, quality: '7', role: 'I7 / V7 (Dominante)' },
      { offset: 0, quality: '9', role: 'I9' },
      { offset: 10, quality: '', role: 'bVII (giro rock/modal)' }
    ],
    relativeParent: { semitoneOffset: -7, modeLabel: '5.º modo de la escala mayor' },
    uses: 'Acordes dominantes (V7) en jazz, blues mayor, funk, rock clásico y puentes de Rhythm Changes.',
    avoidNoteExplanation: 'La 4.ª justa choca con la 3.ª mayor en un acorde dominante (salvo que el acorde sea 7sus4).',
    techniqueTip: 'Usá el tritono interno (3.ª y b7) como notas objetivo al enlazar dominantes en ciclo de cuartas.',
    repertoireIds: ['rep-jazz-rhythm-changes', 'rep-jazz-blues-quick-f', 'rep-jazz-blues-shuffle-a', 'rep-jazz-billies-bounce']
  },
  {
    id: 'locrio',
    name: 'Locrio',
    family: 'modos',
    level: 3,
    heptatonic: true,
    brightnessRank: 7,
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degreeLabels: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    characteristicIndices: [1, 4],
    avoidIndices: [1],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'm7b5',
    droneVoicingLabel: 'viiø7 / iiø7',
    associatedChords: [
      { offset: 0, quality: 'm7b5', role: 'm7b5 (Semidisminuido)' }
    ],
    relativeParent: { semitoneOffset: 1, modeLabel: '7.º modo de la escala mayor (el más oscuro)' },
    uses: 'Acordes semidisminuidos (m7b5), especialmente en iiø7 de cadencias menores (iiø–V7–i).',
    avoidNoteExplanation: 'La b2 es tensa sobre m7b5; en jazz moderno suele reemplazarse por 9 natural usando Locrio ♮2.',
    techniqueTip: 'Acentuá la b5 (tritono con la raíz) y conectá hacia la 3.ª del V7 siguiente.',
    repertoireIds: ['rep-jazz-autumn-leaves', 'rep-jazz-blue-bossa', 'rep-jazz-fly-me-to-the-moon', 'rep-jazz-all-the-things']
  },

  // === NIVEL 4 ===
  {
    id: 'frigio-dominante',
    name: 'Frigio dominante (Mayor flamenca)',
    family: 'jazz-color',
    level: 4,
    heptatonic: true,
    intervals: [0, 1, 4, 5, 7, 8, 10],
    degreeLabels: ['1', 'b2', '3', '4', '5', 'b6', 'b7'],
    characteristicIndices: [1, 2, 5],
    avoidIndices: [3],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: '7',
    droneVoicingLabel: 'V7(b9,b13)',
    associatedChords: [
      { offset: 0, quality: '7', role: 'V7(b9,b13) hacia menor' },
      { offset: 0, quality: '', role: 'I mayor (flamenco / andaluz)' },
      { offset: 1, quality: '', role: 'bII mayor' }
    ],
    relativeParent: { semitoneOffset: 5, modeLabel: '5.º modo de la escala menor armónica' },
    uses: 'Flamenco, música española y klezmer, metal neoclásico y dominantes V7b9 resolviendo a menor en jazz y tango.',
    avoidNoteExplanation: 'La 4.ª choca con la 3.ª mayor; el salto de 2.ª aumentada (b2 → 3) es su identidad sonora.',
    techniqueTip: 'Escuchala sobre el acorde E7 que resuelve a Am (o B7 → Em en Asturias) activando el pedal.',
    repertoireIds: ['rep-clas-albeniz-asturias', 'rep-jazz-blues-minor-am', 'rep-jazz-mr-pc', 'rep-jazz-summertime']
  },
  {
    id: 'lidio-dominante',
    name: 'Lidio dominante (Lidio b7)',
    family: 'jazz-color',
    level: 4,
    heptatonic: true,
    intervals: [0, 2, 4, 6, 7, 9, 10],
    degreeLabels: ['1', '2', '3', '#4', '5', '6', 'b7'],
    characteristicIndices: [3, 6],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: '7',
    droneVoicingLabel: 'I7(#11)',
    associatedChords: [
      { offset: 0, quality: '7', role: 'II7 / bVII7 / Sustituto tritonal' },
      { offset: 0, quality: '9', role: '9(#11)' },
      { offset: 0, quality: '13', role: '13(#11)' }
    ],
    relativeParent: { semitoneOffset: -5, modeLabel: '4.º modo de la menor melódica jazz' },
    uses: 'Dominantes que NO resuelven por quinta (II7 en Take the "A" Train, sustitutos tritonales como Gb7 en Ipanema, bVII7).',
    avoidNoteExplanation: 'No tiene avoid notes: todas sus tensiones (9, #11, 13) son disponibles y muy luminosas.',
    techniqueTip: 'No confundirla con Lidio (que tiene 7 mayor): aquí la b7 combinada con #4 genera el color jazz clásico.',
    repertoireIds: ['rep-jazz-take-the-a-train', 'rep-jazz-ipanema', 'rep-jazz-satin-doll']
  },
  {
    id: 'locrio-nat2',
    name: 'Locrio ♮2 (Semidisminuido jazz)',
    family: 'jazz-color',
    level: 4,
    heptatonic: true,
    intervals: [0, 2, 3, 5, 6, 8, 10],
    degreeLabels: ['1', '2', 'b3', '4', 'b5', 'b6', 'b7'],
    characteristicIndices: [1, 4],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'm7b5',
    droneVoicingLabel: 'iiø7(9)',
    associatedChords: [
      { offset: 0, quality: 'm7b5', role: 'iiø7 (en iiø–V7–i jazz)' }
    ],
    relativeParent: { semitoneOffset: 3, modeLabel: '6.º modo de la menor melódica jazz' },
    uses: 'Opción predilecta en jazz moderno sobre acordes m7b5 (Autumn Leaves, Blue Bossa, All the Things You Are).',
    avoidNoteExplanation: 'Al subir b2 a 2 natural (9.ª mayor), desaparece la avoid note del Locrio tradicional.',
    techniqueTip: 'Visualizala como la menor melódica una tercera menor arriba (ej. sobre Dm7b5 tocá F menor melódica).',
    repertoireIds: ['rep-jazz-autumn-leaves', 'rep-jazz-blue-bossa', 'rep-jazz-all-the-things']
  },
  {
    id: 'bebop-dominante',
    name: 'Bebop dominante (8 notas)',
    family: 'jazz-color',
    level: 4,
    heptatonic: false,
    intervals: [0, 2, 4, 5, 7, 9, 10, 11],
    degreeLabels: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
    characteristicIndices: [7],
    avoidIndices: [3],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: '7',
    droneVoicingLabel: 'V7 (bebop)',
    associatedChords: [
      { offset: 0, quality: '7', role: 'V7 (Bebop / Swing)' },
      { offset: 0, quality: '9', role: 'V9' },
      { offset: 0, quality: '13', role: 'V13' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Mixolidio + 7.ª mayor de paso cromático' },
    uses: 'Líneas de corcheas en jazz bebop (Charlie Parker, Wes Montgomery) y walking bass fluido.',
    avoidNoteExplanation: 'Su nota cromática extra (7) hace que las notas del acorde (1, 3, 5, b7) caigan siempre en tiempos fuertes al bajar desde la raíz.',
    techniqueTip: 'Practicá bajando en corcheas desde la raíz (1–7–b7–6–5–4–3–2–1) sintiendo los acentos en 1, b7, 5 y 3.',
    repertoireIds: ['rep-jazz-billies-bounce', 'rep-jazz-rhythm-changes', 'rep-jazz-all-of-me']
  },
  {
    id: 'cromatica',
    name: 'Escala cromática',
    family: 'jazz-color',
    level: 4,
    heptatonic: false,
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    degreeLabels: ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'],
    characteristicIndices: [],
    avoidIndices: [],
    chordToneIndices: [0, 4, 7],
    droneChordQuality: '7',
    droneVoicingLabel: 'Técnica / paso',
    associatedChords: [
      { offset: 0, quality: '7', role: 'Aproximaciones cromáticas' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Los 12 semitonos equidistantes' },
    uses: 'Calentamiento técnico de independencia de dedos (1–2–3–4), aproximaciones cromáticas en walking bass y bebop.',
    avoidNoteExplanation: 'Todas las notas sirven como enlace cromático hacia notas reales del acorde.',
    techniqueTip: 'Priorizá mínima tensión, dedos cerca de las cuerdas y sincronía exacta entre ambas manos.',
    repertoireIds: ['rep-jazz-billies-bounce', 'rep-jazz-giant-steps']
  },

  // === NIVEL 5 ===
  {
    id: 'alterada',
    name: 'Alterada (Superlocrio)',
    family: 'jazz-color',
    level: 5,
    heptatonic: true,
    intervals: [0, 1, 3, 4, 6, 8, 10],
    degreeLabels: ['1', 'b9', '#9', '3', '#11', 'b13', 'b7'],
    characteristicIndices: [1, 2, 4, 5],
    avoidIndices: [],
    chordToneIndices: [0, 3, 6],
    droneChordQuality: '7',
    droneVoicingLabel: 'V7alt',
    associatedChords: [
      { offset: 0, quality: '7', role: 'V7alt (b9, #9, #11, b13)' }
    ],
    relativeParent: { semitoneOffset: 1, modeLabel: '7.º modo de la menor melódica (medio tono arriba)' },
    uses: 'Máxima tensión sobre dominantes V7alt que resuelven con fuerza al I (mayor o menor) en jazz moderno.',
    avoidNoteExplanation: 'Contiene las 4 tensiones alteradas (b9, #9, b5/#11, #5/b13) más el tritono guía (3 y b7).',
    techniqueTip: 'Atajo práctico: sobre G7alt tocá Ab menor melódica y resolvé las tensiones medio tono hacia Cm7 o Cmaj7.',
    repertoireIds: ['rep-jazz-blue-bossa', 'rep-jazz-autumn-leaves', 'rep-jazz-all-of-me', 'rep-jazz-all-the-things']
  },
  {
    id: 'disminuida-st',
    name: 'Disminuida semitono–tono (8 notas)',
    family: 'jazz-color',
    level: 5,
    heptatonic: false,
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    degreeLabels: ['1', 'b9', '#9', '3', '#11', '5', '13', 'b7'],
    characteristicIndices: [1, 2, 4, 6],
    avoidIndices: [],
    chordToneIndices: [0, 3, 5, 7],
    droneChordQuality: '7',
    droneVoicingLabel: 'V7(b9,13)',
    associatedChords: [
      { offset: 0, quality: '7', role: 'V7(b9, #9, #11, 13)' },
      { offset: 0, quality: '13', role: 'V13(b9)' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Escala simétrica octatónica (se repite cada 3 trastes)' },
    uses: 'Dominantes 7b9 y 13b9 en jazz, bossa y fusión; permite patrones simétricos desplazables cada 3 trastes.',
    avoidNoteExplanation: 'Sin avoid notes; mantiene 5.ª justa y 13.ª natural combinadas con b9, #9 y #11.',
    techniqueTip: 'Aprovechá su simetría: cualquier motivo que aprendas se transporta idéntico 3 trastes arriba o abajo.',
    repertoireIds: ['rep-jazz-all-of-me', 'rep-jazz-rhythm-changes', 'rep-jazz-misty']
  },
  {
    id: 'disminuida-ts',
    name: 'Disminuida tono–semitono (8 notas)',
    family: 'jazz-color',
    level: 5,
    heptatonic: false,
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    degreeLabels: ['1', '2', 'b3', '4', 'b5', 'b6', 'bb7', '7'],
    characteristicIndices: [4, 6],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 6],
    droneChordQuality: 'dim7',
    droneVoicingLabel: 'dim7',
    associatedChords: [
      { offset: 0, quality: 'dim7', role: 'Acorde disminuido de paso (dim7)' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Escala simétrica octatónica sobre acordes dim7' },
    uses: 'Acordes disminuidos de paso (#IV°7, #I°7) en jazz blues (Billie\'s Bounce), Rhythm Changes, tango y clásica.',
    avoidNoteExplanation: 'Cada nota del acorde dim7 tiene una nota de aproximación un tono por encima disponible.',
    techniqueTip: 'Probala sobre el Bdim7 del compás 6 de Billie\'s Bounce o el Edim7 de Rhythm Changes.',
    repertoireIds: ['rep-jazz-billies-bounce', 'rep-jazz-rhythm-changes', 'rep-jazz-all-the-things']
  },
  {
    id: 'tonos-enteros',
    name: 'Tonos enteros (Hexatónica)',
    family: 'jazz-color',
    level: 5,
    heptatonic: false,
    intervals: [0, 2, 4, 6, 8, 10],
    degreeLabels: ['1', '2', '3', '#4', '#5', 'b7'],
    characteristicIndices: [3, 4],
    avoidIndices: [],
    chordToneIndices: [0, 2, 4, 5],
    droneChordQuality: '7',
    droneVoicingLabel: '7(#5) / aug',
    associatedChords: [
      { offset: 0, quality: 'aug', role: 'Tríada aumentada (+)' },
      { offset: 0, quality: '7', role: 'V7(#5, #11)' }
    ],
    relativeParent: { semitoneOffset: 0, modeLabel: 'Simétrica de 6 tonos enteros (solo existen 2 colecciones)' },
    uses: 'Impresionismo (Debussy), dominantes aumentados V7#5 en jazz (Thelonious Monk, Wayne Shorter) y efectos flotantes.',
    avoidNoteExplanation: 'Sin semitonos ni 5.ª justa: sonoridad onírica y ambigua que resuelve con gran alivio a la tónica.',
    techniqueTip: 'Todo motivo se repite exactamente cada 2 trastes (1 tono); ideal para secuencias simétricas.',
    repertoireIds: ['rep-jazz-take-the-a-train', 'rep-jazz-giant-steps']
  }
];

/**
 * Niveles del entrenador de oído modal en enfoque paralelo (misma tónica + drone armónico).
 */
export const SCALE_EAR_LEVELS = [
  {
    level: 1,
    label: 'Nivel 1 — Básicas',
    scaleIds: ['mayor', 'menor-natural', 'pentatonica-menor', 'blues-menor']
  },
  {
    level: 2,
    label: 'Nivel 2 — Menores',
    scaleIds: ['menor-natural', 'menor-armonica', 'menor-melodica']
  },
  {
    level: 3,
    label: 'Nivel 3 — Modos griegos',
    scaleIds: ['mayor', 'lidio', 'mixolidio', 'menor-natural', 'dorico', 'frigio']
  },
  {
    level: 4,
    label: 'Nivel 4 — Dominantes y Jazz',
    scaleIds: ['mixolidio', 'frigio-dominante', 'lidio-dominante', 'alterada', 'disminuida-st']
  }
];

/**
 * Servicio de dominio puro que resuelve ortografía diatónica estricta de escalas y modos,
 * digitaciones por instrumento (CAGED, 3NPS, Segovia, Simandl/1FPC en bajo 4c/5c),
 * patrones de estudio ABC (sin tablatura), relación acorde-escala y entrenamiento de oído modal.
 */
export class ScaleCatalogService {
  /**
   * Devuelve el listado completo del catálogo de escalas.
   * @returns {Array<object>} Catálogo de 22 escalas/modos.
   */
  getAllScales() {
    return SCALE_CATALOG;
  }

  /**
   * Busca una definición de escala por identificador (o devuelve Mayor como respaldo).
   * @param {string} scaleId Identificador de escala.
   * @returns {object} Definición de escala.
   */
  getScaleById(scaleId) {
    return SCALE_CATALOG.find((s) => s.id === scaleId) || SCALE_CATALOG[0];
  }

  /**
   * Calcula las notas escritas de una escala respetando ortografía diatónica estricta
   * (una letra por grado en escalas heptatónicas; alteraciones coherentes en pentatónicas/simétricas).
   * @param {string} root Raíz americana (ej. "C", "F#", "Bb", "Gb").
   * @param {string} scaleId Identificador de escala.
   * @param {boolean} [preferSharps] Preferencia enarmónica para escalas no heptatónicas.
   * @returns {Array<{ name: string, pc: number, degree: string, interval: number, isRoot: boolean, isCharacteristic: boolean, isAvoid: boolean, isChordTone: boolean }>} Notas resueltas.
   */
  spellScaleNotes(root, scaleId, preferSharps = null) {
    const scale = this.getScaleById(scaleId);
    const cleanRoot = this._normalizeRoot(root);
    const rootPc = NOTE_TO_PC[cleanRoot] ?? 0;
    const useFlats = preferSharps === null ? prefersFlats(cleanRoot) : !preferSharps;

    const charSet = new Set(scale.characteristicIndices || []);
    const avoidSet = new Set(scale.avoidIndices || []);
    const chordSet = new Set(scale.chordToneIndices || []);

    // En escalas heptatónicas (7 notas) se asignan las 7 letras diatónicas consecutivas
    if (scale.heptatonic && scale.intervals.length === 7) {
      const rootLetter = cleanRoot[0];
      const startIdx = DIATONIC_LETTERS.indexOf(rootLetter);
      const spelled = scale.intervals.map((semi, idx) => {
        const targetPc = mod12(rootPc + semi);
        const letter = DIATONIC_LETTERS[(startIdx + idx) % 7];
        const naturalPc = LETTER_TO_PC[letter];
        let diff = mod12(targetPc - naturalPc);
        if (diff > 6) diff -= 12;

        let name;
        if (diff === 0) name = letter;
        else if (diff === 1) name = `${letter}#`;
        else if (diff === -1) name = `${letter}b`;
        else if (diff === 2) name = `${letter}##`;
        else if (diff === -2) name = `${letter}bb`;
        else name = pcToNoteName(targetPc, useFlats);

        return {
          name,
          pc: targetPc,
          degree: scale.degreeLabels[idx] || String(idx + 1),
          interval: semi,
          isRoot: idx === 0,
          isCharacteristic: charSet.has(idx),
          isAvoid: avoidSet.has(idx),
          isChordTone: chordSet.has(idx)
        };
      });

      // Si una raíz extrema produce doble sostenido/bemol (ej. G# menor armónica -> F##),
      // re-enarmonizamos si existe una raíz más limpia o dejamos ortografía exacta sin repetir letras
      const hasDoubleAcc = spelled.some((n) => n.name.includes('##') || n.name.includes('bb'));
      if (hasDoubleAcc) {
        const altRoot = pcToNoteName(rootPc, !cleanRoot.includes('b'));
        if (altRoot !== cleanRoot) {
          const altIdx = DIATONIC_LETTERS.indexOf(altRoot[0]);
          const altSpelled = scale.intervals.map((semi, idx) => {
            const targetPc = mod12(rootPc + semi);
            const letter = DIATONIC_LETTERS[(altIdx + idx) % 7];
            const naturalPc = LETTER_TO_PC[letter];
            let diff = mod12(targetPc - naturalPc);
            if (diff > 6) diff -= 12;
            const acc = diff === 0 ? '' : diff === 1 ? '#' : diff === -1 ? 'b' : diff === 2 ? '##' : 'bb';
            return {
              name: `${letter}${acc}`,
              pc: targetPc,
              degree: scale.degreeLabels[idx] || String(idx + 1),
              interval: semi,
              isRoot: idx === 0,
              isCharacteristic: charSet.has(idx),
              isAvoid: avoidSet.has(idx),
              isChordTone: chordSet.has(idx)
            };
          });
          if (!altSpelled.some((n) => n.name.includes('##') || n.name.includes('bb'))) {
            return altSpelled;
          }
        }
      }
      return spelled;
    }

    // Escalas pentatónicas, blues, bebop, disminuidas, tonos enteros y cromática
    return scale.intervals.map((semi, idx) => {
      const targetPc = mod12(rootPc + semi);
      const deg = scale.degreeLabels[idx] || String(idx + 1);
      // Preferir bemoles en grados con 'b' (b3, b5, b7) y sostenidos en grados con '#' (#4, #5)
      const localFlats = deg.includes('b') ? true : deg.includes('#') ? false : useFlats;
      return {
        name: idx === 0 ? cleanRoot : pcToNoteName(targetPc, localFlats),
        pc: targetPc,
        degree: deg,
        interval: semi,
        isRoot: idx === 0,
        isCharacteristic: charSet.has(idx),
        isAvoid: avoidSet.has(idx),
        isChordTone: chordSet.has(idx)
      };
    });
  }

  /**
   * Resuelve los acordes concretos asociados a la escala en la tonalidad elegida.
   * @param {string} root Raíz americana.
   * @param {string} scaleId Identificador de escala.
   * @returns {Array<{ symbol: string, role: string, root: string, quality: string }>} Acordes asociados.
   */
  getAssociatedChords(root, scaleId) {
    const scale = this.getScaleById(scaleId);
    const cleanRoot = this._normalizeRoot(root);
    const rootPc = NOTE_TO_PC[cleanRoot] ?? 0;
    const spelled = this.spellScaleNotes(cleanRoot, scaleId);
    const pcToSpelled = new Map(spelled.map((n) => [n.pc, n.name]));
    const useFlats = prefersFlats(cleanRoot);

    return (scale.associatedChords || []).map((item) => {
      const pc = mod12(rootPc + item.offset);
      const chordRoot = (pcToSpelled.get(pc) || pcToNoteName(pc, useFlats)).replace(/##|bb/g, (m) => (m === '##' ? '#' : 'b'));
      return {
        root: chordRoot,
        quality: item.quality,
        symbol: `${chordRoot}${item.quality}`,
        role: item.role
      };
    });
  }

  /**
   * Devuelve el nombre de la tonalidad madre relativa (dato secundario de referencia armónica).
   * @param {string} root Raíz americana.
   * @param {string} scaleId Identificador de escala.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {string} Descripción legible de la relación relativa.
   */
  getRelativeParentLabel(root, scaleId, notation = 'americano') {
    const scale = this.getScaleById(scaleId);
    if (!scale.relativeParent) return '';
    const cleanRoot = this._normalizeRoot(root);
    const rootPc = NOTE_TO_PC[cleanRoot] ?? 0;
    const parentPc = mod12(rootPc + (scale.relativeParent.semitoneOffset || 0));
    const parentName = formatChordSymbol(pcToNoteName(parentPc, prefersFlats(cleanRoot)), notation);
    if (scale.relativeParent.semitoneOffset === 0) {
      return scale.relativeParent.modeLabel;
    }
    return `${scale.relativeParent.modeLabel} (${parentName})`;
  }

  /**
   * Sugiere la escala más compatible para un acorde dado (puente Acordes → Escalas).
   * @param {string} chordSymbol Símbolo de acorde americano (ej. "Dm7", "G7", "Am7b5").
   * @returns {{ root: string, scaleId: string }} Raíz y escala sugerida.
   */
  suggestScaleForChord(chordSymbol) {
    const match = String(chordSymbol || 'C').trim().match(/^([A-G][#b]?)(.*)$/);
    if (!match) return { root: 'C', scaleId: 'mayor' };
    const [, root, rawQual] = match;
    const q = rawQual.split('/')[0];

    if (/m7b5|ø/.test(q)) return { root, scaleId: 'locrio-nat2' };
    if (/dim7|°/.test(q)) return { root, scaleId: 'disminuida-ts' };
    if (/mMaj7|m\(maj7\)/.test(q)) return { root, scaleId: 'menor-melodica' };
    if (/7alt|7#5b9|7b9#5/.test(q)) return { root, scaleId: 'alterada' };
    if (/maj7#11|maj9#11/.test(q)) return { root, scaleId: 'lidio' };
    if (/7#11|9#11/.test(q)) return { root, scaleId: 'lidio-dominante' };
    if (/7b9/.test(q)) return { root, scaleId: 'frigio-dominante' };
    if (/aug|\+|7#5/.test(q)) return { root, scaleId: 'tonos-enteros' };
    if (/maj7|maj9|6|add9/.test(q) && !q.startsWith('m')) return { root, scaleId: 'mayor' };
    if (/^m(7|9|11|13|6)/.test(q)) return { root, scaleId: 'dorico' };
    if (/^m$/.test(q)) return { root, scaleId: 'menor-natural' };
    if (/^(7|9|13)/.test(q)) return { root, scaleId: 'mixolidio' };
    return { root, scaleId: 'mayor' };
  }

  /**
   * Devuelve los sistemas de digitación disponibles para el instrumento elegido.
   * @param {string} voicingInstrument Instrumento ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5').
   * @returns {Array<object>} Sistemas de digitación disponibles.
   */
  getFingeringSystems(voicingInstrument) {
    const norm = normalizeVoicingInstrument(voicingInstrument);
    return SCALE_FINGERING_SYSTEMS[norm] || SCALE_FINGERING_SYSTEMS.guitarra;
  }

  /**
   * Calcula los puntos exactos sobre el diapasón SVG (cuerda, traste, nota, grado, dedo 1–4,
   * rol visual y lista de posiciones/cajas disponibles) para el instrumento y sistema elegidos.
   * @param {object} params Parámetros de cálculo.
   * @param {string} params.root Raíz americana.
   * @param {string} params.scaleId ID de escala.
   * @param {string} [params.voicingInstrument='guitarra'] Instrumento activo.
   * @param {string} [params.systemId] Sistema de digitación (caged, 3nps, segovia, caja-1oct, etc.).
   * @param {number} [params.positionIndex=0] Índice de caja/posición seleccionada.
   * @returns {object} Datos completos para renderizar el diapasón SVG sin tablatura.
   */
  computeFretboardLayout({
    root = 'C',
    scaleId = 'mayor',
    voicingInstrument = 'guitarra',
    systemId = null,
    positionIndex = 0
  }) {
    const normInst = normalizeVoicingInstrument(voicingInstrument);
    const tuning = getTuningForVoicingInstrument(normInst);
    const isBass = tuning.instrument === 'bass';
    const systems = this.getFingeringSystems(normInst);
    const activeSystem = systems.find((s) => s.id === systemId) || systems[0];
    const notesMeta = this.spellScaleNotes(root, scaleId);
    const pcMap = new Map(notesMeta.map((n) => [n.pc, n]));
    const rootPc = notesMeta[0]?.pc ?? 0;
    const maxFret = normInst === 'guitarra-clasica' ? 12 : 15;

    // 1) Calcula todas las posiciones de caja disponibles según sistema e instrumento
    const positions = this._buildPositionsForSystem({
      activeSystemId: activeSystem.id,
      normInst,
      tuning,
      rootPc,
      notesMeta,
      maxFret
    });

    const safePosIdx = Math.max(0, Math.min(positions.length - 1, Number(positionIndex) || 0));
    const activePos = positions[safePosIdx] || {
      id: 'all',
      label: 'Todo el mango',
      minFret: 0,
      maxFret,
      hint: ''
    };

    // 2) Recopila todos los puntos del diapasón y marca cuáles pertenecen a la caja/posición activa
    const dots = [];
    const lowRootFret = activePos.minFret;

    for (let sIdx = 0; sIdx < tuning.stringCount; sIdx++) {
      const openMidi = tuning.strings[sIdx];
      // En sistema 3NPS seleccionamos exactamente 3 notas por cuerda a partir de la ventana de posición
      if (activeSystem.id === '3nps' && !isBass && notesMeta.length >= 7 && Array.isArray(activePos.perStringFrets)) {
        const allowedFrets = new Set(activePos.perStringFrets[sIdx] || []);
        for (let fret = 0; fret <= maxFret; fret++) {
          const midi = openMidi + fret;
          const info = pcMap.get(mod12(midi));
          if (!info) continue;
          const inPosition = allowedFrets.has(fret);
          const finger = inPosition
            ? this._assignFinger({ fret, minFret: Math.min(...(activePos.perStringFrets[sIdx] || [fret])), isBass, normInst })
            : null;
          dots.push({
            stringIndex: sIdx,
            fret,
            midi,
            ...info,
            inPosition,
            finger
          });
        }
        continue;
      }

      for (let fret = 0; fret <= maxFret; fret++) {
        const midi = openMidi + fret;
        const info = pcMap.get(mod12(midi));
        if (!info) continue;

        let inPosition = true;
        if (activePos.explicitSet) {
          inPosition = activePos.explicitSet.has(`${sIdx}:${fret}`);
        } else if (activeSystem.id !== 'completo') {
          inPosition = fret >= activePos.minFret && fret <= activePos.maxFret;
          // Permite cuerdas al aire en primera posición/abierta
          if (activePos.allowOpen && fret === 0) inPosition = true;
        }

        const finger = inPosition
          ? this._assignFinger({ fret, minFret: lowRootFret, isBass, normInst, bassSimandl: isBass && activePos.minFret <= 4 })
          : null;

        dots.push({
          stringIndex: sIdx,
          fret,
          midi,
          ...info,
          inPosition,
          finger
        });
      }
    }

    return {
      root: notesMeta[0]?.name || root,
      scale: this.getScaleById(scaleId),
      voicingInstrument: normInst,
      tuning,
      system: activeSystem,
      positions,
      positionIndex: safePosIdx,
      activePosition: activePos,
      maxFret,
      notesMeta,
      dots
    };
  }

  /**
   * Construye las cajas/posiciones específicas del instrumento y sistema de digitación.
   * @param {object} cfg Configuración interna.
   * @returns {Array<object>} Posiciones disponibles.
   */
  _buildPositionsForSystem({ activeSystemId, normInst, tuning, rootPc, notesMeta, maxFret }) {
    const isBass = tuning.instrument === 'bass';
    const pcSet = new Set(notesMeta.map((n) => n.pc));

    if (activeSystemId === 'completo') {
      return [{ id: 'completo', label: `Diapasón completo (0–${maxFret})`, minFret: 0, maxFret, allowOpen: true, hint: 'Todas las notas de la escala en el mango.' }];
    }

    if (activeSystemId === 'abierta' || activeSystemId === 'primera-posicion') {
      return [
        {
          id: 'pos-1',
          label: 'Posición I (trastes 0–4)',
          minFret: 0,
          maxFret: 4,
          allowOpen: true,
          hint: normInst === 'guitarra-clasica'
            ? 'Primera posición clásica con cuerdas al aire; dedos 1–2–3–4 en trastes 1–4.'
            : 'Posición abierta aprovechando cuerdas al aire en trastes 0–4.'
        }
      ];
    }

    // Guitarra: 5 cajas CAGED ancladas alrededor de la raíz en 6.ª cuerda
    if (activeSystemId === 'caged' && !isBass) {
      const rootFret6 = mod12(rootPc - tuning.strings[0]);
      const baseAnchor = rootFret6 === 0 ? 12 : rootFret6;
      const cagedSpecs = [
        { id: 'caged-e', label: 'Forma E (raíz 6.ª)', offset: -1, span: 4, hint: 'Raíz en 6.ª cuerda con dedo 2; enlaza directo con la cejilla forma E.' },
        { id: 'caged-d', label: 'Forma D (raíz 4.ª)', offset: 1, span: 4, hint: 'Raíz en 4.ª cuerda; caja limpia en registro medio.' },
        { id: 'caged-c', label: 'Forma C (raíz 5.ª)', offset: 4, span: 4, hint: 'Raíz en 5.ª cuerda con dedo 4; superpone la forma C.' },
        { id: 'caged-a', label: 'Forma A (raíz 5.ª)', offset: 6, span: 4, hint: 'Raíz en 5.ª cuerda con dedo 1/2; enlaza con la cejilla forma A.' },
        { id: 'caged-g', label: 'Forma G (raíz 6.ª)', offset: 9, span: 4, hint: 'Raíz en 6.ª cuerda con dedo 4; superpone la forma G.' }
      ];
      return cagedSpecs.map((sp) => {
        let minF = mod12(baseAnchor + sp.offset);
        if (minF > 11) minF -= 12;
        const maxF = Math.min(maxFret, minF + sp.span);
        return {
          id: sp.id,
          label: `${sp.label} · tr. ${minF}–${maxF}`,
          minFret: minF,
          maxFret: maxF,
          allowOpen: minF === 0,
          hint: sp.hint
        };
      });
    }

    // Guitarra: 3 notas por cuerda (3NPS) — 7 posiciones desde cada grado en la 6.ª cuerda
    if (activeSystemId === '3nps' && !isBass && notesMeta.length >= 7) {
      const scalePcs = notesMeta.map((n) => n.pc);
      return notesMeta.slice(0, 7).map((degInfo, degIdx) => {
        let startFret6 = mod12(degInfo.pc - tuning.strings[0]);
        if (startFret6 === 0 && degIdx > 0) startFret6 = 12;
        const perStringFrets = [];
        let cursorMidi = tuning.strings[0] + startFret6;
        let minF = Infinity;
        let maxF = 0;

        for (let s = 0; s < tuning.stringCount; s++) {
          const picked = [];
          let m = Math.max(tuning.strings[s], cursorMidi);
          while (picked.length < 3 && m <= tuning.strings[s] + maxFret + 2) {
            if (pcSet.has(mod12(m))) {
              const f = m - tuning.strings[s];
              if (f >= 0 && f <= maxFret) {
                picked.push(f);
                if (f < minF) minF = f;
                if (f > maxF) maxF = f;
              }
            }
            m += 1;
          }
          perStringFrets.push(picked);
          if (picked.length > 0) {
            cursorMidi = tuning.strings[s] + picked[picked.length - 1] + 1;
          }
        }
        return {
          id: `3nps-${degIdx + 1}`,
          label: `Pos. ${degIdx + 1} (desde ${degInfo.degree}: ${degInfo.name})`,
          minFret: Number.isFinite(minF) ? minF : 0,
          maxFret: Math.max(4, maxF),
          perStringFrets,
          hint: `3 notas por cuerda arrancando en grado ${degInfo.degree} (${degInfo.name}). Usá dedos 1–2–4 o 1–3–4.`
        };
      });
    }

    // Guitarra clásica: Esquema tipo Segovia en 2 octavas (traslado limpio posición baja -> media/alta)
    if (activeSystemId === 'segovia') {
      const rootFret6 = mod12(rootPc - tuning.strings[0]);
      const startLow = rootFret6 <= 7 ? rootFret6 : mod12(rootPc - tuning.strings[1]);
      const startString = rootFret6 <= 7 ? 0 : 1;
      const startMidi = tuning.strings[startString] + startLow;
      const explicitSet = new Set();
      let minF = 12;
      let maxF = 0;

      // Recorre 2 octavas exactas asignando la cuerda más ergonómica con cambio de posición gradual
      let curPos = Math.max(1, startLow);
      for (let oct = 0; oct < 2; oct++) {
        for (const semi of notesMeta.map((n) => n.interval)) {
          const targetMidi = startMidi + oct * 12 + semi;
          const spot = this._pickErgonomicSpot(targetMidi, tuning, curPos, 12);
          if (spot) {
            explicitSet.add(`${spot.stringIndex}:${spot.fret}`);
            if (spot.fret > 0) {
              minF = Math.min(minF, spot.fret);
              maxF = Math.max(maxF, spot.fret);
              if (spot.fret > curPos + 3) curPos = spot.fret - 1;
            }
          }
        }
      }
      // Agrega la octava final
      const topSpot = this._pickErgonomicSpot(startMidi + 24, tuning, curPos, 12);
      if (topSpot) {
        explicitSet.add(`${topSpot.stringIndex}:${topSpot.fret}`);
        maxF = Math.max(maxF, topSpot.fret);
      }

      return [
        {
          id: 'segovia-2oct',
          label: `Segovia 2 octavas (tr. ${Math.min(minF, maxF)}–${maxF})`,
          minFret: Math.min(minF, maxF),
          maxFret: maxF,
          explicitSet,
          hint: 'Esquema clásico de 2 octavas: traslado limpio sin aperturas lesivas; practicá alternando i–m y m–a.'
        }
      ];
    }

    // Bajo 4c / 5c: 3 digitaciones de 1 octava (iniciando en dedo 1, dedo 2 o dedo 4)
    if (activeSystemId === 'caja-1oct' && isBass) {
      const eStringIdx = tuning.stringCount === 5 ? 1 : 0;
      const rootOnE = mod12(rootPc - tuning.strings[eStringIdx]);
      const rootFret = rootOnE === 0 ? 12 : rootOnE;
      const rootLow = rootOnE <= 5 ? rootOnE : rootOnE;

      const specs = [
        {
          id: 'bass-f2',
          label: 'Dedo 2 en raíz (posición central)',
          minFret: Math.max(0, rootFret - 1),
          maxFret: Math.min(maxFret, rootFret + 2),
          hint: rootFret <= 4
            ? 'En trastes graves (1–4) aplicá digitación Simandl (1–2–4) para cuidar la muñeca.'
            : 'Posición centrada de 1 dedo por traste (dedo 2 en la raíz): cero desplazamientos.'
        },
        {
          id: 'bass-f1',
          label: 'Dedo 1 en raíz (hacia agudos)',
          minFret: Math.max(0, rootLow),
          maxFret: Math.min(maxFret, rootLow + 3),
          hint: rootLow <= 4
            ? 'Trastes bajos: usá Simandl (1–2–4) con pivote suave en lugar de forzar 1 dedo por traste.'
            : 'Inicia con índice (dedo 1) abriendo la escala hacia trastes más agudos.'
        },
        {
          id: 'bass-f4',
          label: 'Dedo 4 en raíz (hacia graves)',
          minFret: Math.max(0, (rootFret < 3 ? rootFret + 12 : rootFret) - 3),
          maxFret: Math.min(maxFret, rootFret < 3 ? rootFret + 12 : rootFret),
          hint: 'Inicia con meñique (dedo 4) abriendo hacia trastes graves: clave para lectura a primera vista.'
        }
      ];
      return specs.map((sp) => ({
        ...sp,
        label: `${sp.label} · tr. ${sp.minFret}–${sp.maxFret}`,
        allowOpen: sp.minFret === 0
      }));
    }

    // Bajo 4c / 5c: 2 octavas diagonal (en 5c aprovecha B0)
    if (activeSystemId === 'diagonal-2oct' && isBass) {
      const startStr = 0; // E1 en 4c o B0 en 5c
      const startFret = mod12(rootPc - tuning.strings[startStr]);
      const baseMidi = tuning.strings[startStr] + startFret;
      const explicitSet = new Set();
      let minF = 15;
      let maxF = 0;
      let curPos = Math.max(1, startFret);

      for (let oct = 0; oct < 2; oct++) {
        for (const semi of notesMeta.map((n) => n.interval)) {
          const m = baseMidi + oct * 12 + semi;
          const spot = this._pickErgonomicSpot(m, tuning, curPos, maxFret);
          if (spot) {
            explicitSet.add(`${spot.stringIndex}:${spot.fret}`);
            if (spot.fret > 0) {
              minF = Math.min(minF, spot.fret);
              maxF = Math.max(maxF, spot.fret);
              if (spot.fret > curPos + 3) curPos = spot.fret - 1;
            }
          }
        }
      }
      const topSpot = this._pickErgonomicSpot(baseMidi + 24, tuning, curPos, maxFret);
      if (topSpot) {
        explicitSet.add(`${topSpot.stringIndex}:${topSpot.fret}`);
        maxF = Math.max(maxF, topSpot.fret);
      }

      return [
        {
          id: 'bass-2oct',
          label: tuning.stringCount === 5
            ? `2 octavas en 5 cuerdas (tr. ${Math.min(minF, maxF)}–${maxF})`
            : `2 octavas diagonal (tr. ${Math.min(minF, maxF)}–${maxF})`,
          minFret: Math.min(minF, maxF),
          maxFret: maxF,
          explicitSet,
          hint: tuning.stringCount === 5
            ? 'Aprovecha la 5.ª cuerda (Si grave) para cubrir 2 octavas con mínimos desplazamientos.'
            : 'Desplazamiento diagonal controlado en el grado 3 o 5 para enlazar las 2 octavas con limpieza.'
        }
      ];
    }

    return [{ id: 'default', label: `Posición (0–${maxFret})`, minFret: 0, maxFret, allowOpen: true, hint: '' }];
  }

  /**
   * Elige la cuerda y traste más ergonómicos para un MIDI dado cerca de `anchorFret`.
   * @param {number} midi Altura MIDI real deseada.
   * @param {import('../models/Tuning.js').Tuning} tuning Afinación activa.
   * @param {number} anchorFret Traste de referencia de la mano.
   * @param {number} maxFret Traste máximo permitido.
   * @returns {{ stringIndex: number, fret: number }|null} Posición elegida.
   */
  _pickErgonomicSpot(midi, tuning, anchorFret, maxFret) {
    let best = null;
    let bestCost = Infinity;
    for (let s = 0; s < tuning.stringCount; s++) {
      const f = midi - tuning.strings[s];
      if (f < 0 || f > maxFret) continue;
      const dist = f === 0 && anchorFret <= 3 ? 0.5 : Math.abs(f - anchorFret);
      if (dist < bestCost) {
        bestCost = dist;
        best = { stringIndex: s, fret: f };
      }
    }
    return best;
  }

  /**
   * Asigna el dedo de mano izquierda (0 al aire, 1–4) aplicando Simandl (1–2–4) en trastes graves
   * del bajo y 1 dedo por traste en guitarra y registro medio/agudo del bajo.
   * @param {object} cfg Parámetros ({ fret, minFret, isBass, bassSimandl }).
   * @returns {number} Número de dedo (0..4).
   */
  _assignFinger({ fret, minFret, isBass, bassSimandl = false }) {
    if (fret === 0) return 0;
    const base = Math.max(1, minFret);
    const offset = Math.max(0, fret - base);
    if (isBass && (bassSimandl || fret <= 4)) {
      // Regla ergonómica Simandl para escala de 34": 1–2–4 en trastes 1–4 (evita tensión del dedo 3)
      if (offset === 0) return 1;
      if (offset === 1) return 2;
      return 4;
    }
    return Math.min(4, offset + 1);
  }

  /**
   * Calcula los MIDI reales de la secuencia reproducible según patrón de estudio
   * (asc-desc, terceras, grupos-3, grupos-4, arpegios) y modo de menor melódica clásica.
   * @param {object} params Parámetros de generación.
   * @returns {{ midis: number[], droneMidis: number[], labels: string[] }} Secuencia MIDI real + drone modal.
   */
  buildStudySequence({
    root = 'C',
    scaleId = 'mayor',
    voicingInstrument = 'guitarra',
    pattern = 'asc-desc',
    octaves = 1,
    classicalMelodicDesc = false
  }) {
    const scale = this.getScaleById(scaleId);
    const normInst = normalizeVoicingInstrument(voicingInstrument);
    const isBass = normInst === 'bajo' || normInst === 'bajo-5';
    const rootPc = NOTE_TO_PC[this._normalizeRoot(root)] ?? 0;

    // Altura base cómoda dentro del rango físico real del instrumento
    const minMidi = normInst === 'bajo-5' ? 28 : isBass ? 28 : 40;
    let baseMidi = isBass ? 28 + mod12(rootPc - 4) : 40 + mod12(rootPc - 4);
    if (!isBass && baseMidi < 45) baseMidi += 12; // Sitúa guitarras en un rango cálido y cantable
    if (baseMidi < minMidi) baseMidi += 12;

    const octCount = Math.max(1, Math.min(2, Number(octaves) || 1));
    const asc = [];
    for (let o = 0; o < octCount; o++) {
      for (const semi of scale.intervals) {
        asc.push(baseMidi + o * 12 + semi);
      }
    }
    asc.push(baseMidi + octCount * 12);

    // Bajada (en menor melódica clásica desciende como menor natural)
    let descSource = asc;
    if (scale.hasClassicalDualMode && classicalMelodicDesc && Array.isArray(scale.descendingIntervals)) {
      descSource = [];
      for (let o = 0; o < octCount; o++) {
        for (const semi of scale.descendingIntervals) {
          descSource.push(baseMidi + o * 12 + semi);
        }
      }
      descSource.push(baseMidi + octCount * 12);
    }

    let midis = [];
    if (pattern === 'terceras') {
      for (let i = 0; i < asc.length - 2; i++) {
        midis.push(asc[i], asc[i + 2]);
      }
      midis.push(asc[asc.length - 1]);
      for (let i = descSource.length - 1; i >= 2; i--) {
        midis.push(descSource[i], descSource[i - 2]);
      }
      midis.push(descSource[0]);
    } else if (pattern === 'grupos-3') {
      for (let i = 0; i < asc.length - 2; i++) {
        midis.push(asc[i], asc[i + 1], asc[i + 2]);
      }
      for (let i = descSource.length - 1; i >= 2; i--) {
        midis.push(descSource[i], descSource[i - 1], descSource[i - 2]);
      }
    } else if (pattern === 'grupos-4') {
      for (let i = 0; i < asc.length - 3; i++) {
        midis.push(asc[i], asc[i + 1], asc[i + 2], asc[i + 3]);
      }
      for (let i = descSource.length - 1; i >= 3; i--) {
        midis.push(descSource[i], descSource[i - 1], descSource[i - 2], descSource[i - 3]);
      }
    } else if (pattern === 'arpegios') {
      // Arpegios diatónicos (1-3-5-7) sobre los grados de la primera octava
      const degCount = scale.intervals.length;
      const pool = [];
      for (let o = 0; o < 2; o++) {
        for (const semi of scale.intervals) pool.push(baseMidi + o * 12 + semi);
      }
      for (let d = 0; d < Math.min(7, degCount); d++) {
        midis.push(pool[d], pool[d + 2], pool[d + 4], pool[d + 6] ?? pool[d] + 12);
      }
      midis.push(baseMidi + 12);
    } else {
      // asc-desc
      midis = [...asc, ...descSource.slice(0, -1).reverse()];
    }

    // Construye el acorde / pedal modal (drone) resonante en registro grave-medio
    const droneBase = isBass ? baseMidi : Math.max(40, baseMidi - 12);
    const droneOffsets =
      scale.droneChordQuality === 'maj7'
        ? [0, 7, 11, 16]
        : scale.droneChordQuality === 'm7'
          ? [0, 7, 10, 15]
          : scale.droneChordQuality === '7'
            ? [0, 7, 10, 16]
            : scale.droneChordQuality === 'mMaj7'
              ? [0, 7, 11, 15]
              : scale.droneChordQuality === 'm7b5'
                ? [0, 6, 10, 15]
                : scale.droneChordQuality === 'dim7'
                  ? [0, 6, 9, 15]
                  : [0, 7, 12, 16];
    const droneMidis = isBass
      ? [droneBase, droneBase + 7, droneBase + 12]
      : droneOffsets.map((o) => droneBase + o);

    return { midis, droneMidis };
  }

  /**
   * Genera una partitura ABC 100 % válida (sin tablatura, cumpliendo suma exacta de compases
   * y rango físico PitchPolicy) para previsualizar o abrir directamente en el Reproductor.
   * @param {object} params Parámetros del estudio de escala.
   * @returns {string} Partitura en notación ABC.
   */
  buildScalePracticeAbc({
    root = 'C',
    scaleId = 'mayor',
    voicingInstrument = 'guitarra',
    pattern = 'asc-desc',
    octaves = 1,
    classicalMelodicDesc = false,
    rightHandPattern = 'i-m'
  }) {
    const normInst = normalizeVoicingInstrument(voicingInstrument);
    const policyInst = normInst === 'bajo-5' ? 'bajo' : normInst;
    const policy = getPitchPolicy(policyInst);
    const cleanRoot = this._normalizeRoot(root);
    const useFlats = prefersFlats(cleanRoot);
    const { midis } = this.buildStudySequence({
      root: cleanRoot,
      scaleId,
      voicingInstrument: normInst,
      pattern,
      octaves,
      classicalMelodicDesc
    });

    const isTriplet = pattern === 'grupos-3';
    const isClassical = normInst === 'guitarra-clasica';
    const rhTokens = rightHandPattern === 'm-a' ? ['m', 'a'] : rightHandPattern === 'm-i' ? ['m', 'i'] : ['i', 'm'];
    const scaleDef = this.getScaleById(scaleId);
    const droneChord = `${cleanRoot}${scaleDef.droneChordQuality === 'mMaj7' ? 'm' : scaleDef.droneChordQuality || ''}`;

    const tokens = midis.map((soundingMidi, idx) => {
      const clampedSounding = Math.max(policy.minSoundingMidi, Math.min(policy.maxSoundingMidi, soundingMidi));
      const writtenMidi = soundingMidiToWrittenMidi(clampedSounding, policyInst);
      const tok = midiToAbcPitch(writtenMidi, useFlats);
      const rh = isClassical ? `"^${rhTokens[idx % rhTokens.length]}"` : '';
      return `${idx === 0 ? `"${droneChord}"` : ''}${rh}${tok}`;
    });

    // Empaqueta en compases completos (4/4 con corcheas = 8 notas/compás, o 3/4 con 6 corcheas/compás para grupos de 3)
    const timeSig = isTriplet ? '3/4' : '4/4';
    const notesPerBar = isTriplet ? 6 : 8;
    const bars = [];
    for (let i = 0; i < tokens.length; i += notesPerBar) {
      const slice = tokens.slice(i, i + notesPerBar);
      while (slice.length < notesPerBar) {
        slice.push('z');
      }
      bars.push(slice.join(' '));
    }

    const lines = [];
    for (let i = 0; i < bars.length; i += 2) {
      lines.push(bars.slice(i, i + 2).join(' | ') + (i + 2 >= bars.length ? ' |]' : ' |'));
    }

    return [
      'X:1',
      `M:${timeSig}`,
      'L:1/8',
      `K:C clef=${policy.clef}`,
      ...lines
    ].join('\n');
  }

  /**
   * Genera una pregunta de entrenamiento de oído modal en enfoque paralelo (misma raíz + drone).
   * @param {number} [level=1] Nivel de dificultad (1..4).
   * @param {string} [root='C'] Raíz común para todas las opciones.
   * @returns {{ level: number, root: string, answerScale: object, options: Array<object>, midis: number[], droneMidis: number[] }} Pregunta lista.
   */
  generateScaleEarQuestion(level = 1, root = 'C') {
    const spec = SCALE_EAR_LEVELS.find((l) => l.level === Number(level)) || SCALE_EAR_LEVELS[0];
    const options = spec.scaleIds.map((id) => this.getScaleById(id));
    const answerScale = options[Math.floor(Math.random() * options.length)];
    const { midis, droneMidis } = this.buildStudySequence({
      root,
      scaleId: answerScale.id,
      voicingInstrument: 'guitarra',
      pattern: 'asc-desc',
      octaves: 1
    });
    return {
      level: spec.level,
      root: this._normalizeRoot(root),
      answerScale,
      options,
      midis,
      droneMidis
    };
  }

  /**
   * Normaliza una raíz de nota hacia formato americano limpio (ej. "C#", "Bb").
   * @param {string} root Raíz candidata.
   * @returns {string} Raíz válida.
   */
  _normalizeRoot(root) {
    const clean = String(root || 'C').trim().replace('♯', '#').replace('♭', 'b');
    return NOTE_TO_PC[clean] !== undefined ? clean : 'C';
  }
}
