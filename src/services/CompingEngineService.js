import { getChordVoicingMidi, parseChord } from '../core/MusicTheory.js';

/**
 * Modos de ejecución del motor de acompañamiento (comping).
 * - 'fijo': patrón regular y predecible idéntico en cada compás (ideal para lectura y pulso base).
 * - 'organico': células rítmicas multi-compás con aire, anticipaciones, bajo caminante con aproximación
 *   cromática al siguiente acorde y micro-humanización sutil.
 * - 'vivo': suma movimiento armónico interno dentro del mismo acorde (tensiones 9/13/6, inversiones
 *   suaves, adorno blues IV/I en tiempos débiles y side-slipping cromático breve).
 */
export const COMPING_FEEL_MODES = [
  {
    id: 'fijo',
    label: 'Fijo',
    description: 'Patrón rítmico regular y predecible en cada compás (ideal para lectura estricta).'
  },
  {
    id: 'organico',
    label: 'Orgánico',
    description: 'Fraseo con aire, células de 2–4 compases, anticipaciones y bajo caminante real.'
  },
  {
    id: 'vivo',
    label: 'Vivo',
    description: 'Estilo pianista/guitarrista de jazz y blues: coloraciones 9/13, inversiones y adornos sin romper la armonía.'
  }
];

/**
 * Normaliza un identificador de feel de comping a una de las 3 opciones válidas.
 * @param {string} mode Modo candidato.
 * @returns {'fijo'|'organico'|'vivo'} Modo normalizado.
 */
export function normalizeCompingFeel(mode) {
  if (mode === 'fijo' || mode === 'organico' || mode === 'vivo') return mode;
  return 'organico';
}

/**
 * Normaliza variantes de nombre de patrón a su familia estilística principal.
 * @param {string} pattern Identificador de patrón.
 * @returns {string} Familia normalizada.
 */
function normalizePatternFamily(pattern) {
  const p = String(pattern || 'negras-abajo');
  if (p === 'blues-shuffle' || p === 'shuffle') return 'shuffle';
  if (p === 'swing-negras') return 'swing-negras';
  if (p === 'bossa') return 'bossa';
  if (p === 'tango-marcato') return 'tango-marcato';
  if (p === 'balada-lenta' || p === 'balada-arpegio') return 'balada-lenta';
  if (p === 'rasgueo-balada' || p === 'pop-sincopa') return 'rasgueo-balada';
  if (p === 'vals') return 'vals';
  if (p === 'funk-16') return 'funk-16';
  if (p === 'rock-corcheas') return 'rock-corcheas';
  if (p === 'arpegio-pima' || p === 'arpegio-asc') return p;
  if (p === 'bloque') return 'bloque';
  return 'negras-abajo';
}

/**
 * Resuelve la raíz real en registro de contrabajo / bajo eléctrico (E1..D#2 = MIDI 28..39).
 * @param {string} chordSymbol Símbolo de acorde.
 * @returns {number|null} Número MIDI de la raíz o null.
 */
export function resolveBassRootMidi(chordSymbol) {
  if (!chordSymbol) return null;
  const v = getChordVoicingMidi(chordSymbol, 40);
  if (!v || !Number.isFinite(v.bassMidi)) return null;
  let root = v.bassMidi;
  while (root >= 40) root -= 12;
  while (root < 28) root += 12;
  return root;
}

/**
 * Calcula un desplazamiento determinista pequeño para micro-humanización (sin aleatoriedad caótica).
 * @param {number} chorusIndex Número de vuelta/coro (0, 1, 2...).
 * @param {number} barIndex Índice de compás.
 * @param {number} hitIndex Índice del golpe dentro del compás.
 * @returns {{ humanizeMs: number, velFactor: number }} Micro-ajuste de tiempo (-5..+11 ms) y volumen (0.93..1.05).
 */
export function computeHumanizeOffset(chorusIndex = 0, barIndex = 0, hitIndex = 0) {
  const seed = Math.abs((chorusIndex * 37 + barIndex * 13 + hitIndex * 7 + 5) % 17);
  const norm = seed / 16; // 0..1
  return {
    humanizeMs: Math.round((norm - 0.32) * 16), // ~ -5ms a +11ms
    velFactor: Number((0.93 + norm * 0.12).toFixed(3))
  };
}

/**
 * Analiza el contexto armónico de un evento dentro de la lista completa de acordes de la timeline:
 * detecta compases consecutivos del mismo acorde, si el siguiente evento cambia de acorde y
 * cuál es la raíz siguiente para anticipaciones y aproximaciones de bajo.
 * @param {Array<object>} chords Lista de eventos armónicos de la timeline.
 * @param {number} index Índice del evento actual.
 * @param {number} [beatsPerMeasure=4] Pulsos por compás.
 * @param {number} [chorusIndex=0] Índice de vuelta/coro actual en bucle.
 * @returns {object} Contexto enriquecido.
 */
