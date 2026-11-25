import {
  getChordVoicingMidi,
  getKeySignatureMap,
  midiToAbcPitch,
  mod12,
  parseChord,
  pcToNoteName,
  prefersFlats
} from '../core/MusicTheory.js';
import { soundingMidiToWrittenMidi } from '../core/PitchPolicy.js';

/**
 * Modos de ejecución del motor de acompañamiento (comping).
 * - 'fijo': patrón regular y predecible idéntico en cada compás (ideal para lectura y pulso base).
 * - 'organico': células rítmicas no periódicas (selección estocástica con reglas musicales,
 *   equilibrio pregunta/respuesta y memoria anti-repetición), anticipaciones y bajo caminante real.
 * - 'vivo': suma movimiento armónico interno dentro del mismo acorde (tensiones 9/13/6, inversiones
 *   suaves, adorno blues IV/I en tiempos débiles y side-slipping cromático breve) informando en vivo
 *   qué acorde/recurso exacto está sonando en pantalla.
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
    description: 'Fraseo no periódico con aire, pregunta/respuesta aleatoria controlada, anticipaciones y bajo caminante real.'
  },
  {
    id: 'vivo',
    label: 'Vivo',
    description: 'Estilo pianista/guitarrista de jazz y blues: coloraciones 9/13, inversiones, adornos IV/I y aproximaciones visibles en vivo.'
  }
];

/**
 * Crea un estado de memoria mutable para una sesión de reproducción (evita repeticiones
 * consecutivas y equilibra la densidad rítmica compás a compás).
 * @returns {{ lastCellIdx: number, lastDensity: string, lastVariant: string, lastBassContour: number }}
 */
export function createCompingMemory() {
  return {
    lastCellIdx: -1,
    lastDensity: 'medium',
    lastVariant: 'base',
    lastBassContour: -1
  };
}

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
 * Calcula un desplazamiento orgánico pequeño para micro-humanización (tiempo y dinámica).
 * @param {Function} [rng=Math.random] Generador pseudoaleatorio [0..1).
 * @returns {{ humanizeMs: number, velFactor: number }} Micro-ajuste de tiempo (-5..+11 ms) y volumen (0.91..1.06).
 */
export function computeHumanizeOffset(rng = Math.random) {
  const r = typeof rng === 'function' ? rng() : Math.random();
  const r2 = typeof rng === 'function' ? rng() : Math.random();
  return {
    humanizeMs: Math.round((r - 0.32) * 16), // ~ -5ms a +11ms
    velFactor: Number((0.91 + r2 * 0.15).toFixed(3))
  };
}

/**
 * Elige un elemento de una lista ponderada con `rng()`.
 * @param {Array<{ item: any, weight: number }>} weighted Lista ponderada.
 * @param {Function} rng Generador [0..1).
 * @returns {any} Elemento elegido.
 */
