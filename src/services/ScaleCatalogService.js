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
    const scale = this.getScaleById(scaleId);
    const systems = this.getFingeringSystems(normInst);
    const activeSystem = systems.find((s) => s.id === systemId) || systems[0];
    const notesMeta = this.spellScaleNotes(root, scaleId);
    const pcMap = new Map(notesMeta.map((n) => [n.pc, n]));
    const rootPc = notesMeta[0]?.pc ?? 0;
    const baseMaxFret = normInst === 'guitarra-clasica' ? 12 : 15;

    // 1) Calcula todas las posiciones de caja disponibles según sistema, escala e instrumento
    const positions = this._buildPositionsForSystem({
      activeSystemId: activeSystem.id,
      normInst,
      tuning,
      rootPc,
      notesMeta,
      scale,
      maxFret: baseMaxFret
    });

    const safePosIdx = Math.max(0, Math.min(positions.length - 1, Number(positionIndex) || 0));
    const activePos = positions[safePosIdx] || {
      id: 'all',
      label: 'Todo el mango',
      minFret: 0,
      maxFret: baseMaxFret,
      hint: ''
    };
    const effectiveMaxFret = Math.min(20, Math.max(baseMaxFret, activePos.requiredMaxFret || activePos.maxFret || baseMaxFret));

    // 2) Recopila todos los puntos del diapasón y marca cuáles pertenecen a la caja/posición activa
    const dots = [];
    const lowRootFret = activePos.minFret;
    const isFullNeck = activeSystem.id === 'completo';

    for (let sIdx = 0; sIdx < tuning.stringCount; sIdx++) {
      const openMidi = tuning.strings[sIdx];

      for (let fret = 0; fret <= effectiveMaxFret; fret++) {
        const midi = openMidi + fret;
        const info = pcMap.get(mod12(midi));
        if (!info) continue;

        const key = `${sIdx}:${fret}`;
        let inPosition = true;
        if (activePos.explicitSet) {
          inPosition = activePos.explicitSet.has(key);
        } else if (!isFullNeck) {
          inPosition = fret >= activePos.minFret && fret <= activePos.maxFret;
          if (activePos.allowOpen && fret === 0) inPosition = true;
        }

        // En modo "Todo el diapasón" no hay una posición de mano única -> finger = null (M1)
        let finger = null;
        if (inPosition && !isFullNeck) {
          if (activePos.fingerMap && activePos.fingerMap.has(key)) {
            finger = activePos.fingerMap.get(key);
          } else {
            finger = this._assignFinger({
              fret,
              minFret: lowRootFret,
              isBass,
              bassSimandl: isBass && lowRootFret <= 4
            });
          }
        }

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
      scale,
      voicingInstrument: normInst,
      tuning,
      system: activeSystem,
      positions,
      positionIndex: safePosIdx,
      activePosition: activePos,
      maxFret: effectiveMaxFret,
      notesMeta,
      dots
    };
  }

  /**
   * Construye las cajas/posiciones específicas del instrumento y sistema de digitación.
   * @param {object} cfg Configuración interna.
   * @returns {Array<object>} Posiciones disponibles.
   */
  _buildPositionsForSystem({ activeSystemId, normInst, tuning, rootPc, notesMeta, scale, maxFret }) {
    const isBass = tuning.instrument === 'bass';
    const pcSet = new Set(notesMeta.map((n) => n.pc));

    if (activeSystemId === 'completo') {
      return [
        {
          id: 'completo',
          label: `Diapasón completo (0–${maxFret})`,
          minFret: 0,
          maxFret,
          allowOpen: true,
          hint: 'Todas las notas de la escala en el mango (elegí una caja o posición para ver digitación de dedos).'
        }
      ];
    }

    // Posición abierta / 1.ª posición clásica (0–4) eliminando el unísono duplicado 3.ª tr. 4 vs 2.ª al aire (M2)
    if (activeSystemId === 'abierta' || activeSystemId === 'primera-posicion') {
      const explicitSet = new Set();
      const fingerMap = new Map();
      const seenMidis = new Set();
      // Recorre de cuerda aguda a grave para que la 2.ª cuerda al aire (B3) tenga prioridad sobre 3.ª tr. 4
      for (let s = tuning.stringCount - 1; s >= 0; s--) {
        for (let f = 0; f <= 4; f++) {
          const midi = tuning.strings[s] + f;
          if (!pcSet.has(mod12(midi))) continue;
          if (!isBass && s === 3 && f === 4 && seenMidis.has(midi)) continue;
          seenMidis.add(midi);
          const key = `${s}:${f}`;
          explicitSet.add(key);
          fingerMap.set(key, f === 0 ? 0 : Math.min(4, f));
        }
      }
      return [
        {
          id: 'pos-1',
          label: 'Posición I (trastes 0–4)',
          minFret: 0,
          maxFret: 4,
          allowOpen: true,
          explicitSet,
          fingerMap,
          hint: normInst === 'guitarra-clasica'
            ? 'Primera posición clásica con cuerdas al aire (sin unísonos duplicados); dedos 1–2–3–4 en trastes 1–4.'
            : 'Posición abierta aprovechando cuerdas al aire en trastes 0–4.'
        }
      ];
    }

    // Guitarra: 3 notas por cuerda (3NPS) — estrictamente para escalas heptatónicas (C3)
    if (activeSystemId === '3nps' && !isBass) {
      if (!scale?.heptatonic || notesMeta.length !== 7) {
        return this._buildCagedPositions({
          tuning,
          rootPc,
          pcSet,
          maxFret,
          fallbackNotice: '3NPS aplica solo a escalas de 7 notas; se muestran las 5 cajas CAGED para esta escala.'
        });
      }
      return this._build3npsPositions({ tuning, notesMeta, pcSet });
    }

    // Guitarra: 5 cajas CAGED sin unísonos duplicados en G→B y con dedos por posición real de mano (A3)
    if (activeSystemId === 'caged' && !isBass) {
      return this._buildCagedPositions({ tuning, rootPc, pcSet, maxFret });
    }

    // Guitarra clásica: Esquema tipo Segovia en 2 octavas (cerrado, monótono en cuerdas y 2 tramos limpios) (C4)
    if (activeSystemId === 'segovia') {
      return this._buildSegoviaPosition({ tuning, rootPc, notesMeta });
    }

    // Bajo 4c / 5c: 3 digitaciones de 1 octava completa con dedos reales y Simandl 1–2–4 en trastes 1–4 (C1 + A4)
    if (activeSystemId === 'caja-1oct' && isBass) {
      return this._buildBassOneOctavePositions({ tuning, rootPc, notesMeta, maxFret });
    }

    // Bajo 4c / 5c: 2 octavas diagonal en 2 tramos claros (sin tobogán de 8 notas ni amputación en 4c) (C2)
    if (activeSystemId === 'diagonal-2oct' && isBass) {
      return this._buildBassTwoOctavePosition({ tuning, rootPc, notesMeta });
    }

    return [{ id: 'default', label: `Posición (0–${maxFret})`, minFret: 0, maxFret, allowOpen: true, hint: '' }];
  }

  /**
   * Construye las 5 cajas CAGED para guitarra eliminando unísonos duplicados entre cuerdas contiguas
   * (especialmente 3.ª→2.ª G→B) y calculando dedos sobre la posición efectiva de la mano.
   * @param {object} cfg Parámetros CAGED.
   * @returns {Array<object>} 5 posiciones CAGED.
   */
  _buildCagedPositions({ tuning, rootPc, pcSet, maxFret, fallbackNotice = '' }) {
    const rootFret6 = mod12(rootPc - tuning.strings[0]);
    const baseAnchor = rootFret6 === 0 ? 12 : rootFret6;
    const cagedSpecs = [
      { id: 'caged-e', label: 'Forma E (raíz 6.ª)', offset: -1, span: 4, hint: 'Raíz en 6.ª cuerda; enlaza directo con la cejilla forma E.' },
      { id: 'caged-d', label: 'Forma D (raíz 4.ª)', offset: 1, span: 4, hint: 'Raíz en 4.ª cuerda; caja limpia en registro medio.' },
      { id: 'caged-c', label: 'Forma C (raíz 5.ª)', offset: 4, span: 4, hint: 'Raíz en 5.ª cuerda con dedo 4; superpone la forma C.' },
      { id: 'caged-a', label: 'Forma A (raíz 5.ª)', offset: 6, span: 4, hint: 'Raíz en 5.ª cuerda con dedo 1/2; enlaza con la cejilla forma A.' },
      { id: 'caged-g', label: 'Forma G (raíz 6.ª)', offset: 9, span: 4, hint: 'Raíz en 6.ª cuerda con dedo 4; superpone la forma G.' }
    ];

    return cagedSpecs.map((sp) => {
      const nominalMin = mod12(baseAnchor + sp.offset);
      const nominalMax = Math.min(maxFret, nominalMin + sp.span);
      const allowOpen = nominalMin === 0;

      // Recolecta candidatos por cuerda y elimina unísonos duplicados (prefiriendo la cuerda superior)
      const perString = Array.from({ length: tuning.stringCount }, () => []);
      for (let s = 0; s < tuning.stringCount; s++) {
        for (let f = 0; f <= nominalMax; f++) {
          if (f < nominalMin && !(allowOpen && f === 0)) continue;
          if (pcSet.has(mod12(tuning.strings[s] + f))) {
            perString[s].push(f);
          }
        }
      }

      // Elimina unísono exacto cuando el borde derecho de cuerda s coincide con el borde izquierdo de s+1
      for (let s = 0; s < tuning.stringCount - 1; s++) {
        const nextMidis = new Set(perString[s + 1].map((f) => tuning.strings[s + 1] + f));
        perString[s] = perString[s].filter((f) => !nextMidis.has(tuning.strings[s] + f));
      }

      const explicitSet = new Set();
      const fingerMap = new Map();
      const nonZeroFrets = perString.flat().filter((f) => f > 0);
      const actualMin = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : nominalMin;
      const actualMax = nonZeroFrets.length > 0 ? Math.max(...nonZeroFrets) : nominalMax;

      // Si el rango real de trastes pisados ocupa 5 trastes (span 4, ej. 9..13), ancla la mano en actualMin+1
      // dejando actualMin como extensión controlada del dedo 1 y evitando duplicar dedo 4 en los dos últimos trastes
      const handBase = actualMax - actualMin >= 4 ? actualMin + 1 : Math.max(1, actualMin);

      for (let s = 0; s < tuning.stringCount; s++) {
        const frets = perString[s];
        const assigned = this._assignGuitarStringFingers(frets, handBase);
        frets.forEach((f, i) => {
          const key = `${s}:${f}`;
          explicitSet.add(key);
          fingerMap.set(key, assigned[i]);
        });
      }

      const displayMin = allowOpen && perString.some((arr) => arr.includes(0)) ? 0 : actualMin;
      return {
        id: sp.id,
        label: `${sp.label} · tr. ${displayMin}–${actualMax}`,
        minFret: displayMin,
        maxFret: actualMax,
        allowOpen,
        explicitSet,
        fingerMap,
        hint: fallbackNotice ? `${fallbackNotice} ${sp.hint}` : sp.hint
      };
    });
  }

  /**
   * Construye las 7 digitaciones 3NPS (exactamente 3 notas por cuerda) para escalas heptatónicas,
   * expandiendo el traste máximo hasta 19 cuando la posición lo exige y asignando dedos por geometría de cuerda.
   * @param {object} cfg Parámetros 3NPS.
   * @returns {Array<object>} 7 posiciones 3NPS.
   */
  _build3npsPositions({ tuning, notesMeta, pcSet }) {
    const hardLimit = 19;
    return notesMeta.map((degInfo, degIdx) => {
      let startFret6 = mod12(degInfo.pc - tuning.strings[0]);
      // Evita empujar innecesariamente la cuerda al aire al traste 12 si eso haría superar el traste 18
      if (startFret6 === 0 && degIdx > 0) {
        startFret6 = 0;
      }
      const explicitSet = new Set();
      const fingerMap = new Map();
      const perStringFrets = [];
      let cursorMidi = tuning.strings[0] + startFret6;
      let minF = Infinity;
      let maxF = 0;
      let hasWideStretch = false;

      for (let s = 0; s < tuning.stringCount; s++) {
        const picked = [];
        let m = Math.max(tuning.strings[s], cursorMidi);
        while (picked.length < 3 && m <= tuning.strings[s] + hardLimit) {
          if (pcSet.has(mod12(m))) {
            const f = m - tuning.strings[s];
            if (f >= 0 && f <= hardLimit) {
              picked.push(f);
              if (f < minF) minF = f;
              if (f > maxF) maxF = f;
            }
          }
          m += 1;
        }
        perStringFrets.push(picked);
        const fingers = this._assign3npsStringFingers(picked);
        if (picked.length === 3 && picked[2] - picked[0] >= 4 && picked[0] > 0) {
          hasWideStretch = true;
        }
        picked.forEach((f, idx) => {
          const key = `${s}:${f}`;
          explicitSet.add(key);
          fingerMap.set(key, fingers[idx]);
        });
        if (picked.length > 0) {
          cursorMidi = tuning.strings[s] + picked[picked.length - 1] + 1;
        }
      }

      const safeMin = Number.isFinite(minF) ? minF : 0;
      const safeMax = Math.max(4, maxF);
      return {
        id: `3nps-${degIdx + 1}`,
        label: `Pos. ${degIdx + 1} (${degInfo.degree}: ${degInfo.name}) · tr. ${safeMin}–${safeMax}`,
        minFret: safeMin,
        maxFret: safeMax,
        requiredMaxFret: Math.max(15, safeMax),
        perStringFrets,
        explicitSet,
        fingerMap,
        hint: hasWideStretch
          ? `3 notas por cuerda desde ${degInfo.degree} (${degInfo.name}). En patrones tono–tono usá dedos 1–2–4 (apertura controlada).`
          : `3 notas por cuerda desde ${degInfo.degree} (${degInfo.name}). Usá dedos 1–2–4 o 1–3–4 según los semitonos.`
      };
    });
  }

  /**
   * Asigna dedos ergonómicos de guitarra para exactamente 3 notas en una cuerda (3NPS).
   * @param {number[]} frets Trastes ascendentes en la cuerda (ej. [8, 10, 12]).
   * @returns {number[]} Dedos asignados (0..4).
   */
  _assign3npsStringFingers(frets) {
    if (frets.length === 0) return [];
    if (frets.length === 1) return [frets[0] === 0 ? 0 : 1];
    if (frets[0] === 0) {
      const rest = frets.slice(1);
      const base = rest[0] <= 2 ? 1 : rest[0];
      return [0, ...rest.map((f) => Math.min(4, Math.max(1, f - base + 1)))];
    }
    if (frets.length === 2) {
      const diff = frets[1] - frets[0];
      return [1, diff === 1 ? 2 : diff === 2 ? 3 : 4];
    }
    const [f0, f1, f2] = frets;
    const d1 = f1 - f0;
    const d2 = f2 - f0;
    if (d1 === 1 && d2 === 2) return [1, 2, 3]; // semitono–semitono
    if (d1 === 1 && d2 === 3) return [1, 2, 4]; // semitono–tono
    if (d1 === 2 && d2 === 3) return [1, 3, 4]; // tono–semitono
    if (d1 === 2 && d2 === 4) return [1, 2, 4]; // tono–tono (ergonómico: nunca 1-3-4!)
    if (d1 === 1 && d2 >= 4) return [1, 2, 4];  // apertura en 2.ª aumentada
    if (d1 >= 3 && d2 >= 4) return [1, 3, 4];   // 2.ª aumentada inicial (ej. menor armónica)
    return [1, 2, 4];
  }

  /**
   * Asigna dedos de guitarra para un grupo arbitrario de trastes en una cuerda respecto a `handBase`,
   * garantizando que nunca se asigne el mismo dedo (en especial el 4) a dos trastes consecutivos.
   * @param {number[]} frets Trastes ascendentes en la cuerda.
   * @param {number} handBase Traste de referencia para el dedo 1.
   * @returns {number[]} Dedos asignados por traste.
   */
  _assignGuitarStringFingers(frets, handBase) {
    const nonZero = frets.filter((f) => f > 0);
    if (nonZero.length === 3 && nonZero[2] - nonZero[0] >= 4) {
      const mapped = this._assign3npsStringFingers(nonZero);
      let idx = 0;
      return frets.map((f) => (f === 0 ? 0 : mapped[idx++]));
    }
    const result = frets.map((f) => {
      if (f === 0) return 0;
      const offset = f - handBase;
      if (offset <= 0) return 1;
      return Math.min(4, offset + 1);
    });
    // Corrección anti-colisión: nunca dos trastes distintos en la misma cuerda con dedo 4
    for (let i = result.length - 1; i > 0; i--) {
      if (frets[i] > 0 && frets[i - 1] > 0 && result[i] === result[i - 1]) {
        if (result[i] === 4) {
          result[i - 1] = frets[i] - frets[i - 1] >= 2 ? 2 : 3;
        } else if (result[i - 1] === 1 && result[i] === 1) {
          result[i] = 2;
        }
      }
    }
    return result;
  }

  /**
   * Construye el esquema clásico estilo Segovia en 2 octavas para guitarra clásica:
   * - Monotonicidad estricta de cuerda (`s >= prevString`, jamás retrocede de 2.ª a 3.ª).
   * - Posiciones cerradas (sin cuerdas al aire) para homogeneidad tímbrica.
   * - Dos tramos claros (`pos1` y `pos2`) con 1 traslado limpio y dedos calculados localmente por tramo.
   * @param {object} cfg Parámetros Segovia.
   * @returns {Array<object>} Posición Segovia de 2 octavas.
   */
  _buildSegoviaPosition({ tuning, rootPc, notesMeta }) {
    const rootFret6 = mod12(rootPc - tuning.strings[0]);
    const useFifthString = rootFret6 === 0 || rootFret6 > 7;
    const startString = useFifthString ? 1 : 0;
    const startFret = mod12(rootPc - tuning.strings[startString]);
    const startMidi = tuning.strings[startString] + startFret;

    // Construye las 2 octavas exactas (N*2 + 1 notas)
    const targetMidis = [];
    for (let oct = 0; oct < 2; oct++) {
      for (const n of notesMeta) targetMidis.push(startMidi + oct * 12 + n.interval);
    }
    targetMidis.push(startMidi + 24);

    // Tramo 1: ancla baja alrededor de la raíz; Tramo 2: ancla media-alta que permite llegar a la nota tope con dedo 4
    const topMidi = targetMidis[targetMidis.length - 1];
    const topFretOnE1 = topMidi - tuning.strings[5];
    const hardLimit = Math.max(12, Math.min(15, topFretOnE1));
    const pos1 = Math.max(1, startFret > 1 ? startFret - 1 : 1);
    const pos2 = Math.max(pos1, Math.min(hardLimit - 3, Math.max(pos1 + 2, topFretOnE1 - 3)));

    const chosen = [];
    let prevString = startString;
    let inSecondPos = false;
    let notesOnCurrentString = 0;

    for (let idx = 0; idx < targetMidis.length; idx++) {
      const m = targetMidis[idx];
      // Determina si corresponde pasar al 2.º tramo (al llegar a 2.ª/1.ª cuerda o salir de pos1+3)
      if (!inSecondPos && (prevString >= 4 || m - tuning.strings[prevString] > pos1 + 4)) {
        const canShiftHere = m - tuning.strings[Math.min(5, prevString)] >= pos2 && m - tuning.strings[Math.min(5, prevString)] <= pos2 + 3;
        if (canShiftHere || prevString >= 4) {
          inSecondPos = true;
        }
      }

      const activeAnchor = inSecondPos ? pos2 : pos1;
      let best = null;
      let bestCost = Infinity;

      for (let s = prevString; s < tuning.stringCount; s++) {
        const f = m - tuning.strings[s];
        // Esquema cerrado tipo Segovia: evita traste 0 salvo que sea la única opción física
        if (f < 1 || f > hardLimit) continue;
        // Limita a 3 notas por cuerda salvo en la 1.ª cuerda donde puede completar el cierre
        if (s === prevString && s < 5 && notesOnCurrentString >= 3) continue;

        let cost = Math.abs(f - (activeAnchor + 1.5));
        if (f < activeAnchor || f > activeAnchor + 3) cost += 4;
        if (s > prevString + 1) cost += 10; // Evita saltar cuerdas innecesariamente
        if (s === prevString && notesOnCurrentString < 2) cost -= 0.4; // Agrupa 2-3 notas naturales por cuerda
        if (cost < bestCost) {
          bestCost = cost;
          best = { stringIndex: s, fret: f, tramo: inSecondPos ? 2 : 1 };
        }
      }

      // Respaldo absoluto si alguna nota solo existe al aire o fuera de la ventana preferida
      if (!best) {
        for (let s = prevString; s < tuning.stringCount; s++) {
          const f = m - tuning.strings[s];
          if (f >= 0 && f <= hardLimit) {
            best = { stringIndex: s, fret: f, tramo: inSecondPos ? 2 : 1 };
            break;
          }
        }
      }

      if (best) {
        if (best.stringIndex === prevString) {
          notesOnCurrentString += 1;
        } else {
          prevString = best.stringIndex;
          notesOnCurrentString = 1;
        }
        if (best.fret >= pos2 && best.stringIndex >= 4) inSecondPos = true;
        chosen.push(best);
      }
    }

    // Asigna dedos localmente por (cuerda, tramo) para no repetir dedo 4 en la 2.ª octava
    const explicitSet = new Set();
    const fingerMap = new Map();
    const groups = new Map();
    for (const spot of chosen) {
      const gKey = `${spot.stringIndex}:${spot.tramo}`;
      if (!groups.has(gKey)) groups.set(gKey, []);
      groups.get(gKey).push(spot);
    }

    let minF = hardLimit;
    let maxF = 0;
    for (const spots of groups.values()) {
      const frets = spots.map((sp) => sp.fret);
      const localAnchor = spots[0].tramo === 2 ? pos2 : pos1;
      const fingers = this._assignGuitarStringFingers(frets, localAnchor);
      spots.forEach((sp, i) => {
        const key = `${sp.stringIndex}:${sp.fret}`;
        explicitSet.add(key);
        fingerMap.set(key, fingers[i]);
        if (sp.fret > 0) {
          minF = Math.min(minF, sp.fret);
          maxF = Math.max(maxF, sp.fret);
        }
      });
    }

    const safeMin = Math.min(minF, maxF);
    return [
      {
        id: 'segovia-2oct',
        label: `Segovia 2 octavas (Pos. ${pos1} → ${pos2} · tr. ${safeMin}–${maxF})`,
        minFret: safeMin,
        maxFret: maxF,
        requiredMaxFret: Math.max(12, maxF),
        isDiagonal: true,
        subZones: pos2 > pos1
          ? [
              { minFret: pos1, maxFret: Math.min(hardLimit, pos1 + 3) },
              { minFret: pos2, maxFret: Math.min(hardLimit, pos2 + 3) }
            ]
          : [{ minFret: pos1, maxFret: Math.min(hardLimit, pos1 + 3) }],
        explicitSet,
        fingerMap,
        hint: `Esquema clásico cerrado en 2 octavas (Pos. ${pos1} con traslado limpio a Pos. ${pos2}). Practicá alternando i–m y m–a.`
      }
    ];
  }

  /**
   * Construye las 3 cajas de 1 octava completa para bajo (4c y 5c) como `explicitSet` exacto
   * (raíz a octava sin omitir ningún grado), aplicando Simandl (1–2–4) en trastes 1–4 y 1FPC desde traste 5+.
   * @param {object} cfg Parámetros del bajo.
   * @returns {Array<object>} 3 cajas de 1 octava (dedo 2, dedo 1, dedo 4 en raíz).
   */
  _buildBassOneOctavePositions({ tuning, rootPc, notesMeta, maxFret }) {
    const eStringIdx = tuning.stringCount === 5 ? 1 : 0;
    const rootOnE = mod12(rootPc - tuning.strings[eStringIdx]);

    const templates = [
      {
        id: 'bass-f2',
        title: 'Dedo 2 en raíz (posición central)',
        rootFret: rootOnE === 0 ? 12 : rootOnE === 1 ? 13 : rootOnE,
        anchorOffset: -1, // raíz en anchor+1 => dedo 2
        hintLow: 'En trastes graves (1–4) aplicá Simandl (1–2–4) manteniendo la mano relajada.',
        hintHigh: 'Posición centrada con dedo 2 en la raíz (1 dedo por traste desde traste 5+).'
      },
      {
        id: 'bass-f1',
        title: 'Dedo 1 en raíz (hacia agudos)',
        rootFret: rootOnE,
        anchorOffset: 0, // raíz en anchor => dedo 1 (o al aire si 0)
        hintLow: 'Trastes graves: usá Simandl (1–2–4) con pivote controlado cuando la 3.ª o 6.ª mayor pide un traste extra.',
        hintHigh: 'Inicia con índice (dedo 1) abriendo hacia trastes agudos con extensión controlada del meñique.'
      },
      {
        id: 'bass-f4',
        title: 'Dedo 4 en raíz (hacia graves)',
        rootFret: rootOnE < 3 ? rootOnE + 12 : rootOnE,
        anchorOffset: -3, // raíz en anchor+3 => dedo 4
        hintLow: 'Inicia con meñique (dedo 4) abriendo hacia trastes graves; aplicá Simandl (1–2–4) en trastes 1–4.',
        hintHigh: 'Inicia con meñique (dedo 4) abriendo hacia trastes graves: clave para lectura y walking bass.'
      }
    ];

    return templates.map((tpl) => {
      const startMidi = tuning.strings[eStringIdx] + tpl.rootFret;
      const handAnchor = Math.max(1, tpl.rootFret + tpl.anchorOffset);
      const allowOpen = tpl.rootFret === 0;
      const targetMidis = [...notesMeta.map((n) => startMidi + n.interval), startMidi + 12];
      const hardLimit = Math.max(maxFret, tpl.rootFret + 4);

      const chosen = [];
      let prevString = eStringIdx;

      for (let i = 0; i < targetMidis.length; i++) {
        const m = targetMidis[i];
        if (i === 0) {
          chosen.push({ stringIndex: eStringIdx, fret: tpl.rootFret });
          continue;
        }

        let best = null;
        let bestCost = Infinity;
        for (let s = prevString; s < tuning.stringCount; s++) {
          const f = m - tuning.strings[s];
          if (f < 0 || f > hardLimit) continue;
          if (f === 0 && !allowOpen && handAnchor > 2) continue;

          // Ventana ideal de 4 trastes [handAnchor, handAnchor+3]; permite ±1 de extensión controlada para no omitir grados
          let cost = 0;
          if (f === 0 && allowOpen) {
            cost = 0.2;
          } else if (f >= handAnchor && f <= handAnchor + 3) {
            cost = Math.abs(f - (handAnchor + 1.5)) * 0.4;
          } else if (f === handAnchor - 1 || f === handAnchor + 4) {
            cost = 2.6;
          } else {
            cost = 8 + Math.abs(f - handAnchor);
          }
          if (s > prevString + 1) cost += 6;
          if (cost < bestCost) {
            bestCost = cost;
            best = { stringIndex: s, fret: f };
          }
        }
        if (best) {
          prevString = best.stringIndex;
          chosen.push(best);
        }
      }

      const explicitSet = new Set();
      const fingerMap = new Map();
      const byString = new Map();
      let minF = hardLimit;
      let maxF = 0;

      for (const spot of chosen) {
        if (!byString.has(spot.stringIndex)) byString.set(spot.stringIndex, []);
        byString.get(spot.stringIndex).push(spot.fret);
        if (spot.fret < minF) minF = spot.fret;
        if (spot.fret > maxF) maxF = spot.fret;
      }

      for (const [sIdx, frets] of byString.entries()) {
        const fingers = this._assignBassStringFingers(frets, handAnchor, sIdx === eStringIdx ? tpl.id : null);
        frets.forEach((f, idx) => {
          const key = `${sIdx}:${f}`;
          explicitSet.add(key);
          fingerMap.set(key, fingers[idx]);
        });
      }

      return {
        id: tpl.id,
        label: `${tpl.title} · tr. ${minF}–${maxF}`,
        minFret: minF,
        maxFret: maxF,
        requiredMaxFret: Math.max(15, maxF),
        allowOpen,
        explicitSet,
        fingerMap,
        hint: minF <= 4 ? tpl.hintLow : tpl.hintHigh
      };
    });
  }

  /**
   * Construye el recorrido de 2 octavas en bajo (4c o 5c) con planificación diagonal balanceada:
   * - En 5c usa B0 cuando la raíz está en trastes 0–7, o E1 si supera el traste 7.
   * - En 4c amplía el traste máximo hasta 20 para completar las 2 octavas en todas las tonalidades (incl. C, D y Eb).
   * - Distribuye equilibradamente las notas entre todas las cuerdas útiles (4–4–4–3 en 4c, 3×5 en 5c)
   *   evitando el tobogán de 7–8 notas en la 1.ª cuerda, con dedos calculados por sub-posición local.
   * @param {object} cfg Parámetros del bajo.
   * @returns {Array<object>} Posición de 2 octavas.
   */
  _buildBassTwoOctavePosition({ tuning, rootPc, notesMeta }) {
    const is5String = tuning.stringCount === 5;
    let startStr = 0;
    if (is5String) {
      const rootOnB = mod12(rootPc - tuning.strings[0]);
      startStr = rootOnB <= 7 ? 0 : 1;
    }
    const startFret = mod12(rootPc - tuning.strings[startStr]);
    const baseMidi = tuning.strings[startStr] + startFret;

    const targetMidis = [];
    for (let oct = 0; oct < 2; oct++) {
      for (const n of notesMeta) targetMidis.push(baseMidi + oct * 12 + n.interval);
    }
    targetMidis.push(baseMidi + 24);

    const lastStr = tuning.stringCount - 1;
    const numStrings = lastStr - startStr + 1;
    const topMidi = targetMidis[targetMidis.length - 1];
    const topFretOnG = topMidi - tuning.strings[lastStr];
    const hardLimit = Math.min(20, Math.max(15, topFretOnG));

    const totalNotes = targetMidis.length;
    const maxPerStr = Math.ceil(totalNotes / numStrings);
    const startAnchor = Math.max(1, startFret);
    const endAnchor = Math.max(1, Math.min(hardLimit - 3, topFretOnG - 3));
    const strAnchor = (s) => {
      const t = numStrings > 1 ? (s - startStr) / (numStrings - 1) : 0;
      return startAnchor + t * (endAnchor - startAnchor);
    };

    // Programación dinámica sobre (índice de nota, cuerda, cantidad en cuerda, traste previo)
    let states = new Map();
    states.set(`${startStr}:1:${startFret}`, {
      cost: 0,
      path: [{ stringIndex: startStr, fret: startFret }]
    });

    for (let i = 1; i < totalNotes; i++) {
      const m = targetMidis[i];
      const next = new Map();
      for (const [key, st] of states.entries()) {
        const [ps, pcnt, pf] = key.split(':').map(Number);
        for (let s = ps; s <= Math.min(lastStr, ps + 1); s++) {
          const f = m - tuning.strings[s];
          if (f < 0 || f > hardLimit) continue;
          if (f === 0 && startAnchor > 3) continue;
          const cnt = s === ps ? pcnt + 1 : 1;
          if (cnt > maxPerStr + 2) continue;

          let stepCost = Math.abs(f - (strAnchor(s) + 1.5)) * 0.6;
          if (cnt > maxPerStr) stepCost += s === lastStr ? 20 : 12;
          if (s > ps) {
            const drop = pf - f;
            if (drop > 4) stepCost += (drop - 4) * 4;
            if (drop < 0) stepCost += Math.abs(drop) * 3;
            if (pcnt === 1) stepCost += 8;
          } else {
            const firstOnStr = st.path[st.path.length - pcnt].fret;
            const span = f - firstOnStr;
            const comfySpan = firstOnStr <= 4 ? 3 : 4;
            if (span > comfySpan + 2) stepCost += (span - comfySpan) * 3;
          }

          const nKey = `${s}:${cnt}:${f}`;
          const totalCost = st.cost + stepCost;
          const cur = next.get(nKey);
          if (!cur || totalCost < cur.cost) {
            next.set(nKey, { cost: totalCost, path: [...st.path, { stringIndex: s, fret: f }] });
          }
        }
      }
      if (next.size > 0) states = next;
    }

    let bestState = null;
    for (const st of states.values()) {
      if (!bestState || st.cost < bestState.cost) bestState = st;
    }
    const chosen = bestState ? bestState.path : [];

    const explicitSet = new Set();
    const fingerMap = new Map();
    const byString = new Map();
    let minF = hardLimit;
    let maxF = 0;

    for (const spot of chosen) {
      if (!byString.has(spot.stringIndex)) byString.set(spot.stringIndex, []);
      byString.get(spot.stringIndex).push(spot.fret);
      if (spot.fret > 0) minF = Math.min(minF, spot.fret);
      if (spot.fret > maxF) maxF = spot.fret;
    }

    for (const [sIdx, frets] of byString.entries()) {
      const localAnchor = Math.max(1, frets.find((f) => f > 0) ?? 1);
      const fingers = this._assignBassStringFingers(frets, localAnchor);
      frets.forEach((f, idx) => {
        const key = `${sIdx}:${f}`;
        explicitSet.add(key);
        fingerMap.set(key, fingers[idx]);
      });
    }

    const safeMin = Math.min(minF, maxF);
    const pos1 = Math.max(1, startFret > 1 ? startFret : safeMin);
    const pos2 = Math.max(pos1, Math.min(hardLimit - 3, maxF - 3));
    const subZones = pos2 > pos1 + 1
      ? [
          { minFret: pos1, maxFret: Math.min(hardLimit, pos1 + 3) },
          { minFret: pos2, maxFret: Math.min(hardLimit, pos2 + 3) }
        ]
      : [{ minFret: safeMin, maxFret: Math.min(hardLimit, Math.max(maxF, safeMin + 3)) }];

    return [
      {
        id: 'bass-2oct',
        label: is5String
          ? `2 octavas en 5 cuerdas (Pos. ${pos1}${pos2 > pos1 + 1 ? ` → ${pos2}` : ''} · tr. ${safeMin}–${maxF})`
          : `2 octavas diagonal (Pos. ${pos1} → ${pos2} · tr. ${safeMin}–${maxF})`,
        minFret: safeMin,
        maxFret: maxF,
        requiredMaxFret: Math.max(15, maxF),
        isDiagonal: true,
        subZones,
        explicitSet,
        fingerMap,
        hint: is5String
          ? `Aprovecha la 5.ª cuerda (${startStr === 0 ? 'Si grave' : 'Mi'}) en recorrido balanceado (tr. ${safeMin}–${maxF}) sin sobrecargar la 1.ª cuerda.`
          : `Recorrido diagonal balanceado (3–4 notas por cuerda, tr. ${safeMin}–${maxF}) con traslados limpios hacia Pos. ${pos2}.`
      }
    ];
  }

  /**
   * Asigna dedos de bajo para las notas de una cuerda respetando Simandl (1–2–4, sin dedo 3)
   * en trastes graves 1–4 y 1 dedo por traste (1–2–3–4) desde traste 5+, sin duplicar jamás un dedo
   * en dos trastes consecutivos de la misma cuerda (A4). Si la cuerda abarca más de una posición
   * (ej. recorrido diagonal de 2 octavas), divide automáticamente en sub-posiciones locales limpias.
   * @param {number[]} frets Trastes ascendentes en la cuerda.
   * @param {number} handAnchor Traste base local de la mano.
   * @param {string|null} [rootBoxId=null] Identificador de caja si es la cuerda de la raíz.
   * @returns {number[]} Dedos asignados (0..4).
   */
  _assignBassStringFingers(frets, handAnchor, rootBoxId = null) {
    const nonZero = frets.filter((f) => f > 0);
    if (nonZero.length === 0) return frets.map(() => 0);

    const span = nonZero[nonZero.length - 1] - nonZero[0];
    const maxSingleSpan = nonZero[0] <= 4 ? 3 : 4;

    // Si la cuerda excede 4 dedos o una posición cómoda (ej. 4+ notas diagonales / cromática), divide en sub-grupos locales
    if (nonZero.length > 4 || (nonZero.length >= 4 && span > maxSingleSpan)) {
      const splitIdx = Math.ceil(nonZero.length / 2);
      const firstHalf = this._assignBassStringFingers(nonZero.slice(0, splitIdx), nonZero[0], rootBoxId);
      const secondHalf = this._assignBassStringFingers(nonZero.slice(splitIdx), nonZero[splitIdx], null);
      const combined = [...firstHalf, ...secondHalf];
      let k = 0;
      return frets.map((x) => (x === 0 ? 0 : combined[k++]));
    }

    const isLowZone = Math.min(...nonZero) <= 4 && Math.max(...nonZero) <= 5;
    if (isLowZone) {
      // Simandl estricto en trastes 1–4: nunca dedo 3, nunca repetir dedo 4 en trastes consecutivos
      if (nonZero.length === 1) {
        const f = nonZero[0];
        const d = rootBoxId === 'bass-f4' ? 4 : rootBoxId === 'bass-f2' && f >= 2 ? 2 : f - handAnchor >= 2 ? 4 : f - handAnchor === 1 ? 2 : 1;
        return frets.map((x) => (x === 0 ? 0 : d));
      }
      if (nonZero.length === 2) {
        const diff = nonZero[1] - nonZero[0];
        const pair = diff === 1 ? [1, 2] : [1, 4];
        let k = 0;
        return frets.map((x) => (x === 0 ? 0 : pair[k++]));
      }
      const seq = nonZero.length === 3 ? [1, 2, 4] : [1, 2, 1, 4];
      let k = 0;
      return frets.map((x) => (x === 0 ? 0 : seq[Math.min(k++, seq.length - 1)]));
    }

    // Desde traste 5+: 1 dedo por traste (1FPC: 1–2–3–4), evitando repetir dedos en trastes consecutivos
    const base = Math.max(1, Math.min(nonZero[0], Math.max(handAnchor, nonZero[nonZero.length - 1] - 3)));
    const result = frets.map((f) => {
      if (f === 0) return 0;
      const offset = f - base;
      if (offset <= 0) return 1;
      return Math.min(4, offset + 1);
    });
    for (let i = result.length - 1; i > 0; i--) {
      if (frets[i] > 0 && frets[i - 1] > 0 && result[i] === result[i - 1]) {
        if (result[i] === 4) result[i - 1] = frets[i] - frets[i - 1] >= 2 ? 2 : 3;
        else if (result[i - 1] === 1) result[i] = 2;
        else result[i - 1] = Math.max(1, result[i] - 1);
      }
    }
    return result;
  }

  /**
   * Asigna el dedo de mano izquierda de respaldo (0 al aire, 1–4) aplicando Simandl (1–2–4)
   * en trastes graves del bajo y 1 dedo por traste en guitarra y registro medio/agudo del bajo.
   * @param {object} cfg Parámetros ({ fret, minFret, isBass, bassSimandl }).
   * @returns {number} Número de dedo (0..4).
   */
  _assignFinger({ fret, minFret, isBass, bassSimandl = false }) {
    if (fret === 0) return 0;
    const base = Math.max(1, minFret);
    const offset = Math.max(0, fret - base);
    if (isBass && (bassSimandl || fret <= 4)) {
      if (offset === 0) return 1;
      if (offset === 1) return 2;
      return 4;
    }
    return Math.min(4, offset + 1);
  }

  /**
   * Calcula los MIDI reales de la secuencia reproducible según patrón de estudio
   * (asc-desc, terceras, grupos-3, grupos-4, arpegios) y modo de menor melódica clásica.
   * Acepta `preferredBaseMidi` para sincronizar la octava reproducida con la caja visible en el diapasón.
   * @param {object} params Parámetros de generación.
   * @returns {{ midis: number[], droneMidis: number[] }} Secuencia MIDI real + drone modal.
   */
  buildStudySequence({
    root = 'C',
    scaleId = 'mayor',
    voicingInstrument = 'guitarra',
    pattern = 'asc-desc',
    octaves = 1,
    classicalMelodicDesc = false,
    preferredBaseMidi = null
  }) {
    const scale = this.getScaleById(scaleId);
    const normInst = normalizeVoicingInstrument(voicingInstrument);
    const isBass = normInst === 'bajo' || normInst === 'bajo-5';
    const rootPc = NOTE_TO_PC[this._normalizeRoot(root)] ?? 0;

    // Altura base cómoda dentro del rango físico real del instrumento (alineada a la caja si se provee)
    const minMidi = normInst === 'bajo-5' ? 23 : isBass ? 28 : 40;
    const maxStartMidi = isBass ? 48 : 64;
    let baseMidi = isBass ? 28 + mod12(rootPc - 4) : 40 + mod12(rootPc - 4);
    if (!isBass && baseMidi < 45) baseMidi += 12;
    if (baseMidi < minMidi) baseMidi += 12;
    if (
      Number.isFinite(preferredBaseMidi) &&
      mod12(preferredBaseMidi) === rootPc &&
      preferredBaseMidi >= minMidi &&
      preferredBaseMidi <= maxStartMidi
    ) {
      baseMidi = preferredBaseMidi;
    }

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