export function analyzeChordContext(chords = [], index = 0, beatsPerMeasure = 4, chorusIndex = 0) {
  const cur = chords[index] || {};
  const bpm = Math.max(1, Number(beatsPerMeasure) || 4);
  const baseBarIndex = Math.max(0, (Number(cur.measureIndex) || Math.floor((Number(cur.beat) || 0) / bpm) + 1) - 1);

  // Cuenta cuántos eventos contiguos hacia atrás y hacia adelante comparten el mismo símbolo
  let prevSameBars = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (chords[i]?.symbol !== cur.symbol) break;
    prevSameBars += Math.max(1, Math.round((Number(chords[i]?.durationBeats) || bpm) / bpm));
  }
  let nextSameBars = 0;
  let nextDifferentEvent = null;
  for (let i = index + 1; i < chords.length; i++) {
    if (chords[i]?.symbol === cur.symbol) {
      nextSameBars += Math.max(1, Math.round((Number(chords[i]?.durationBeats) || bpm) / bpm));
    } else {
      nextDifferentEvent = chords[i];
      break;
    }
  }
  // En vuelta en bucle, si no hay cambio posterior miramos el inicio del tema
  if (!nextDifferentEvent && chords.length > 1 && chords[0]?.symbol !== cur.symbol) {
    nextDifferentEvent = chords[0];
  }

  const nextEvent = chords[index + 1] || (chords.length > 1 ? chords[0] : null);
  const nextChordSymbol = nextEvent?.symbol || null;
  const nextVoicingMidis = Array.isArray(nextEvent?.voicingMidis) && nextEvent.voicingMidis.length > 0
    ? nextEvent.voicingMidis
    : (nextChordSymbol ? (getChordVoicingMidi(nextChordSymbol, 52)?.chordMidis || []) : []);

  const ownBars = Math.max(1, Math.round((Number(cur.durationBeats) || bpm) / bpm));
  const consecutiveTotalBars = prevSameBars + ownBars + nextSameBars;

  return {
    barIndex: baseBarIndex,
    chorusIndex: Math.max(0, Number(chorusIndex) || 0),
    prevSameBars,
    ownBars,
    consecutiveTotalBars,
    nextChordSymbol,
    nextVoicingMidis,
    nextRootMidi: resolveBassRootMidi(nextChordSymbol),
    changesAfterEvent: Boolean(nextChordSymbol && nextChordSymbol !== cur.symbol),
    nextDifferentSymbol: nextDifferentEvent?.symbol || nextChordSymbol
  };
}

/**
 * Genera una variación armónicamente compatible del voicing para el modo 'vivo', sin salir
 * jamás de la función del acorde ni violar el Low Interval Limit (piso MIDI 48 para acordes).
 * @param {object} params Parámetros.
 * @param {number[]} params.baseMidis Alturas MIDI originales del voicing.
 * @param {string} params.chordSymbol Símbolo del acorde actual.
 * @param {'base'|'color9'|'color13'|'invUp'|'bluesNeighbor'|'sideSlipUp'|'sideSlipDown'} params.variant Tipo de coloración.
 * @returns {number[]} Alturas MIDI variadas y ordenadas.
 */
export function buildVariedVoicing({ baseMidis = [], chordSymbol = 'C', variant = 'base' }) {
  const sorted = [...baseMidis].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0 || variant === 'base') return sorted;

  const parsed = parseChord(chordSymbol);
  const quality = String(parsed?.quality || '').toLowerCase();
  const rootPc = Number.isFinite(parsed?.rootPc) ? ((parsed.rootPc % 12) + 12) % 12 : ((sorted[0] % 12) + 12) % 12;

  if (variant === 'sideSlipUp' || variant === 'sideSlipDown') {
    const delta = variant === 'sideSlipUp' ? 1 : -1;
    // Solo desplazamos las notas superiores (o todo el bloque si tiene <=3 notas), respetando LIL >= 48
    return sorted.map((m) => Math.max(48, Math.min(84, m + delta)));
  }

  if (variant === 'invUp' && sorted.length >= 3) {
    // Sube la voz más grave (si no genera un acorde demasiado agudo) o rota la 2.ª voz para melodía superior
    const out = [...sorted];
    const candidate = out[0] + 12;
    if (candidate <= 81) {
      out.shift();
      out.push(candidate);
      return out.sort((a, b) => a - b);
    }
    return sorted;
  }

  if (variant === 'bluesNeighbor' && sorted.length >= 3) {
    // Truco clásico de blues/gospel en acorde dominante o mayor (I7 ↔ IV/I): sube la 3.ª (+1 st a 4.ª) y 5.ª (+2 st a 6.ª) manteniendo raíz/7.ª
    const out = sorted.map((m) => {
      const iv = ((m % 12) - rootPc + 12) % 12;
      if (iv === 4) return m + 1; // 3M -> 4J
      if (iv === 7) return m + 2; // 5J -> 6M
      return m;
    });
    return [...new Set(out)].sort((a, b) => a - b);
  }

  if (variant === 'color9' || variant === 'color13') {
    // No añadimos 9M/13M a acordes disminuidos o semidisminuidos alterados que choquen
    if (quality.includes('dim') || quality.includes('b9') || quality.includes('m7b5')) {
      return sorted;
    }
    const top = sorted[sorted.length - 1];
    const targetInterval = variant === 'color13' && !quality.includes('m') ? 9 : 2; // 13.ª (9 st) en dom/maj, 9.ª (2 st) en todos
    // Busca la nota de color más cercana por encima del voicing sin pasarse de C6 (84)
    let colorMidi = rootPc + targetInterval;
    while (colorMidi <= top) colorMidi += 12;
    if (colorMidi > 81) colorMidi -= 12;
    if (colorMidi < 55) colorMidi += 12;
    // Reemplaza la duplicación de raíz si hay >=4 notas o la suma si hay 3 notas
    const out = sorted.length >= 4 ? [...sorted.slice(0, -1), colorMidi] : [...sorted, colorMidi];
    return [...new Set(out)].sort((a, b) => a - b);
  }

  return sorted;
}