function pickWeighted(weighted, rng = Math.random) {
  const total = weighted.reduce((acc, w) => acc + Math.max(0.01, w.weight), 0);
  let cursor = rng() * total;
  for (const entry of weighted) {
    cursor -= Math.max(0.01, entry.weight);
    if (cursor <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item;
}

/**
 * Analiza el contexto armónico de un evento dentro de la lista completa de acordes de la timeline.
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
 * Calcula la etiqueta legible del acorde y recurso armónico que está sonando en vivo
 * para mostrarla en la UI sincronizada (ej. `A7` → `A13 · Color 13.ª`, `D/A · Adorno blues IV/I`,
 * `Ab9 · Aprox. cromática −½`, `D7 · Anticipación`).
 * @param {string} chordSymbol Acorde base del compás.
 * @param {string|null} nextChordSymbol Acorde siguiente.
 * @param {string} variant Variante aplicada.
 * @param {boolean} isAnticipation True si anticipa el próximo acorde.
 * @returns {{ displaySymbol: string, techniqueLabel: string, isVariation: boolean }} Descripción en vivo.
 */
export function describeLiveCompingChord(chordSymbol = 'C', nextChordSymbol = null, variant = 'base', isAnticipation = false) {
  if (isAnticipation && nextChordSymbol) {
    return {
      displaySymbol: nextChordSymbol,
      techniqueLabel: 'Anticipación',
      isVariation: true
    };
  }

  const parsed = parseChord(chordSymbol);
  if (!parsed || variant === 'base') {
    return {
      displaySymbol: chordSymbol,
      techniqueLabel: 'Base',
      isVariation: false
    };
  }

  const rootName = parsed.root;
  const useFlats = rootName.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm'].includes(chordSymbol);
  const q = String(parsed.quality || '');
  const qLow = q.toLowerCase();
  const isMinor = qLow.startsWith('m') && !qLow.startsWith('maj');
  const isMaj7 = qLow.startsWith('maj');
  const isDimOrHalf = qLow.includes('dim') || qLow.includes('b5') || qLow.includes('b9');

  if (variant === 'invUp') {
    return {
      displaySymbol: chordSymbol,
      techniqueLabel: 'Inversión alta',
      isVariation: true
    };
  }

  if (variant === 'bluesNeighbor' && !isMinor && !isDimOrHalf) {
    const fourthName = pcToNoteName((parsed.rootPc + 5) % 12, useFlats);
    return {
      displaySymbol: `${fourthName}/${rootName}`,
      techniqueLabel: 'Adorno blues IV/I',
      isVariation: true
    };
  }

  if (variant === 'sideSlipUp' || variant === 'sideSlipDown') {
    const delta = variant === 'sideSlipUp' ? 1 : -1;
    const slipRoot = pcToNoteName((parsed.rootPc + delta + 12) % 12, delta < 0 || useFlats);
    const slipQual = isMinor ? 'm9' : isMaj7 ? 'maj7' : (q === '7' ? '9' : q || '7');
    return {
      displaySymbol: `${slipRoot}${slipQual}`,
      techniqueLabel: delta > 0 ? 'Aprox. cromática +½' : 'Aprox. cromática −½',
      isVariation: true
    };
  }

  if (variant === 'color9' && !isDimOrHalf) {
    let sym = chordSymbol;
    if (q === '7') sym = `${rootName}9`;
    else if (q === 'maj7') sym = `${rootName}maj9`;
    else if (q === 'm7') sym = `${rootName}m9`;
    else if (q === '') sym = `${rootName}add9`;
    else if (q === 'm') sym = `${rootName}madd9`;
    return {
      displaySymbol: sym,
      techniqueLabel: 'Color 9.ª',
      isVariation: true
    };
  }

  if (variant === 'color13' && !isDimOrHalf) {
    let sym = chordSymbol;
    if (q === '7') sym = `${rootName}13`;
    else if (q === 'maj7') sym = `${rootName}6/9`;
    else if (q === '') sym = `${rootName}6`;
    else if (q === 'm7') sym = `${rootName}m9`;
    return {
      displaySymbol: sym,
      techniqueLabel: isMinor ? 'Color 9.ª' : 'Color 13.ª / 6.ª',
      isVariation: true
    };
  }

  return {
    displaySymbol: chordSymbol,
    techniqueLabel: 'Base',
    isVariation: false
  };
}

/**
 * Genera una variación armónicamente compatible del voicing para el modo 'vivo', respetando
 * siempre el Low Interval Limit (piso MIDI 48 para acordes) y el rango superior (<= 84).
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
    return sorted.map((m) => Math.max(48, Math.min(84, m + delta)));
  }

  if (variant === 'invUp' && sorted.length >= 3) {
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
    const out = sorted.map((m) => {
      const iv = ((m % 12) - rootPc + 12) % 12;
      if (iv === 4) return m + 1; // 3M -> 4J
      if (iv === 7) return m + 2; // 5J -> 6M
      return m;
    });
    return [...new Set(out)].sort((a, b) => a - b);
  }

  if (variant === 'color9' || variant === 'color13') {
    if (quality.includes('dim') || quality.includes('b9') || quality.includes('m7b5')) {
      return sorted;
    }
    const top = sorted[sorted.length - 1];
    const targetInterval = variant === 'color13' && !quality.includes('m') ? 9 : 2;
    let colorMidi = rootPc + targetInterval;
    while (colorMidi <= top) colorMidi += 12;
    if (colorMidi > 81) colorMidi -= 12;
    if (colorMidi < 55) colorMidi += 12;
    const out = sorted.length >= 4 ? [...sorted.slice(0, -1), colorMidi] : [...sorted, colorMidi];
    return [...new Set(out)].sort((a, b) => a - b);
  }

  return sorted;
}

/**
 * Vocabulario amplio de células rítmicas (8–10 por estilo principal) clasificadas por densidad
 * ('sparse' | 'medium' | 'active') para selección estocástica sin periodicidad mecánica.
 */
const ORGANIC_CELLS = {
  // Blues shuffle (9 células: de compases muy abiertos con aire hasta respuestas y fills atresillados)
  shuffle: [
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.5, mode: 'strum-down', accent: 0.96, variant: 'base' },
        { offset: 2.67, dur: 0.75, mode: 'block', accent: 0.76, variant: 'color9' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 1, dur: 0.5, mode: 'block', accent: 0.84, variant: 'bluesNeighbor' },
        { offset: 3, dur: 0.75, mode: 'strum-down', accent: 0.82, variant: 'color13' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 2.1, mode: 'block', accent: 0.9, variant: 'color13' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.85, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 1.67, dur: 0.34, mode: 'strum-up', accent: 0.68, variant: 'color9', optional: true },
        { offset: 2, dur: 1.15, mode: 'block', accent: 0.86, variant: 'invUp' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0.67, dur: 0.3, mode: 'block', accent: 0.58, variant: 'sideSlipDown' },
        { offset: 1, dur: 0.95, mode: 'strum-down', accent: 0.92, variant: 'base' },
        { offset: 2.67, dur: 0.8, mode: 'block', accent: 0.84, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 1, dur: 0.45, mode: 'block', accent: 0.82, variant: 'bluesNeighbor' },
        { offset: 2, dur: 0.65, mode: 'strum-down', accent: 0.88, variant: 'base' },
        { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.86, variant: 'color13', anticipateNext: true }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.55, mode: 'strum-down', accent: 0.94, variant: 'invUp' },
        { offset: 2.67, dur: 0.32, mode: 'strum-up', accent: 0.66, variant: 'bluesNeighbor', optional: true },
        { offset: 3, dur: 0.72, mode: 'block', accent: 0.88, variant: 'color9' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.55, mode: 'strum-down', accent: 0.92, variant: 'base' },
        { offset: 1.67, dur: 0.3, mode: 'strum-up', accent: 0.64, variant: 'bluesNeighbor', optional: true },
        { offset: 2, dur: 0.55, mode: 'block', accent: 0.84, variant: 'color13' },
        { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.88, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.45, mode: 'block', accent: 0.9, variant: 'base' },
        { offset: 0.67, dur: 0.32, mode: 'strum-up', accent: 0.62, variant: 'color9' },
        { offset: 1.67, dur: 0.35, mode: 'block', accent: 0.78, variant: 'bluesNeighbor' },
        { offset: 3, dur: 0.65, mode: 'strum-down', accent: 0.86, variant: 'invUp' }
      ]
    }
  ],

  // Jazz swing (10 células: Charleston, Red Garland, Wynton Kelly, Bill Evans flotado, compases con aire)
  'swing-negras': [
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.4, mode: 'block', accent: 0.92, variant: 'base' },
        { offset: 1.67, dur: 0.45, mode: 'block', accent: 0.78, variant: 'color9' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 1, dur: 0.42, mode: 'block', accent: 0.8, variant: 'invUp' },
        { offset: 3.67, dur: 0.68, mode: 'block', accent: 0.88, variant: 'color13', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0.67, dur: 1.45, mode: 'block', accent: 0.86, variant: 'color13' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 2.67, dur: 0.95, mode: 'block', accent: 0.84, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0.67, dur: 0.32, mode: 'block', accent: 0.58, variant: 'sideSlipUp' },
        { offset: 1, dur: 0.85, mode: 'block', accent: 0.88, variant: 'base' },
        { offset: 2.67, dur: 0.75, mode: 'block', accent: 0.82, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.55, mode: 'block', accent: 0.9, variant: 'base' },
        { offset: 1.67, dur: 0.36, mode: 'block', accent: 0.72, variant: 'color9', optional: true },
        { offset: 3, dur: 0.65, mode: 'block', accent: 0.84, variant: 'invUp' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 1.6, mode: 'block', accent: 0.9, variant: 'color13' },
        { offset: 2, dur: 0.42, mode: 'block', accent: 0.74, variant: 'invUp', optional: true },
        { offset: 3.67, dur: 0.68, mode: 'block', accent: 0.9, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 1, dur: 0.38, mode: 'block', accent: 0.78, variant: 'color9' },
        { offset: 1.67, dur: 0.85, mode: 'block', accent: 0.86, variant: 'base' },
        { offset: 3, dur: 0.45, mode: 'block', accent: 0.76, variant: 'color13' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.42, mode: 'block', accent: 0.88, variant: 'base' },
        { offset: 0.67, dur: 0.3, mode: 'block', accent: 0.62, variant: 'sideSlipDown' },
        { offset: 1, dur: 0.6, mode: 'block', accent: 0.86, variant: 'invUp' },
        { offset: 2.67, dur: 0.42, mode: 'block', accent: 0.8, variant: 'color13', optional: true },
        { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.9, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.5, mode: 'block', accent: 0.92, variant: 'color9' },
        { offset: 1, dur: 0.38, mode: 'block', accent: 0.76, variant: 'base' },
        { offset: 2, dur: 0.48, mode: 'block', accent: 0.84, variant: 'invUp', optional: true },
        { offset: 3.67, dur: 0.65, mode: 'block', accent: 0.88, variant: 'color13', anticipateNext: true }
      ]
    }
  ],

  // Bossa nova (6 células: 3 variantes de compás A + 3 variantes de compás B preservando la clave)
  bossa: [
    // A0
    {
      barRole: 'A',
      density: 'medium',
      hits: [
        { offset: 0, dur: 1.1, mode: 'block', accent: 0.94, variant: 'base' },
        { offset: 1.5, dur: 0.85, mode: 'upper', accent: 0.76, variant: 'color9' },
        { offset: 3, dur: 0.85, mode: 'upper', accent: 0.8, variant: 'base' }
      ]
    },
    // B0
    {
      barRole: 'B',
      density: 'medium',
      hits: [
        { offset: 0.5, dur: 0.95, mode: 'upper', accent: 0.78, variant: 'invUp' },
        { offset: 2, dur: 0.9, mode: 'block', accent: 0.84, variant: 'color13' },
        { offset: 3.5, dur: 0.75, mode: 'block', accent: 0.86, variant: 'base', anticipateNext: true }
      ]
    },
    // A1 (más liviano)
    {
      barRole: 'A',
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.4, mode: 'block', accent: 0.92, variant: 'color13' },
        { offset: 1.5, dur: 1.4, mode: 'upper', accent: 0.78, variant: 'color9' }
      ]
    },
    // B1 (más activo)
    {
      barRole: 'B',
      density: 'active',
      hits: [
        { offset: 0.5, dur: 0.75, mode: 'upper', accent: 0.76, variant: 'base' },
        { offset: 1.5, dur: 0.45, mode: 'upper', accent: 0.68, variant: 'color9', optional: true },
        { offset: 2, dur: 0.85, mode: 'block', accent: 0.86, variant: 'invUp' },
        { offset: 3.5, dur: 0.75, mode: 'block', accent: 0.88, variant: 'base', anticipateNext: true }
      ]
    },
    // A2
    {
      barRole: 'A',
      density: 'active',
      hits: [
        { offset: 0, dur: 0.85, mode: 'block', accent: 0.94, variant: 'base' },
        { offset: 1.5, dur: 0.7, mode: 'upper', accent: 0.78, variant: 'invUp' },
        { offset: 2.5, dur: 0.45, mode: 'upper', accent: 0.66, variant: 'color9', optional: true },
        { offset: 3, dur: 0.85, mode: 'block', accent: 0.82, variant: 'color13' }
      ]
    },
    // B2 (liviano con empuje final)
    {
      barRole: 'B',
      density: 'sparse',
      hits: [
        { offset: 1, dur: 1.2, mode: 'upper', accent: 0.8, variant: 'color9' },
        { offset: 3.5, dur: 0.78, mode: 'block', accent: 0.86, variant: 'base', anticipateNext: true }
      ]
    }
  ],

  // Tango rioplatense (5 células: marcato, síncopa porteña, yumba, arrastre + corte, cierre)
  'tango-marcato': [
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.48, mode: 'block', accent: 1.0, variant: 'base' },
        { offset: 1, dur: 0.4, mode: 'block', accent: 0.7, variant: 'base' },
        { offset: 2, dur: 0.48, mode: 'block', accent: 0.92, variant: 'invUp' },
        { offset: 3, dur: 0.4, mode: 'block', accent: 0.72, variant: 'base' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.9, mode: 'block', accent: 1.0, variant: 'base' },
        { offset: 1.5, dur: 0.45, mode: 'block', accent: 0.84, variant: 'color9' },
        { offset: 2, dur: 0.85, mode: 'block', accent: 0.9, variant: 'invUp' },
        { offset: 3.5, dur: 0.55, mode: 'block', accent: 0.82, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.4, mode: 'block', accent: 1.0, variant: 'base' },
        { offset: 2, dur: 0.9, mode: 'block', accent: 0.88, variant: 'color13' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.55, mode: 'block', accent: 0.98, variant: 'invUp' },
        { offset: 1.5, dur: 0.75, mode: 'block', accent: 0.86, variant: 'color9' },
        { offset: 3, dur: 0.55, mode: 'block', accent: 0.8, variant: 'base' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.1, mode: 'block', accent: 1.0, variant: 'base' },
        { offset: 2.5, dur: 0.45, mode: 'block', accent: 0.78, variant: 'sideSlipDown' },
        { offset: 3, dur: 0.75, mode: 'block', accent: 0.9, variant: 'base' }
      ]
    }
  ],

  // Balada lenta (5 células)
  'balada-lenta': [
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 2.4, mode: 'strum-down', accent: 0.92, variant: 'base' },
        { offset: 2.5, dur: 1.3, mode: 'upper', accent: 0.7, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 1.8, mode: 'strum-down', accent: 0.88, variant: 'invUp' },
        { offset: 2, dur: 1.3, mode: 'upper', accent: 0.74, variant: 'color13' },
        { offset: 3.5, dur: 0.65, mode: 'upper', accent: 0.68, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 3.4, mode: 'strum-down', accent: 0.9, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 1.4, mode: 'strum-down', accent: 0.92, variant: 'base' },
        { offset: 1.5, dur: 0.9, mode: 'upper', accent: 0.68, variant: 'color13', optional: true },
        { offset: 3, dur: 1.0, mode: 'upper', accent: 0.75, variant: 'invUp' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 1.0, mode: 'strum-down', accent: 0.92, variant: 'base' },
        { offset: 1.5, dur: 0.7, mode: 'upper', accent: 0.66, variant: 'color9' },
        { offset: 2.5, dur: 0.8, mode: 'upper', accent: 0.72, variant: 'invUp' },
        { offset: 3.5, dur: 0.65, mode: 'upper', accent: 0.7, variant: 'base', anticipateNext: true }
      ]
    }
  ],

  // Rasgueo balada / pop (6 células)
  'rasgueo-balada': [
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.9, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 1.5, dur: 0.65, mode: 'strum-up', accent: 0.68, variant: 'base' },
        { offset: 2.5, dur: 0.6, mode: 'strum-up', accent: 0.74, variant: 'color9' },
        { offset: 3, dur: 0.8, mode: 'strum-down', accent: 0.86, variant: 'base' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 1.0, mode: 'strum-down', accent: 0.94, variant: 'invUp' },
        { offset: 1, dur: 0.55, mode: 'strum-down', accent: 0.76, variant: 'base', optional: true },
        { offset: 2.5, dur: 0.55, mode: 'strum-up', accent: 0.72, variant: 'color13' },
        { offset: 3.5, dur: 0.65, mode: 'strum-up', accent: 0.8, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.7, mode: 'strum-down', accent: 0.95, variant: 'base' },
        { offset: 2, dur: 1.6, mode: 'strum-down', accent: 0.82, variant: 'color9' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 1.2, mode: 'strum-down', accent: 0.96, variant: 'color13' },
        { offset: 2, dur: 0.75, mode: 'strum-down', accent: 0.84, variant: 'base' },
        { offset: 3.5, dur: 0.65, mode: 'strum-up', accent: 0.78, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 1.3, mode: 'strum-down', accent: 0.94, variant: 'invUp' },
        { offset: 2.5, dur: 1.1, mode: 'strum-up', accent: 0.76, variant: 'color9' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.8, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 1, dur: 0.45, mode: 'strum-down', accent: 0.74, variant: 'base' },
        { offset: 1.5, dur: 0.5, mode: 'strum-up', accent: 0.66, variant: 'color9', optional: true },
        { offset: 2.5, dur: 0.55, mode: 'strum-up', accent: 0.74, variant: 'color13' },
        { offset: 3, dur: 0.75, mode: 'strum-down', accent: 0.86, variant: 'base' }
      ]
    }
  ],

  // Funk 16 (6 células)
  'funk-16': [
    {
      density: 'medium',
      hits: [
        { offset: 0, dur: 0.35, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 0.75, dur: 0.25, mode: 'strum-up', accent: 0.74, variant: 'color9' },
        { offset: 2, dur: 0.35, mode: 'strum-down', accent: 0.88, variant: 'base' },
        { offset: 3.5, dur: 0.35, mode: 'strum-up', accent: 0.8, variant: 'color13' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.32, mode: 'strum-down', accent: 0.95, variant: 'invUp' },
        { offset: 1.5, dur: 0.3, mode: 'strum-up', accent: 0.78, variant: 'color9', optional: true },
        { offset: 2.75, dur: 0.25, mode: 'strum-up', accent: 0.72, variant: 'base' },
        { offset: 3.75, dur: 0.35, mode: 'strum-up', accent: 0.84, variant: 'base', anticipateNext: true }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 0.4, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 2.5, dur: 0.35, mode: 'strum-up', accent: 0.82, variant: 'color13' }
      ]
    },
    {
      density: 'medium',
      hits: [
        { offset: 0.75, dur: 0.28, mode: 'strum-up', accent: 0.76, variant: 'color9' },
        { offset: 1.5, dur: 0.32, mode: 'strum-down', accent: 0.88, variant: 'invUp' },
        { offset: 3, dur: 0.35, mode: 'strum-down', accent: 0.84, variant: 'base' }
      ]
    },
    {
      density: 'sparse',
      hits: [
        { offset: 0, dur: 0.35, mode: 'strum-down', accent: 0.96, variant: 'color9' },
        { offset: 1.75, dur: 0.28, mode: 'strum-up', accent: 0.78, variant: 'base' }
      ]
    },
    {
      density: 'active',
      hits: [
        { offset: 0, dur: 0.3, mode: 'strum-down', accent: 0.98, variant: 'base' },
        { offset: 0.75, dur: 0.25, mode: 'strum-up', accent: 0.72, variant: 'color9' },
        { offset: 2, dur: 0.3, mode: 'strum-down', accent: 0.88, variant: 'invUp', optional: true },
        { offset: 2.75, dur: 0.25, mode: 'strum-up', accent: 0.76, variant: 'color13' },
        { offset: 3.75, dur: 0.35, mode: 'strum-up', accent: 0.86, variant: 'base', anticipateNext: true }
      ]
    }
  ]
};