/**
 * Células rítmicas de comping de 1 compás (en pulsos de negra sobre 4/4) organizadas por estilo.
 * Cada hit define:
 * - `offset`: pulso relativo dentro del compás (0..beatsInBar)
 * - `dur`: duración en pulsos de negra
 * - `mode`: 'block' | 'strum-down' | 'strum-up' | 'bass' | 'upper'
 * - `accent`: escala de volumen
 * - `variant`: coloración opcional en modo 'vivo'
 * - `anticipateNext`: si true y cambia el acorde al compás siguiente, usa el voicing del próximo acorde!
 */
const ORGANIC_CELLS = {
  // Blues shuffle (corchea atresillada 2/3 = 0.67): frases con aire y respuestas, nunca martilleo monótono
  shuffle: [
    // Célula 0 (c.1 — entrada firme con aire)
    [
      { offset: 0, dur: 0.9, mode: 'strum-down', accent: 0.98, variant: 'base' },
      { offset: 1.67, dur: 0.35, mode: 'strum-up', accent: 0.68, variant: 'color9' },
      { offset: 2, dur: 1.15, mode: 'block', accent: 0.86, variant: 'base' }
    ],
    // Célula 1 (c.2 — respuesta corta tipo pianista de blues en 2 y 4 con adorno vecino)
    [
      { offset: 1, dur: 0.45, mode: 'block', accent: 0.82, variant: 'bluesNeighbor' },
      { offset: 2.67, dur: 0.32, mode: 'strum-up', accent: 0.65, variant: 'base' },
      { offset: 3, dur: 0.65, mode: 'strum-down', accent: 0.9, variant: 'color13' }
    ],
    // Célula 2 (c.3 — empuje sincopado con side-slip breve en vivo)
    [
      { offset: 0.67, dur: 0.3, mode: 'block', accent: 0.58, variant: 'sideSlipDown' },
      { offset: 1, dur: 0.95, mode: 'strum-down', accent: 0.92, variant: 'invUp' },
      { offset: 2.67, dur: 0.8, mode: 'block', accent: 0.84, variant: 'color9' }
    ],
    // Célula 3 (c.4 — preparación / fill hacia el siguiente acorde con anticipación opcional en 3.67)
    [
      { offset: 0, dur: 0.55, mode: 'strum-down', accent: 0.92, variant: 'base' },
      { offset: 1.67, dur: 0.3, mode: 'strum-up', accent: 0.64, variant: 'bluesNeighbor' },
      { offset: 2, dur: 0.55, mode: 'block', accent: 0.84, variant: 'color13' },
      { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.88, variant: 'base', anticipateNext: true }
    ]
  ],

  // Jazz swing (vocabulario Charleston, Red Garland, Wynton Kelly con aire real)
  'swing-negras': [
    // Célula 0: Charleston clásico (1 largo + & de 2 breve)
    [
      { offset: 0, dur: 1.25, mode: 'block', accent: 0.94, variant: 'base' },
      { offset: 1.67, dur: 0.42, mode: 'block', accent: 0.78, variant: 'color9' }
    ],
    // Célula 1: Respuesta ligera en 2 + empuje en & de 4 (estilo Red Garland)
    [
      { offset: 1, dur: 0.42, mode: 'block', accent: 0.8, variant: 'invUp' },
      { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.88, variant: 'color13', anticipateNext: true }
    ],
    // Célula 2: Síncopa en & de 1 + side-slip + respuesta en 3
    [
      { offset: 0.67, dur: 0.32, mode: 'block', accent: 0.58, variant: 'sideSlipUp' },
      { offset: 1, dur: 0.75, mode: 'block', accent: 0.88, variant: 'base' },
      { offset: 2.67, dur: 0.75, mode: 'block', accent: 0.82, variant: 'color9' }
    ],
    // Célula 3: Compás con aire (acorde en 1 + anticipación limpia en & de 4 al siguiente acorde)
    [
      { offset: 0, dur: 1.6, mode: 'block', accent: 0.9, variant: 'color13' },
      { offset: 2, dur: 0.45, mode: 'block', accent: 0.72, variant: 'invUp' },
      { offset: 3.67, dur: 0.68, mode: 'block', accent: 0.9, variant: 'base', anticipateNext: true }
    ]
  ],

  // Bossa nova: clave real de 2 compases (A: 1, 2.5, 4 · B: 1.5, 3, 4.5 anticipado)
  bossa: [
    // Compás A de la clave
    [
      { offset: 0, dur: 1.1, mode: 'block', accent: 0.94, variant: 'base' },
      { offset: 1.5, dur: 0.85, mode: 'upper', accent: 0.76, variant: 'color9' },
      { offset: 3, dur: 0.85, mode: 'upper', accent: 0.8, variant: 'base' }
    ],
    // Compás B de la clave (con empuje en 3.5 hacia el próximo acorde)
    [
      { offset: 0.5, dur: 0.95, mode: 'upper', accent: 0.78, variant: 'invUp' },
      { offset: 2, dur: 0.9, mode: 'block', accent: 0.84, variant: 'color13' },
      { offset: 3.5, dur: 0.75, mode: 'block', accent: 0.86, variant: 'base', anticipateNext: true }
    ]
  ],

  // Tango rioplatense: alterna marcato en 4, síncopa porteña y acento yumba
  'tango-marcato': [
    // Marcato en 4 con peso en 1 y 3
    [
      { offset: 0, dur: 0.48, mode: 'block', accent: 1.0, variant: 'base' },
      { offset: 1, dur: 0.4, mode: 'block', accent: 0.7, variant: 'base' },
      { offset: 2, dur: 0.48, mode: 'block', accent: 0.92, variant: 'invUp' },
      { offset: 3, dur: 0.4, mode: 'block', accent: 0.72, variant: 'base' }
    ],
    // Síncopa porteña clásica (1 acentuado + anticipación en 1.5 + cierre seco en 3)
    [
      { offset: 0, dur: 0.9, mode: 'block', accent: 1.0, variant: 'base' },
      { offset: 1.5, dur: 0.45, mode: 'block', accent: 0.84, variant: 'color9' },
      { offset: 2, dur: 0.85, mode: 'block', accent: 0.9, variant: 'invUp' },
      { offset: 3.5, dur: 0.55, mode: 'block', accent: 0.82, variant: 'base', anticipateNext: true }
    ]
  ],

  // Balada / Pop suave: alterna arpegio/acorde sostenido y respuesta delicada en blancas/contratiempos
  'balada-lenta': [
    [
      { offset: 0, dur: 2.2, mode: 'strum-down', accent: 0.92, variant: 'base' },
      { offset: 2.5, dur: 1.3, mode: 'upper', accent: 0.7, variant: 'color9' }
    ],
    [
      { offset: 0, dur: 1.8, mode: 'strum-down', accent: 0.88, variant: 'invUp' },
      { offset: 2, dur: 1.3, mode: 'upper', accent: 0.74, variant: 'color13' },
      { offset: 3.5, dur: 0.6, mode: 'upper', accent: 0.68, variant: 'base', anticipateNext: true }
    ]
  ],

  // Rasgueo balada / pop: alterna rasgueo clásico con compás más liviano y empuje al cambio
  'rasgueo-balada': [
    [
      { offset: 0, dur: 0.9, mode: 'strum-down', accent: 0.98, variant: 'base' },
      { offset: 1.5, dur: 0.65, mode: 'strum-up', accent: 0.68, variant: 'base' },
      { offset: 2.5, dur: 0.6, mode: 'strum-up', accent: 0.74, variant: 'color9' },
      { offset: 3, dur: 0.8, mode: 'strum-down', accent: 0.86, variant: 'base' }
    ],
    [
      { offset: 0, dur: 1.1, mode: 'strum-down', accent: 0.94, variant: 'invUp' },
      { offset: 1, dur: 0.55, mode: 'strum-down', accent: 0.76, variant: 'base' },
      { offset: 2.5, dur: 0.55, mode: 'strum-up', accent: 0.72, variant: 'color13' },
      { offset: 3.5, dur: 0.65, mode: 'strum-up', accent: 0.8, variant: 'base', anticipateNext: true }
    ]
  ],

  // Funk 16: alterna síncopas secas en semicorcheas
  'funk-16': [
    [
      { offset: 0, dur: 0.35, mode: 'strum-down', accent: 0.98, variant: 'base' },
      { offset: 0.75, dur: 0.25, mode: 'strum-up', accent: 0.74, variant: 'color9' },
      { offset: 2, dur: 0.35, mode: 'strum-down', accent: 0.88, variant: 'base' },
      { offset: 3.5, dur: 0.35, mode: 'strum-up', accent: 0.8, variant: 'color13' }
    ],
    [
      { offset: 0, dur: 0.32, mode: 'strum-down', accent: 0.95, variant: 'invUp' },
      { offset: 1.5, dur: 0.3, mode: 'strum-up', accent: 0.78, variant: 'color9' },
      { offset: 2.75, dur: 0.25, mode: 'strum-up', accent: 0.72, variant: 'base' },
      { offset: 3.75, dur: 0.35, mode: 'strum-up', accent: 0.84, variant: 'base', anticipateNext: true }
    ]
  ]
};

/**
 * Planifica los ataques de acordes (comping) para un evento armónico de cualquier duración
 * (incluyendo eventos multi-compás como 4 compases seguidos de A7 en un blues de 12).
 *
 * @param {object} params Parámetros de planificación.
 * @param {string} params.chordSymbol Símbolo americano del acorde actual.
 * @param {string|null} [params.nextChordSymbol=null] Símbolo del acorde que sigue al evento.
 * @param {number[]} params.voicingMidis Alturas MIDI del voicing actual.
 * @param {number[]} [params.nextVoicingMidis=[]] Alturas MIDI del acorde siguiente (para anticipaciones).
 * @param {number} params.durationBeats Duración total del evento en negras.
 * @param {number} [params.beatsPerMeasure=4] Pulsos por compás.
 * @param {string} [params.pattern='negras-abajo'] Patrón base de comping.
 * @param {'fijo'|'organico'|'vivo'} [params.compingFeel='organico'] Nivel de variación orgánica.
 * @param {object} [params.context={}] Contexto devuelto por `analyzeChordContext`.
 * @param {boolean} [params.isPiano=false] True si suena con timbre piano (prefiere ataque en bloque limpio).
 * @returns {Array<{ beatOffset: number, durationBeats: number, midis: number[], mode: string, volumeScale: number, strumMs: number, humanizeMs: number, tag: string }>}
 */