/**
 * Selecciona una célula rítmica con reglas Markovianas:
 * - Nunca repite el mismo índice consecutivo.
 * - Equilibra densidad (tras 'active' favorece 'sparse'/'medium'; tras 'sparse' favorece 'medium'/'active').
 * - En compases previos a cambio de acorde, da mayor peso a células con anticipación natural.
 */
function selectStochasticCell(cells, { family, absBar, isLastBeforeChange, memory, rng }) {
  const candidates = [];
  cells.forEach((cell, idx) => {
    // En bossa respeta el rol A (compás par) / B (compás impar) de la clave real de 2 compases
    if (family === 'bossa') {
      const expectedRole = absBar % 2 === 0 ? 'A' : 'B';
      if (cell.barRole && cell.barRole !== expectedRole) return;
    }

    let weight = 1.0;
    // Anti-repetición estricta cuando hay más de 1 candidata
    if (idx === memory.lastCellIdx && cells.length > 2) {
      weight *= 0.04;
    }
    // Balance pregunta / respuesta de densidad
    if (memory.lastDensity === 'active') {
      if (cell.density === 'sparse') weight *= 2.4;
      else if (cell.density === 'medium') weight *= 1.5;
      else weight *= 0.45;
    } else if (memory.lastDensity === 'sparse') {
      if (cell.density === 'medium') weight *= 2.0;
      else if (cell.density === 'active') weight *= 1.6;
      else weight *= 0.45;
    }
    // En compás previo a cambio armónico, favorece ligeramente células con empuje/anticipación
    if (isLastBeforeChange && cell.hits.some((h) => h.anticipateNext)) {
      weight *= 1.75;
    }
    candidates.push({ item: { cell, idx }, weight });
  });

  const chosen = pickWeighted(candidates.length > 0 ? candidates : [{ item: { cell: cells[0], idx: 0 }, weight: 1 }], rng);
  memory.lastCellIdx = chosen.idx;
  memory.lastDensity = chosen.cell.density || 'medium';
  return chosen;
}