export function planCompingEvents({
  chordSymbol = 'C',
  nextChordSymbol = null,
  voicingMidis = [],
  nextVoicingMidis = [],
  durationBeats = 4,
  beatsPerMeasure = 4,
  pattern = 'negras-abajo',
  compingFeel = 'organico',
  context = {},
  isPiano = false
}) {
  const sorted = [...voicingMidis].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const feel = normalizeCompingFeel(compingFeel);
  const family = normalizePatternFamily(pattern);
  const bpm = Math.max(1, Number(beatsPerMeasure) || 4);
  const totalBeats = Math.max(0.5, Number(durationBeats) || bpm);
  const chorusIndex = Math.max(0, Number(context.chorusIndex) || 0);
  const baseBarIndex = Math.max(0, Number(context.barIndex) || 0);
  const prevSameBars = Math.max(0, Number(context.prevSameBars) || 0);
  const changesAfter = Boolean(context.changesAfterEvent ?? (nextChordSymbol && nextChordSymbol !== chordSymbol));
  const nextSorted = [...(nextVoicingMidis || [])].filter(Number.isFinite).sort((a, b) => a - b);

  // En modo 'fijo' o en patrones puramente fijos ('bloque', 'arpegio-pima', 'arpegio-asc') devuelve comportamiento regular
  if (feel === 'fijo' || family === 'bloque') {
    return [{
      beatOffset: 0,
      durationBeats: totalBeats,
      midis: sorted,
      mode: 'block',
      volumeScale: 1.0,
      strumMs: 0,
      humanizeMs: 0,
      tag: 'fijo'
    }];
  }

  // Divide eventos multi-compás (ej. 16 negras = 4 compases de A7) en rebanadas de 1 compás
  const events = [];
  const barCount = Math.max(1, Math.ceil(totalBeats / bpm - 0.0001));

  for (let subBar = 0; subBar < barCount; subBar++) {
    const barStart = subBar * bpm;
    const barDur = Math.min(bpm, totalBeats - barStart);
    if (barDur <= 0.05) break;

    const absBar = baseBarIndex + subBar;
    const sameBarIdx = prevSameBars + subBar;
    const isLastSubBar = subBar === barCount - 1;
    const isLastBeforeChange = isLastSubBar && changesAfter;

    // Caso 1: Estilos con células rítmicas multi-compás definidas (shuffle, swing, bossa, tango, balada, funk)
    const cells = ORGANIC_CELLS[family] || (family === 'negras-abajo' || family === 'rock-corcheas' ? ORGANIC_CELLS['rasgueo-balada'] : null);

    if (cells && barDur >= 2.5) {
      let cellIdx;
      if (isLastBeforeChange && cells.length >= 4 && (sameBarIdx >= 1 || chorusIndex > 0)) {
        // Compás de cierre / preparación antes de cambiar de acorde
        cellIdx = cells.length - 1;
      } else if (family === 'bossa') {
        // Bossa siempre alterna compás A (par) y compás B (impar) de la clave de 2 compases
        cellIdx = (absBar + chorusIndex) % 2;
      } else {
        // Rota células por compás consecutivo + coro para que 4 compases de A7 jamás se repitan iguales
        cellIdx = (sameBarIdx + chorusIndex * 2 + Math.floor(absBar / 4)) % cells.length;
      }

      const cell = cells[cellIdx];
      cell.forEach((h, hIdx) => {
        if (h.offset >= barDur - 0.05) return;

        // Anticipación del próximo acorde solo en el último compás previo a un cambio real
        const useAnticipation = Boolean(h.anticipateNext && isLastBeforeChange && nextSorted.length > 0);
        // En el último compás SIN cambio de acorde, si el hit era anticipación, toca el acorde actual más suave
        let targetMidis = useAnticipation ? nextSorted : sorted;
        let tag = useAnticipation ? 'anticipation' : `cell-${cellIdx}`;

        if (!useAnticipation && feel === 'vivo' && h.variant && h.variant !== 'base') {
          // En modo 'vivo' evita side-slip en el primer compás del tema para anclar la tonalidad primero
          const safeVariant = (h.variant === 'sideSlipUp' || h.variant === 'sideSlipDown') && sameBarIdx === 0
            ? 'color9'
            : h.variant;
          targetMidis = buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: safeVariant });
          tag = `vivo-${safeVariant}`;
        }

        if (h.mode === 'upper' && targetMidis.length > 1) {
          targetMidis = targetMidis.slice(1);
        } else if (h.mode === 'bass') {
          targetMidis = [targetMidis[0]];
        }

        const effectiveMode = isPiano
          ? 'block'
          : (h.mode === 'upper' || h.mode === 'bass' ? 'block' : h.mode);
        const { humanizeMs, velFactor } = computeHumanizeOffset(chorusIndex, absBar, hIdx);

        events.push({
          beatOffset: barStart + h.offset,
          durationBeats: Math.min(h.dur, Math.max(0.28, barDur - h.offset + (useAnticipation ? 0.45 : 0.1))),
          midis: targetMidis,
          mode: effectiveMode,
          volumeScale: Number((h.accent * velFactor).toFixed(3)),
          strumMs: effectiveMode === 'block' ? 6 : (effectiveMode === 'strum-up' ? 14 : 18),
          humanizeMs,
          tag
        });
      });
      continue;
    }

    // Caso 2: Compases partidos (ej. 2 pulsos en ii–V dentro del mismo compás) o vals 3/4
    if (family === 'vals') {
      const bass = [sorted[0]];
      const upper = sorted.length > 1 ? sorted.slice(1) : sorted;
      const upperVaried = feel === 'vivo' && (sameBarIdx % 2 === 1)
        ? buildVariedVoicing({ baseMidis: upper, chordSymbol, variant: 'color9' })
        : upper;
      const beats = Math.max(1, Math.round(barDur));
      for (let b = 0; b < beats; b++) {
        const isOne = b % 3 === 0;
        const { humanizeMs, velFactor } = computeHumanizeOffset(chorusIndex, absBar, b);
        events.push({
          beatOffset: barStart + b,
          durationBeats: isOne ? 1.35 : 0.72,
          midis: isOne ? bass : upperVaried,
          mode: isOne || isPiano ? 'block' : 'strum-down',
          volumeScale: Number(((isOne ? 0.98 : b === 1 ? 0.74 : 0.64) * velFactor).toFixed(3)),
          strumMs: isOne || isPiano ? 4 : 14,
          humanizeMs,
          tag: isOne ? 'vals-bass' : 'vals-upper'
        });
      }
      continue;
    }

    if (family === 'arpegio-pima' || family === 'arpegio-asc') {
      const targetMidis = feel === 'vivo' && (sameBarIdx % 2 === 1)
        ? buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: 'invUp' })
        : sorted;
      const { humanizeMs, velFactor } = computeHumanizeOffset(chorusIndex, absBar, 0);
      events.push({
        beatOffset: barStart,
        durationBeats: barDur,
        midis: targetMidis,
        mode: family === 'arpegio-pima' ? 'arpeggio-pima' : 'arpeggio-asc',
        volumeScale: Number((0.95 * velFactor).toFixed(3)),
        strumMs: 16,
        humanizeMs,
        tag: family
      });
      continue;
    }

    // Compás partido (barDur <= 2 pulsos, ej. Dm7 | G7): ataque claro en tiempo 1 + respuesta corta opcional
    const { humanizeMs, velFactor } = computeHumanizeOffset(chorusIndex, absBar, 0);
    const splitMidis = feel === 'vivo' && (absBar + chorusIndex) % 2 === 1
      ? buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: 'color9' })
      : sorted;
    events.push({
      beatOffset: barStart,
      durationBeats: Math.max(0.5, barDur * 0.78),
      midis: splitMidis,
      mode: isPiano ? 'block' : 'strum-down',
      volumeScale: Number((0.92 * velFactor).toFixed(3)),
      strumMs: isPiano ? 5 : 16,
      humanizeMs,
      tag: 'split-bar'
    });
    if (barDur >= 2 && (family === 'swing-negras' || family === 'shuffle')) {
      const { humanizeMs: h2, velFactor: v2 } = computeHumanizeOffset(chorusIndex, absBar, 1);
      events.push({
        beatOffset: barStart + 1.67,
        durationBeats: 0.38,
        midis: isLastBeforeChange && nextSorted.length > 0 ? nextSorted : splitMidis,
        mode: 'block',
        volumeScale: Number((0.72 * v2).toFixed(3)),
        strumMs: 6,
        humanizeMs: h2,
        tag: isLastBeforeChange ? 'anticipation' : 'split-push'
      });
    }
  }

  return events;
}

/**
 * Elige la nota de aproximación (cromática ±1 st o diatónica ±2 st) para el último pulso antes
 * de aterrizar en `nextRootMidi` respetando el rango físico del bajo eléctrico (28..52).
 * @param {number} prevMidi Nota anterior del bajo.
 * @param {number} nextRootMidi Raíz del acorde destino.
 * @param {number} seed Semilla determinista para alternar arriba/abajo entre coros.
 * @returns {number} Altura MIDI de la nota de aproximación.
 */
function pickApproachMidi(prevMidi, nextRootMidi, seed = 0) {
  const below = nextRootMidi - 1;
  const above = nextRootMidi + 1;
  const candidates = [];
  if (below >= 28 && below !== prevMidi) candidates.push(below);
  if (above <= 52 && above !== prevMidi) candidates.push(above);
  if (candidates.length === 0) return Math.max(28, nextRootMidi - 2);
  if (candidates.length === 1) return candidates[0];
  // Prefiere dirección natural desde prevMidi, alternando ocasionalmente por coro
  const preferBelow = prevMidi < nextRootMidi ? (seed % 3 !== 2) : (seed % 3 === 2);
  return preferBelow ? candidates[0] : candidates[1];
}

/**
 * Planifica una línea de bajo acompañante (play-along) con fraseo real de 2–4 compases,
 * variaciones entre vueltas (coros) y aproximaciones cromáticas hacia el próximo acorde.
 *
 * @param {object} params Parámetros.
 * @param {string} params.chordSymbol Símbolo americano del acorde actual.
 * @param {string|null} [params.nextChordSymbol=null] Símbolo del acorde siguiente.
 * @param {number} params.durationBeats Duración total en negras.
 * @param {number} [params.beatsPerMeasure=4] Pulsos por compás.
 * @param {string} [params.pattern='negras-abajo'] Patrón base de acompañamiento.
 * @param {'fijo'|'organico'|'vivo'} [params.compingFeel='organico'] Nivel de variación orgánica.
 * @param {object} [params.context={}] Contexto armónico.
 * @returns {Array<{ beatOffset: number, durationBeats: number, midi: number, volumeScale: number, humanizeMs: number, bassInst: string, tag: string }>}
 */