/**
 * Elige dinámicamente una coloración armónica para modo 'vivo' evitando repetir mecánicamente
 * el mismo color y manteniendo la tonalidad anclada en los primeros golpes.
 */
function pickLiveVariant(suggestedVariant, { chordSymbol, family, sameBarIdx, hitIdx, memory, rng }) {
  if (suggestedVariant === 'base' && hitIdx === 0 && sameBarIdx === 0) return 'base';

  const parsed = parseChord(chordSymbol);
  const qLow = String(parsed?.quality || '').toLowerCase();
  const isMinor = qLow.startsWith('m') && !qLow.startsWith('maj');
  const isDimOrHalf = qLow.includes('dim') || qLow.includes('b5') || qLow.includes('b9');
  if (isDimOrHalf) return hitIdx > 0 && rng() < 0.35 ? 'invUp' : 'base';

  // Construye piscina de colores musicales válidos según estilo y calidad
  const pool = [
    { item: 'base', weight: hitIdx === 0 ? 1.4 : 0.7 },
    { item: 'color9', weight: 1.5 },
    { item: 'invUp', weight: 1.2 }
  ];
  if (!isMinor) {
    pool.push({ item: 'color13', weight: 1.4 });
    if (family === 'shuffle' || qLow === '7') {
      pool.push({ item: 'bluesNeighbor', weight: hitIdx > 0 ? 1.35 : 0.35 });
    }
  }
  // Side-slip solo en compases repetidos o contratiempos débiles (nunca en el primer tiempo fuerte del primer compás)
  if ((sameBarIdx >= 1 || hitIdx > 0) && (family === 'swing-negras' || family === 'shuffle')) {
    pool.push({ item: 'sideSlipDown', weight: 0.45 });
    pool.push({ item: 'sideSlipUp', weight: 0.4 });
  }
  // Favorece ligeramente la sugerencia idiomática de la célula pero con apertura aleatoria real
  for (const entry of pool) {
    if (entry.item === suggestedVariant) entry.weight *= 1.35;
    if (entry.item === memory.lastVariant && entry.item !== 'base') entry.weight *= 0.35;
  }

  const chosen = pickWeighted(pool, rng);
  memory.lastVariant = chosen;
  return chosen;
}