export function planPlayAlongBass({
  chordSymbol = 'C',
  nextChordSymbol = null,
  durationBeats = 4,
  beatsPerMeasure = 4,
  pattern = 'negras-abajo',
  compingFeel = 'organico',
  context = {}
}) {
  const voicing = getChordVoicingMidi(chordSymbol, 40);
  if (!voicing) return [];

  const root = resolveBassRootMidi(chordSymbol);
  if (root === null) return [];

  const feel = normalizeCompingFeel(compingFeel);
  const family = normalizePatternFamily(pattern);
  const bpm = Math.max(1, Number(beatsPerMeasure) || 4);
  const totalBeats = Math.max(0.5, Number(durationBeats) || bpm);
  const bassInst = family === 'swing-negras' || family === 'balada-lenta' ? 'acoustic-bass' : 'electric-bass';

  const parsed = parseChord(chordSymbol);
  const qual = String(parsed?.quality || '').toLowerCase();
  const isMinor = qual.startsWith('m') && !qual.startsWith('maj');
  const isDim5 = qual.includes('b5') || qual.includes('dim');
  const third = root + (isMinor ? 3 : 4);
  const fifth = root + (isDim5 ? 6 : 7);
  const sixth = root + 9;
  const flatSeven = root + 10;
  const octave = root + 12 <= 52 ? root + 12 : fifth;

  const chorusIndex = Math.max(0, Number(context.chorusIndex) || 0);
  const baseBarIndex = Math.max(0, Number(context.barIndex) || 0);
  const prevSameBars = Math.max(0, Number(context.prevSameBars) || 0);
  const nextRoot = resolveBassRootMidi(nextChordSymbol || context.nextChordSymbol);
  const changesAfter = Boolean(context.changesAfterEvent ?? (nextChordSymbol && nextChordSymbol !== chordSymbol));

  const notes = [];
  const barCount = Math.max(1, Math.ceil(totalBeats / bpm - 0.0001));

  for (let subBar = 0; subBar < barCount; subBar++) {
    const barStart = subBar * bpm;
    const barDur = Math.min(bpm, totalBeats - barStart);
    if (barDur <= 0.05) break;

    const absBar = baseBarIndex + subBar;
    const sameBarIdx = prevSameBars + subBar;
    const isLastSubBar = subBar === barCount - 1;
    const isLastBeforeChange = isLastSubBar && changesAfter && nextRoot !== null;
    const beats = Math.max(1, Math.round(barDur));

    // 1) Bossa nova: bajo en 2 con anticipaciones y aproximación en último pulso antes de cambio
    if (family === 'bossa') {
      const altFifth = fifth <= 46 ? fifth : fifth - 12;
      const pickupMidi = isLastBeforeChange ? pickApproachMidi(altFifth, nextRoot, absBar + chorusIndex) : root;
      const hits = [
        { offset: 0, midi: root, dur: 1.4, acc: 1.0, tag: 'bossa-root' },
        { offset: 1.5, midi: altFifth, dur: 0.45, acc: 0.84, tag: 'bossa-push' },
        { offset: 2, midi: altFifth, dur: 1.4, acc: 0.92, tag: 'bossa-5th' },
        { offset: 3.5, midi: feel === 'fijo' ? root : pickupMidi, dur: 0.45, acc: 0.86, tag: isLastBeforeChange ? 'approach' : 'bossa-push' }
      ];
      hits.forEach((h, hIdx) => {
        if (h.offset < barDur) {
          const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(chorusIndex, absBar, hIdx);
          notes.push({
            beatOffset: barStart + h.offset,
            durationBeats: h.dur,
            midi: h.midi,
            volumeScale: Number((h.acc * hum.velFactor).toFixed(3)),
            humanizeMs: hum.humanizeMs,
            bassInst,
            tag: h.tag
          });
        }
      });
      continue;
    }

    // 2) Blues shuffle: fraseo de 4 compases (sube → baja → variación octava → aproximación cromática)
    if (family === 'shuffle') {
      let seq;
      if (feel === 'fijo') {
        seq = [root, third, fifth, sixth];
      } else {
        const phraseSlot = (sameBarIdx + (chorusIndex % 2)) % 4;
        if (isLastBeforeChange) {
          seq = [root, third, fifth, pickApproachMidi(fifth, nextRoot, absBar + chorusIndex)];
        } else if (phraseSlot === 0) {
          seq = [root, third, fifth, sixth];
        } else if (phraseSlot === 1) {
          seq = [flatSeven, sixth, fifth, third];
        } else if (phraseSlot === 2) {
          seq = [root, fifth, octave, flatSeven];
        } else {
          seq = [root, third, fifth, flatSeven];
        }
      }
      for (let b = 0; b < beats; b++) {
        const m = seq[b % seq.length];
        const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(chorusIndex, absBar, b);
        notes.push({
          beatOffset: barStart + b,
          durationBeats: 0.86,
          midi: m,
          volumeScale: Number(((b === 0 ? 1.0 : 0.9) * hum.velFactor).toFixed(3)),
          humanizeMs: hum.humanizeMs,
          bassInst,
          tag: isLastBeforeChange && b === beats - 1 ? 'approach' : 'shuffle-walk'
        });
      }
      continue;
    }

    // 3) Jazz swing: walking bass real de 4 negras con aproximación cromática en tiempo 4
    if (family === 'swing-negras') {
      let seq;
      if (feel === 'fijo') {
        seq = [root, third, fifth, third];
      } else {
        const patternChoice = (sameBarIdx + chorusIndex) % 3;
        const b1 = sameBarIdx > 0 && patternChoice === 1 ? third : root;
        const b2 = patternChoice === 0 ? third : patternChoice === 1 ? fifth : fifth;
        const b3 = patternChoice === 0 ? fifth : patternChoice === 1 ? octave : (isMinor ? root + 10 : sixth);
        const b4 = isLastBeforeChange
          ? pickApproachMidi(b3, nextRoot, absBar + chorusIndex)
          : (patternChoice === 2 ? third : (b3 > root + 5 ? fifth : third));
        seq = [b1, b2, b3, b4];
      }
      for (let b = 0; b < beats; b++) {
        const midi = beats <= 2 && b === 1 && isLastBeforeChange && feel !== 'fijo'
          ? pickApproachMidi(root, nextRoot, absBar + chorusIndex)
          : seq[b % seq.length];
        const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(chorusIndex, absBar, b);
        notes.push({
          beatOffset: barStart + b,
          durationBeats: 0.92,
          midi,
          volumeScale: Number(((b === 0 ? 1.0 : 0.92) * hum.velFactor).toFixed(3)),
          humanizeMs: hum.humanizeMs,
          bassInst,
          tag: isLastBeforeChange && b === beats - 1 ? 'approach' : 'swing-walk'
        });
      }
      continue;
    }

    // 4) Tango rioplatense: alterna 1–3 seco con bordoneo cromático en compás previo a cambio
    if (family === 'tango-marcato' && feel !== 'fijo' && barDur >= 3) {
      const hum0 = computeHumanizeOffset(chorusIndex, absBar, 0);
      notes.push({ beatOffset: barStart, durationBeats: 1.1, midi: root, volumeScale: Number((1.0 * hum0.velFactor).toFixed(3)), humanizeMs: hum0.humanizeMs, bassInst, tag: 'tango-root' });
      if (isLastBeforeChange) {
        const app = pickApproachMidi(fifth, nextRoot, absBar + chorusIndex);
        notes.push({ beatOffset: barStart + 2, durationBeats: 0.85, midi: fifth, volumeScale: 0.88, humanizeMs: 3, bassInst, tag: 'tango-5th' });
        notes.push({ beatOffset: barStart + 3, durationBeats: 0.85, midi: app, volumeScale: 0.92, humanizeMs: 4, bassInst, tag: 'approach' });
      } else {
        notes.push({ beatOffset: barStart + 1.5, durationBeats: 0.45, midi: third, volumeScale: 0.78, humanizeMs: 2, bassInst, tag: 'tango-sync' });
        notes.push({ beatOffset: barStart + 2, durationBeats: 1.1, midi: fifth, volumeScale: 0.9, humanizeMs: 3, bassInst, tag: 'tango-5th' });
      }
      continue;
    }

    // 5) Balada / Bloque
    if (family === 'balada-lenta' || family === 'bloque') {
      const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(chorusIndex, absBar, 0);
      if (feel !== 'fijo' && barDur >= 3 && isLastBeforeChange) {
        notes.push({ beatOffset: barStart, durationBeats: barDur - 1, midi: root, volumeScale: hum.velFactor, humanizeMs: hum.humanizeMs, bassInst, tag: 'ballad-root' });
        notes.push({ beatOffset: barStart + barDur - 1, durationBeats: 0.95, midi: pickApproachMidi(root, nextRoot, absBar + chorusIndex), volumeScale: 0.8, humanizeMs: 4, bassInst, tag: 'approach' });
      } else {
        notes.push({ beatOffset: barStart, durationBeats: barDur * 0.92, midi: root, volumeScale: hum.velFactor, humanizeMs: hum.humanizeMs, bassInst, tag: 'ballad-root' });
      }
      continue;
    }

    // 6) Por defecto (recto, pop, rock, vals): raíz en 1, quinta en 3 y aproximación opcional en 4
    const hum0 = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(chorusIndex, absBar, 0);
    notes.push({ beatOffset: barStart, durationBeats: Math.min(2, barDur) * 0.9, midi: root, volumeScale: hum0.velFactor, humanizeMs: hum0.humanizeMs, bassInst, tag: 'root' });
    if (barDur >= 3) {
      const hasApproach = feel !== 'fijo' && isLastBeforeChange && barDur >= 4;
      notes.push({ beatOffset: barStart + 2, durationBeats: (hasApproach ? 1 : Math.min(2, barDur - 2)) * 0.9, midi: fifth, volumeScale: 0.88, humanizeMs: feel === 'fijo' ? 0 : 3, bassInst, tag: '5th' });
      if (hasApproach) {
        notes.push({ beatOffset: barStart + 3, durationBeats: 0.9, midi: pickApproachMidi(fifth, nextRoot, absBar + chorusIndex), volumeScale: 0.86, humanizeMs: 4, bassInst, tag: 'approach' });
      }
    }
  }

  return notes;
}