/**
 * Planifica los ataques de acordes (comping) para un evento armónico de cualquier duración,
 * devolviendo además metadatos en vivo (`displaySymbol`, `techniqueLabel`, `isVariation`) para
 * visualizar en pantalla qué acorde/coloración exacta está tocando el acompañamiento.
 *
 * @param {object} params Parámetros de planificación.
 * @returns {Array<{ beatOffset: number, durationBeats: number, midis: number[], mode: string, volumeScale: number, strumMs: number, humanizeMs: number, tag: string, baseSymbol: string, displaySymbol: string, techniqueLabel: string, isVariation: boolean }>}
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
  isPiano = false,
  memory = null,
  rng = Math.random
}) {
  const sorted = [...voicingMidis].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const feel = normalizeCompingFeel(compingFeel);
  const family = normalizePatternFamily(pattern);
  const bpm = Math.max(1, Number(beatsPerMeasure) || 4);
  const totalBeats = Math.max(0.5, Number(durationBeats) || bpm);
  const baseBarIndex = Math.max(0, Number(context.barIndex) || 0);
  const prevSameBars = Math.max(0, Number(context.prevSameBars) || 0);
  const changesAfter = Boolean(context.changesAfterEvent ?? (nextChordSymbol && nextChordSymbol !== chordSymbol));
  const nextSorted = [...(nextVoicingMidis || [])].filter(Number.isFinite).sort((a, b) => a - b);
  const mem = memory || createCompingMemory();
  const rand = typeof rng === 'function' ? rng : Math.random;

  if (feel === 'fijo' || family === 'bloque') {
    return [{
      beatOffset: 0,
      durationBeats: totalBeats,
      midis: sorted,
      mode: 'block',
      volumeScale: 1.0,
      strumMs: 0,
      humanizeMs: 0,
      tag: 'fijo',
      baseSymbol: chordSymbol,
      displaySymbol: chordSymbol,
      techniqueLabel: 'Base',
      isVariation: false
    }];
  }

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

    const cells = ORGANIC_CELLS[family] || (family === 'negras-abajo' || family === 'rock-corcheas' ? ORGANIC_CELLS['rasgueo-balada'] : null);

    if (cells && barDur >= 2.5) {
      const { cell, idx: cellIdx } = selectStochasticCell(cells, {
        family,
        absBar,
        isLastBeforeChange,
        memory: mem,
        rng: rand
      });

      cell.hits.forEach((h, hIdx) => {
        if (h.offset >= barDur - 0.05) return;

        // Omisión probabilística sutil (~18 %) en golpes opcionales para romper simetrías
        if (h.optional && rand() < 0.18) return;

        // Anticipación probabilística (~65 % en el último compás previo a cambio, ~80 % si hubo varios compases iguales)
        const antProb = sameBarIdx >= 1 ? 0.8 : 0.6;
        const useAnticipation = Boolean(h.anticipateNext && isLastBeforeChange && nextSorted.length > 0 && rand() < antProb);

        let chosenVariant = 'base';
        let targetMidis = useAnticipation ? nextSorted : sorted;
        let tag = useAnticipation ? 'anticipation' : `cell-${cellIdx}`;

        if (!useAnticipation && feel === 'vivo') {
          chosenVariant = pickLiveVariant(h.variant || 'base', {
            chordSymbol,
            family,
            sameBarIdx,
            hitIdx: hIdx,
            memory: mem,
            rng: rand
          });
          if (chosenVariant !== 'base') {
            targetMidis = buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: chosenVariant });
            tag = `vivo-${chosenVariant}`;
          }
        }

        const liveDesc = describeLiveCompingChord(
          chordSymbol,
          nextChordSymbol || context.nextChordSymbol,
          chosenVariant,
          useAnticipation
        );

        let playMidis = targetMidis;
        if (h.mode === 'upper' && playMidis.length > 1) {
          playMidis = playMidis.slice(1);
        } else if (h.mode === 'bass') {
          playMidis = [playMidis[0]];
        }

        const effectiveMode = isPiano
          ? 'block'
          : (h.mode === 'upper' || h.mode === 'bass' ? 'block' : h.mode);
        const { humanizeMs, velFactor } = computeHumanizeOffset(rand);

        events.push({
          beatOffset: barStart + h.offset,
          durationBeats: Math.min(h.dur, Math.max(0.28, barDur - h.offset + (useAnticipation ? 0.45 : 0.1))),
          midis: playMidis,
          mode: effectiveMode,
          volumeScale: Number((h.accent * velFactor).toFixed(3)),
          strumMs: effectiveMode === 'block' ? 6 : (effectiveMode === 'strum-up' ? 14 : 18),
          humanizeMs,
          tag,
          baseSymbol: chordSymbol,
          displaySymbol: liveDesc.displaySymbol,
          techniqueLabel: liveDesc.techniqueLabel,
          isVariation: liveDesc.isVariation
        });
      });
      continue;
    }

    if (family === 'vals') {
      const bass = [sorted[0]];
      const upper = sorted.length > 1 ? sorted.slice(1) : sorted;
      const chosenVariant = feel === 'vivo' && rand() < 0.55 ? pickLiveVariant('color9', { chordSymbol, family, sameBarIdx, hitIdx: 1, memory: mem, rng: rand }) : 'base';
      const upperVaried = chosenVariant !== 'base' ? buildVariedVoicing({ baseMidis: upper, chordSymbol, variant: chosenVariant }) : upper;
      const liveDesc = describeLiveCompingChord(chordSymbol, nextChordSymbol, chosenVariant, false);
      const beats = Math.max(1, Math.round(barDur));
      for (let b = 0; b < beats; b++) {
        const isOne = b % 3 === 0;
        const { humanizeMs, velFactor } = computeHumanizeOffset(rand);
        events.push({
          beatOffset: barStart + b,
          durationBeats: isOne ? 1.35 : 0.72,
          midis: isOne ? bass : upperVaried,
          mode: isOne || isPiano ? 'block' : 'strum-down',
          volumeScale: Number(((isOne ? 0.98 : b === 1 ? 0.74 : 0.64) * velFactor).toFixed(3)),
          strumMs: isOne || isPiano ? 4 : 14,
          humanizeMs,
          tag: isOne ? 'vals-bass' : 'vals-upper',
          baseSymbol: chordSymbol,
          displaySymbol: isOne ? chordSymbol : liveDesc.displaySymbol,
          techniqueLabel: isOne ? 'Base' : liveDesc.techniqueLabel,
          isVariation: !isOne && liveDesc.isVariation
        });
      }
      continue;
    }

    if (family === 'arpegio-pima' || family === 'arpegio-asc') {
      const chosenVariant = feel === 'vivo' && rand() < 0.5 ? 'invUp' : 'base';
      const targetMidis = chosenVariant !== 'base' ? buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: chosenVariant }) : sorted;
      const liveDesc = describeLiveCompingChord(chordSymbol, nextChordSymbol, chosenVariant, false);
      const { humanizeMs, velFactor } = computeHumanizeOffset(rand);
      events.push({
        beatOffset: barStart,
        durationBeats: barDur,
        midis: targetMidis,
        mode: family === 'arpegio-pima' ? 'arpeggio-pima' : 'arpeggio-asc',
        volumeScale: Number((0.95 * velFactor).toFixed(3)),
        strumMs: 16,
        humanizeMs,
        tag: family,
        baseSymbol: chordSymbol,
        displaySymbol: liveDesc.displaySymbol,
        techniqueLabel: liveDesc.techniqueLabel,
        isVariation: liveDesc.isVariation
      });
      continue;
    }

    // Compás partido (barDur <= 2 pulsos, ej. ii–V en un compás)
    const { humanizeMs, velFactor } = computeHumanizeOffset(rand);
    const splitVariant = feel === 'vivo' && rand() < 0.5 ? pickLiveVariant('color9', { chordSymbol, family, sameBarIdx, hitIdx: 0, memory: mem, rng: rand }) : 'base';
    const splitMidis = splitVariant !== 'base' ? buildVariedVoicing({ baseMidis: sorted, chordSymbol, variant: splitVariant }) : sorted;
    const splitDesc = describeLiveCompingChord(chordSymbol, nextChordSymbol, splitVariant, false);
    events.push({
      beatOffset: barStart,
      durationBeats: Math.max(0.5, barDur * 0.78),
      midis: splitMidis,
      mode: isPiano ? 'block' : 'strum-down',
      volumeScale: Number((0.92 * velFactor).toFixed(3)),
      strumMs: isPiano ? 5 : 16,
      humanizeMs,
      tag: splitVariant !== 'base' ? `vivo-${splitVariant}` : 'split-bar',
      baseSymbol: chordSymbol,
      displaySymbol: splitDesc.displaySymbol,
      techniqueLabel: splitDesc.techniqueLabel,
      isVariation: splitDesc.isVariation
    });
    if (barDur >= 2 && (family === 'swing-negras' || family === 'shuffle') && rand() < 0.55) {
      const { humanizeMs: h2, velFactor: v2 } = computeHumanizeOffset(rand);
      const doAnt = Boolean(isLastBeforeChange && nextSorted.length > 0 && rand() < 0.6);
      const antDesc = describeLiveCompingChord(chordSymbol, nextChordSymbol, 'base', doAnt);
      events.push({
        beatOffset: barStart + 1.67,
        durationBeats: 0.38,
        midis: doAnt ? nextSorted : splitMidis,
        mode: 'block',
        volumeScale: Number((0.72 * v2).toFixed(3)),
        strumMs: 6,
        humanizeMs: h2,
        tag: doAnt ? 'anticipation' : 'split-push',
        baseSymbol: chordSymbol,
        displaySymbol: antDesc.displaySymbol,
        techniqueLabel: antDesc.techniqueLabel,
        isVariation: antDesc.isVariation
      });
    }
  }

  return events;
}

/**
 * Elige aleatoriamente entre aproximación cromática inferior (-1), superior (+1) o diatónica (±2)
 * hacia `nextRootMidi`, evitando repetir `prevMidi` y respetando el rango del bajo (28..52).
 */
function pickApproachMidi(prevMidi, nextRootMidi, rng = Math.random) {
  const candidates = [];
  if (nextRootMidi - 1 >= 28 && nextRootMidi - 1 !== prevMidi) candidates.push({ item: nextRootMidi - 1, weight: 2.2 });
  if (nextRootMidi + 1 <= 52 && nextRootMidi + 1 !== prevMidi) candidates.push({ item: nextRootMidi + 1, weight: 1.8 });
  if (nextRootMidi - 2 >= 28 && nextRootMidi - 2 !== prevMidi) candidates.push({ item: nextRootMidi - 2, weight: 0.9 });
  if (nextRootMidi + 2 <= 52 && nextRootMidi + 2 !== prevMidi) candidates.push({ item: nextRootMidi + 2, weight: 0.7 });
  if (candidates.length === 0) return Math.max(28, nextRootMidi - 1);
  return pickWeighted(candidates, rng);
}

/**
 * Planifica una línea de bajo acompañante (play-along) no periódica con selección estocástica
 * de contornos y aproximación cromática/diatónica hacia el acorde siguiente.
 */
export function planPlayAlongBass({
  chordSymbol = 'C',
  nextChordSymbol = null,
  durationBeats = 4,
  beatsPerMeasure = 4,
  pattern = 'negras-abajo',
  compingFeel = 'organico',
  context = {},
  memory = null,
  rng = Math.random
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
  const mem = memory || createCompingMemory();
  const rand = typeof rng === 'function' ? rng : Math.random;

  const parsed = parseChord(chordSymbol);
  const qual = String(parsed?.quality || '').toLowerCase();
  const isMinor = qual.startsWith('m') && !qual.startsWith('maj');
  const isDim5 = qual.includes('b5') || qual.includes('dim');
  const third = root + (isMinor ? 3 : 4);
  const fifth = root + (isDim5 ? 6 : 7);
  const sixth = root + 9;
  const flatSeven = root + 10;
  const octave = root + 12 <= 52 ? root + 12 : fifth;

  const prevSameBars = Math.max(0, Number(context.prevSameBars) || 0);
  const nextRoot = resolveBassRootMidi(nextChordSymbol || context.nextChordSymbol);
  const changesAfter = Boolean(context.changesAfterEvent ?? (nextChordSymbol && nextChordSymbol !== chordSymbol));

  const notes = [];
  const barCount = Math.max(1, Math.ceil(totalBeats / bpm - 0.0001));

  for (let subBar = 0; subBar < barCount; subBar++) {
    const barStart = subBar * bpm;
    const barDur = Math.min(bpm, totalBeats - barStart);
    if (barDur <= 0.05) break;

    const sameBarIdx = prevSameBars + subBar;
    const isLastSubBar = subBar === barCount - 1;
    const isLastBeforeChange = isLastSubBar && changesAfter && nextRoot !== null;
    const beats = Math.max(1, Math.round(barDur));

    if (family === 'bossa') {
      const altFifth = fifth <= 46 ? fifth : fifth - 12;
      const pickupMidi = isLastBeforeChange && feel !== 'fijo' ? pickApproachMidi(altFifth, nextRoot, rand) : root;
      const hits = [
        { offset: 0, midi: root, dur: 1.4, acc: 1.0, tag: 'bossa-root' },
        { offset: 1.5, midi: altFifth, dur: 0.45, acc: 0.84, tag: 'bossa-push' },
        { offset: 2, midi: altFifth, dur: 1.4, acc: 0.92, tag: 'bossa-5th' },
        { offset: 3.5, midi: feel === 'fijo' ? root : pickupMidi, dur: 0.45, acc: 0.86, tag: isLastBeforeChange ? 'approach' : 'bossa-push' }
      ];
      hits.forEach((h) => {
        if (h.offset < barDur) {
          const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(rand);
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

    if (family === 'shuffle' || family === 'swing-negras') {
      let seq;
      if (feel === 'fijo') {
        seq = family === 'shuffle' ? [root, third, fifth, sixth] : [root, third, fifth, third];
      } else {
        const contours = family === 'shuffle'
          ? [
              [root, third, fifth, sixth],
              [flatSeven, sixth, fifth, third],
              [root, fifth, octave, flatSeven],
              [root, third, fifth, flatSeven],
              [root, sixth, fifth, third],
              [root, third, root + 5, fifth]
            ]
          : [
              [root, third, fifth, sixth],
              [root, fifth, octave, fifth],
              [sameBarIdx > 0 ? third : root, fifth, isMinor ? flatSeven : sixth, fifth],
              [root, root + 2, third, fifth],
              [root, third, root + 5, fifth],
              [sameBarIdx > 0 ? fifth : root, third, root + 2, third]
            ];
        const weighted = contours.map((c, idx) => ({
          item: { c, idx },
          weight: idx === mem.lastBassContour ? 0.05 : (sameBarIdx === 0 && c[0] === root ? 1.8 : 1.0)
        }));
        const picked = pickWeighted(weighted, rand);
        mem.lastBassContour = picked.idx;
        seq = [...picked.c];
        if (isLastBeforeChange) {
          seq[3] = pickApproachMidi(seq[2], nextRoot, rand);
        }
      }
      for (let b = 0; b < beats; b++) {
        const midi = beats <= 2 && b === 1 && isLastBeforeChange && feel !== 'fijo'
          ? pickApproachMidi(root, nextRoot, rand)
          : seq[b % seq.length];
        const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(rand);
        notes.push({
          beatOffset: barStart + b,
          durationBeats: family === 'shuffle' ? 0.86 : 0.92,
          midi,
          volumeScale: Number(((b === 0 ? 1.0 : 0.9) * hum.velFactor).toFixed(3)),
          humanizeMs: hum.humanizeMs,
          bassInst,
          tag: isLastBeforeChange && b === beats - 1 ? 'approach' : `${family}-walk`
        });
      }
      continue;
    }

    if (family === 'tango-marcato' && feel !== 'fijo' && barDur >= 3) {
      const hum0 = computeHumanizeOffset(rand);
      notes.push({ beatOffset: barStart, durationBeats: 1.1, midi: root, volumeScale: Number((1.0 * hum0.velFactor).toFixed(3)), humanizeMs: hum0.humanizeMs, bassInst, tag: 'tango-root' });
      if (isLastBeforeChange) {
        const app = pickApproachMidi(fifth, nextRoot, rand);
        notes.push({ beatOffset: barStart + 2, durationBeats: 0.85, midi: fifth, volumeScale: 0.88, humanizeMs: 3, bassInst, tag: 'tango-5th' });
        notes.push({ beatOffset: barStart + 3, durationBeats: 0.85, midi: app, volumeScale: 0.92, humanizeMs: 4, bassInst, tag: 'approach' });
      } else if (rand() < 0.55) {
        notes.push({ beatOffset: barStart + 1.5, durationBeats: 0.45, midi: third, volumeScale: 0.78, humanizeMs: 2, bassInst, tag: 'tango-sync' });
        notes.push({ beatOffset: barStart + 2, durationBeats: 1.1, midi: fifth, volumeScale: 0.9, humanizeMs: 3, bassInst, tag: 'tango-5th' });
      } else {
        notes.push({ beatOffset: barStart + 2, durationBeats: 1.1, midi: fifth, volumeScale: 0.9, humanizeMs: 2, bassInst, tag: 'tango-5th' });
      }
      continue;
    }

    if (family === 'balada-lenta' || family === 'bloque') {
      const hum = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(rand);
      if (feel !== 'fijo' && barDur >= 3 && isLastBeforeChange && rand() < 0.7) {
        notes.push({ beatOffset: barStart, durationBeats: barDur - 1, midi: root, volumeScale: hum.velFactor, humanizeMs: hum.humanizeMs, bassInst, tag: 'ballad-root' });
        notes.push({ beatOffset: barStart + barDur - 1, durationBeats: 0.95, midi: pickApproachMidi(root, nextRoot, rand), volumeScale: 0.8, humanizeMs: 4, bassInst, tag: 'approach' });
      } else {
        notes.push({ beatOffset: barStart, durationBeats: barDur * 0.92, midi: root, volumeScale: hum.velFactor, humanizeMs: hum.humanizeMs, bassInst, tag: 'ballad-root' });
      }
      continue;
    }

    const hum0 = feel === 'fijo' ? { humanizeMs: 0, velFactor: 1 } : computeHumanizeOffset(rand);
    notes.push({ beatOffset: barStart, durationBeats: Math.min(2, barDur) * 0.9, midi: root, volumeScale: hum0.velFactor, humanizeMs: hum0.humanizeMs, bassInst, tag: 'root' });
    if (barDur >= 3) {
      const hasApproach = feel !== 'fijo' && isLastBeforeChange && barDur >= 4;
      notes.push({ beatOffset: barStart + 2, durationBeats: (hasApproach ? 1 : Math.min(2, barDur - 2)) * 0.9, midi: fifth, volumeScale: 0.88, humanizeMs: feel === 'fijo' ? 0 : 3, bassInst, tag: '5th' });
      if (hasApproach) {
        notes.push({ beatOffset: barStart + 3, durationBeats: 0.9, midi: pickApproachMidi(fifth, nextRoot, rand), volumeScale: 0.86, humanizeMs: 4, bassInst, tag: 'approach' });
      }
    }
  }

  return notes;
}

/**
 * Pre-genera el coro completo de acompañamiento (acordes + bajo) para una secuencia de eventos
 * armónicos, garantizando sincronía exacta 100 % entre el audio que sonará y las vistas visuales
 * (Cifrado con lookahead, chips de variación en Diagramas y Partitura ABC generada).
 *
 * @param {object} params Parámetros de generación del coro.
 * @param {Array<object>} params.chords Lista de eventos armónicos de la línea de tiempo.
 * @param {number} [params.beatsPerMeasure=4] Pulsos (en negras) por compás.
 * @param {string} [params.pattern='negras-abajo'] Patrón de comping.
 * @param {'fijo'|'organico'|'vivo'} [params.compingFeel='organico'] Feel activo.
 * @param {boolean} [params.isPiano=false] True si se planifica para piano.
 * @param {number} [params.chorusIndex=0] Índice de coro / variación.
 * @param {Function} [params.rng=Math.random] Generador pseudoaleatorio [0..1).
 * @returns {object} Plan completo del coro con `eventsByIndex`, `bassByIndex`, `barsSummary` y `stepVariations`.
 */
export function planChorusComping({
  chords = [],
  beatsPerMeasure = 4,
  pattern = 'negras-abajo',
  compingFeel = 'organico',
  isPiano = false,
  chorusIndex = 0,
  rng = Math.random
}) {
  const feel = normalizeCompingFeel(compingFeel);
  const bpm = Math.max(1, Number(beatsPerMeasure) || 4);
  const rand = typeof rng === 'function' ? rng : Math.random;
  const memory = createCompingMemory();

  const eventsByIndex = [];
  const bassByIndex = [];
  const barsMap = new Map();
  const stepVarsMap = new Map();

  let maxMeasure = 0;

  for (let cIdx = 0; cIdx < chords.length; cIdx++) {
    const chordEv = chords[cIdx];
    const chordMidis = Array.isArray(chordEv.voicingMidis) && chordEv.voicingMidis.length > 0
      ? chordEv.voicingMidis
      : (getChordVoicingMidi(chordEv.symbol, 52)?.chordMidis || []);
    const context = analyzeChordContext(chords, cIdx, bpm, chorusIndex);

    const hits = planCompingEvents({
      chordSymbol: chordEv.symbol,
      nextChordSymbol: context.nextChordSymbol,
      voicingMidis: chordMidis,
      nextVoicingMidis: context.nextVoicingMidis,
      durationBeats: chordEv.durationBeats,
      beatsPerMeasure: bpm,
      pattern: chordEv.rhythm || pattern,
      compingFeel: feel,
      context,
      isPiano,
      memory,
      rng: rand
    });

    const bassNotes = planPlayAlongBass({
      chordSymbol: chordEv.symbol,
      nextChordSymbol: context.nextChordSymbol,
      durationBeats: chordEv.durationBeats,
      beatsPerMeasure: bpm,
      pattern: chordEv.rhythm || pattern,
      compingFeel: feel,
      context,
      memory,
      rng: rand
    });

    eventsByIndex.push(hits);
    bassByIndex.push(bassNotes);

    const evStartBeat = Number(chordEv.beat) || 0;
    const evEndBeat = evStartBeat + (Number(chordEv.durationBeats) || bpm);
    maxMeasure = Math.max(maxMeasure, Math.ceil(evEndBeat / bpm - 1e-6));

    const stepKey = chordEv.stepIndex !== undefined ? chordEv.stepIndex : cIdx;
    if (!stepVarsMap.has(stepKey)) stepVarsMap.set(stepKey, []);
    const stepList = stepVarsMap.get(stepKey);

    for (const hit of hits) {
      const absBeat = evStartBeat + hit.beatOffset;
      const measure = Math.floor(absBeat / bpm + 1e-6) + 1;
      const beatInBar = Math.max(0, absBeat - (measure - 1) * bpm);
      const isAnticipation = hit.tag === 'anticipation';

      if (!barsMap.has(measure)) {
        barsMap.set(measure, { measure, sequence: [] });
      }
      const barEntry = barsMap.get(measure);
      const lastItem = barEntry.sequence[barEntry.sequence.length - 1];
      const itemKey = `${hit.displaySymbol}|${isAnticipation ? 'ant' : 'std'}`;
      const lastKey = lastItem ? `${lastItem.displaySymbol}|${lastItem.isAnticipation ? 'ant' : 'std'}` : '';
      if (itemKey !== lastKey && barEntry.sequence.length < 4) {
        barEntry.sequence.push({
          displaySymbol: hit.displaySymbol || chordEv.symbol,
          baseSymbol: hit.baseSymbol || chordEv.symbol,
          techniqueLabel: hit.techniqueLabel || 'Base',
          isVariation: Boolean(hit.isVariation),
          isAnticipation,
          beatInBar: Number(beatInBar.toFixed(2)),
          midis: [...(hit.midis || [])]
        });
      }

      if (hit.isVariation && hit.displaySymbol && stepList.length < 4) {
        const dup = stepList.some((v) => v.displaySymbol === hit.displaySymbol && v.isAnticipation === isAnticipation);
        if (!dup) {
          stepList.push({
            displaySymbol: hit.displaySymbol,
            techniqueLabel: hit.techniqueLabel || 'Variación',
            isAnticipation,
            midis: [...(hit.midis || [])]
          });
        }
      }
    }
  }

  const barsSummary = {};
  for (const [m, info] of barsMap.entries()) {
    barsSummary[m] = info;
  }

  const stepVariations = {};
  for (const [k, list] of stepVarsMap.entries()) {
    stepVariations[k] = list;
  }

  return {
    id: `${chorusIndex}-${Math.floor(rand() * 1e9).toString(36)}`,
    chorusIndex,
    feel,
    pattern,
    beatsPerMeasure: bpm,
    totalMeasures: Math.max(1, maxMeasure),
    chords,
    eventsByIndex,
    bassByIndex,
    barsSummary,
    stepVariations
  };
}

/**
 * Convierte una nota MIDI escrita a sintaxis ABC actualizando las alteraciones vigentes del compás.
 */
function writtenMidiToAbcTokenInBar(writtenMidi, useFlats, barAcc) {
  const token = midiToAbcPitch(writtenMidi, useFlats, barAcc);
  const pc = mod12(writtenMidi);
  const noteName = pcToNoteName(pc, useFlats);
  const letter = noteName[0];
  const desiredAcc = noteName[1] === '#' ? 1 : noteName[1] === 'b' ? -1 : 0;
  barAcc[letter] = desiredAcc;
  return token;
}

/**
 * Formatea una secuencia de eventos cuantizados en un compás de `slotsPerBar` corcheas (`L:1/8`),
 * garantizando matemáticamente suma exacta de compás (cero errores en `validateAbcMeasures`).
 */
function formatQuantizedBarAbc({ slotMap, slotsPerBar, useFlats, keyMap, includeChords, clampRange, toWritten }) {
  const barAcc = { ...keyMap };
  const activeSlots = [...slotMap.keys()].sort((a, b) => a - b);
  if (activeSlots.length === 0) {
    return `z${slotsPerBar > 1 ? slotsPerBar : ''}`;
  }

  const parts = [];
  let lastChordShown = '';
  if (activeSlots[0] > 0) {
    parts.push(`z${activeSlots[0] > 1 ? activeSlots[0] : ''}`);
  }

  for (let i = 0; i < activeSlots.length; i++) {
    const slot = activeSlots[i];
    const nextSlot = i + 1 < activeSlots.length ? activeSlots[i + 1] : slotsPerBar;
    const span = Math.max(1, nextSlot - slot);
    const entry = slotMap.get(slot);
    const durStr = span === 1 ? '' : String(span);

    let chordPrefix = '';
    if (includeChords && entry.displaySymbol && entry.displaySymbol !== lastChordShown) {
      chordPrefix = `"${entry.displaySymbol}"`;
      lastChordShown = entry.displaySymbol;
    }

    const uniqueMidis = [...new Set((entry.midis || []).filter(Number.isFinite))]
      .map((m) => Math.max(clampRange[0], Math.min(clampRange[1], Math.round(m))))
      .sort((a, b) => a - b);

    if (uniqueMidis.length === 0) {
      parts.push(`${chordPrefix}z${durStr}`);
    } else if (uniqueMidis.length === 1) {
      const tok = writtenMidiToAbcTokenInBar(toWritten(uniqueMidis[0]), useFlats, barAcc);
      parts.push(`${chordPrefix}${tok}${durStr}`);
    } else {
      const tokens = uniqueMidis.map((m) => writtenMidiToAbcTokenInBar(toWritten(m), useFlats, barAcc));
      parts.push(`${chordPrefix}[${tokens.join('')}]${durStr}`);
    }
  }

  return parts.join(' ');
}

/**
 * Convierte un plan pre-generado de coro (`planChorusComping`) en una partitura ABC limpia,
 * con suma exacta de compases (`L:1/8`) y registro válido según `PitchPolicy`:
 * - Piano: gran pentagrama (`%%staves {1 2}`, MD acordes en clave de Sol + MI bajo en clave de Fa).
 * - Guitarra / Clásica: pentagrama `clef=treble-8` con voicings y cifrado enriquecido.
 * - Bajo (4c / 5c): pentagrama `clef=bass` con línea caminante/shuffle y cifrado enriquecido.
 *
 * @param {object} chorusPlan Plan retornado por `planChorusComping`.
 * @param {object} [options={}] Metadatos de cabecera e instrumento.
 * @returns {string} Partitura ABC lista para renderizar con `abcjs` o guardar en el Editor.
 */
export function buildChorusAbcScore(
  chorusPlan,
  { title = 'Variación generada', key = 'C', timeSignature = '4/4', voicingInstrument = 'piano' } = {}
) {
  if (!chorusPlan || !Array.isArray(chorusPlan.chords) || chorusPlan.chords.length === 0) {
    return '';
  }

  const tsMatch = String(timeSignature || '4/4').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  const tsNum = tsMatch ? Math.max(1, Number(tsMatch[1])) : 4;
  const tsDen = tsMatch ? Math.max(1, Number(tsMatch[2])) : 4;
  const slotsPerBar = Math.max(2, Math.round((tsNum / tsDen) * 8));
  const bpm = chorusPlan.beatsPerMeasure || (tsNum * (4 / tsDen));
  const totalMeasures = Math.max(1, chorusPlan.totalMeasures || 1);

  const cleanKey = String(key || 'C').trim().split(/\s+/)[0] || 'C';
  const useFlats = prefersFlats(cleanKey);
  const keyMap = getKeySignatureMap(cleanKey);

  const isPiano = voicingInstrument === 'piano';
  const isBass = voicingInstrument === 'bajo' || voicingInstrument === 'bajo-5';

  // Agrupa eventos de acordes y de bajo en grilla discreta de corcheas (slotsPerBar) por compás
  const chordSlotsByBar = Array.from({ length: totalMeasures }, () => new Map());
  const bassSlotsByBar = Array.from({ length: totalMeasures }, () => new Map());

  const placeInSlot = (map, rawSlot, payload) => {
    let slot = Math.max(0, Math.min(slotsPerBar - 1, rawSlot));
    if (map.has(slot)) {
      if (slot + 1 < slotsPerBar && !map.has(slot + 1)) slot += 1;
    }
    map.set(slot, payload);
  };

  chorusPlan.chords.forEach((chordEv, cIdx) => {
    const evStartBeat = Number(chordEv.beat) || 0;
    const hits = chorusPlan.eventsByIndex?.[cIdx] || [];
    const bassNotes = chorusPlan.bassByIndex?.[cIdx] || [];

    for (const hit of hits) {
      const absBeat = evStartBeat + hit.beatOffset;
      const barIdx = Math.floor(absBeat / bpm + 1e-6);
      if (barIdx < 0 || barIdx >= totalMeasures) continue;
      const beatInBar = Math.max(0, absBeat - barIdx * bpm);
      const slot = Math.round(beatInBar * 2);
      placeInSlot(chordSlotsByBar[barIdx], slot, {
        displaySymbol: hit.displaySymbol || chordEv.symbol,
        midis: hit.midis || []
      });
    }

    for (const bn of bassNotes) {
      const absBeat = evStartBeat + bn.beatOffset;
      const barIdx = Math.floor(absBeat / bpm + 1e-6);
      if (barIdx < 0 || barIdx >= totalMeasures) continue;
      const beatInBar = Math.max(0, absBeat - barIdx * bpm);
      const slot = Math.round(beatInBar * 2);
      const barSummary = chorusPlan.barsSummary?.[barIdx + 1];
      const symForSlot = slot === 0
        ? (barSummary?.sequence?.[0]?.displaySymbol || chordEv.symbol)
        : '';
      placeInSlot(bassSlotsByBar[barIdx], slot, {
        displaySymbol: symForSlot,
        midis: [bn.midi]
      });
    }
  });

  const joinBars = (bars) => {
    const lines = [];
    for (let i = 0; i < bars.length; i += 4) {
      const chunk = bars.slice(i, i + 4);
      const isEnd = i + 4 >= bars.length;
      lines.push(`${chunk.join(' | ')} ${isEnd ? '|]' : '|'}`);
    }
    return lines.join('\n');
  };

  const safeTitle = String(title || 'Variación generada').replace(/[\r\n]+/g, ' ').trim();

  if (isPiano) {
    const rhBars = chordSlotsByBar.map((slotMap) =>
      formatQuantizedBarAbc({
        slotMap,
        slotsPerBar,
        useFlats,
        keyMap,
        includeChords: true,
        clampRange: [48, 84],
        toWritten: (m) => m
      })
    );
    const lhBars = bassSlotsByBar.map((slotMap) =>
      formatQuantizedBarAbc({
        slotMap,
        slotsPerBar,
        useFlats,
        keyMap,
        includeChords: false,
        clampRange: [28, 55],
        toWritten: (m) => m
      })
    );
    return [
      'X:1',
      `T:${safeTitle}`,
      `M:${tsNum}/${tsDen}`,
      'L:1/8',
      `K:${cleanKey}`,
      '%%staves {1 2}',
      'V:1 clef=treble',
      joinBars(rhBars),
      'V:2 clef=bass',
      joinBars(lhBars)
    ].join('\n');
  }

  if (isBass) {
    const bassBars = bassSlotsByBar.map((slotMap) =>
      formatQuantizedBarAbc({
        slotMap,
        slotsPerBar,
        useFlats,
        keyMap,
        includeChords: true,
        clampRange: [28, 62],
        toWritten: (m) => soundingMidiToWrittenMidi(m, 'bajo')
      })
    );
    return [
      'X:1',
      `T:${safeTitle}`,
      `M:${tsNum}/${tsDen}`,
      'L:1/8',
      `K:${cleanKey} clef=bass`,
      joinBars(bassBars)
    ].join('\n');
  }

  // Guitarra / Guitarra clásica (clef=treble-8)
  const guitarBars = chordSlotsByBar.map((slotMap) =>
    formatQuantizedBarAbc({
      slotMap,
      slotsPerBar,
      useFlats,
      keyMap,
      includeChords: true,
      clampRange: [40, 81],
      toWritten: (m) => soundingMidiToWrittenMidi(m, 'guitarra')
    })
  );
  return [
    'X:1',
    `T:${safeTitle}`,
    `M:${tsNum}/${tsDen}`,
    'L:1/8',
    `K:${cleanKey} clef=treble-8`,
    joinBars(guitarBars)
  ].join('\n');
}
