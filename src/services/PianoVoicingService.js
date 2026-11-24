import { formatChordSymbol } from '../core/i18n.js';
import {
  NOTE_TO_PC,
  midiToAbcPitch,
  mod12,
  pcToNoteName,
  prefersFlats
} from '../core/MusicTheory.js';
import { Chord } from '../models/Chord.js';

/**
 * Etiquetas legibles para las familias de voicings pianísticos.
 */
export const PIANO_VOICING_FAMILIES = {
  fundamental: 'Posición fundamental',
  inversion: 'Inversiones',
  shell: 'Shell (MI + MD)',
  rootless: 'Rootless (Jazz)',
  drop2: 'Drop 2 (abierto)'
};

/**
 * Límites acústicos del Low Interval Limit (LIL) en mano izquierda de piano:
 * nota grave mínima (MIDI) recomendada para un intervalo dado (en semitonos) sin sonar fangoso.
 */
const LIL_MIN_LOW_MIDI = {
  1: 52, // 2.ª menor >= E3
  2: 50, // 2.ª mayor >= D3
  3: 49, // 3.ª menor >= C#3
  4: 48, // 3.ª mayor >= C3
  5: 48, // 4.ª justa >= C3
  6: 47, // Tritono >= B2
  7: 41  // 5.ª justa >= F2
};

/**
 * Tablas canónicas de digitación pianística (1=pulgar .. 5=meñique) para escalas mayores (1 octava).
 */
const CANONICAL_MAJOR_RH = {
  C: [1, 2, 3, 1, 2, 3, 4, 5],
  G: [1, 2, 3, 1, 2, 3, 4, 5],
  D: [1, 2, 3, 1, 2, 3, 4, 5],
  A: [1, 2, 3, 1, 2, 3, 4, 5],
  E: [1, 2, 3, 1, 2, 3, 4, 5],
  B: [1, 2, 3, 1, 2, 3, 4, 5],
  F: [1, 2, 3, 4, 1, 2, 3, 4],
  Bb: [2, 1, 2, 3, 1, 2, 3, 4],
  'A#': [2, 1, 2, 3, 1, 2, 3, 4],
  Eb: [3, 1, 2, 3, 4, 1, 2, 3],
  'D#': [3, 1, 2, 3, 4, 1, 2, 3],
  Ab: [3, 4, 1, 2, 3, 1, 2, 3],
  'G#': [3, 4, 1, 2, 3, 1, 2, 3],
  Db: [2, 3, 1, 2, 3, 4, 1, 2],
  'C#': [2, 3, 1, 2, 3, 4, 1, 2],
  Gb: [2, 3, 4, 1, 2, 3, 1, 2],
  'F#': [2, 3, 4, 1, 2, 3, 1, 2]
};

const CANONICAL_MAJOR_LH = {
  C: [5, 4, 3, 2, 1, 3, 2, 1],
  G: [5, 4, 3, 2, 1, 3, 2, 1],
  D: [5, 4, 3, 2, 1, 3, 2, 1],
  A: [5, 4, 3, 2, 1, 3, 2, 1],
  E: [5, 4, 3, 2, 1, 3, 2, 1],
  F: [5, 4, 3, 2, 1, 3, 2, 1],
  B: [4, 3, 2, 1, 4, 3, 2, 1],
  Bb: [3, 2, 1, 4, 3, 2, 1, 3],
  'A#': [3, 2, 1, 4, 3, 2, 1, 3],
  Eb: [3, 2, 1, 4, 3, 2, 1, 3],
  'D#': [3, 2, 1, 4, 3, 2, 1, 3],
  Ab: [3, 2, 1, 4, 3, 2, 1, 3],
  'G#': [3, 2, 1, 4, 3, 2, 1, 3],
  Db: [3, 2, 1, 4, 3, 2, 1, 3],
  'C#': [3, 2, 1, 4, 3, 2, 1, 3],
  Gb: [4, 3, 2, 1, 3, 2, 1, 4],
  'F#': [4, 3, 2, 1, 3, 2, 1, 4]
};

/**
 * Tablas canónicas de digitación pianística para escalas menores (natural / armónica / melódica).
 * Respeta las reglas conservatorio (pulgar siempre en tecla blanca en F#m, C#m, Bbm, Ebm, Abm).
 */
const CANONICAL_MINOR_RH = {
  A: [1, 2, 3, 1, 2, 3, 4, 5],
  E: [1, 2, 3, 1, 2, 3, 4, 5],
  B: [1, 2, 3, 1, 2, 3, 4, 5],
  D: [1, 2, 3, 1, 2, 3, 4, 5],
  G: [1, 2, 3, 1, 2, 3, 4, 5],
  C: [1, 2, 3, 1, 2, 3, 4, 5],
  F: [1, 2, 3, 4, 1, 2, 3, 4],
  'F#': [2, 3, 1, 2, 3, 1, 2, 3],
  Gb: [2, 3, 1, 2, 3, 1, 2, 3],
  'C#': [3, 4, 1, 2, 3, 1, 2, 3],
  Db: [3, 4, 1, 2, 3, 1, 2, 3],
  'G#': [3, 4, 1, 2, 3, 1, 2, 3],
  Ab: [3, 4, 1, 2, 3, 1, 2, 3],
  'D#': [3, 1, 2, 3, 4, 1, 2, 3],
  Eb: [3, 1, 2, 3, 4, 1, 2, 3],
  Bb: [2, 1, 2, 3, 1, 2, 3, 4],
  'A#': [2, 1, 2, 3, 1, 2, 3, 4]
};

const CANONICAL_MINOR_LH = {
  A: [5, 4, 3, 2, 1, 3, 2, 1],
  E: [5, 4, 3, 2, 1, 3, 2, 1],
  D: [5, 4, 3, 2, 1, 3, 2, 1],
  G: [5, 4, 3, 2, 1, 3, 2, 1],
  C: [5, 4, 3, 2, 1, 3, 2, 1],
  F: [5, 4, 3, 2, 1, 3, 2, 1],
  B: [4, 3, 2, 1, 4, 3, 2, 1],
  'F#': [4, 3, 2, 1, 3, 2, 1, 4],
  Gb: [4, 3, 2, 1, 3, 2, 1, 4],
  'C#': [3, 2, 1, 4, 3, 2, 1, 3],
  Db: [3, 2, 1, 4, 3, 2, 1, 3],
  'G#': [3, 2, 1, 4, 3, 2, 1, 3],
  Ab: [3, 2, 1, 4, 3, 2, 1, 3],
  'D#': [2, 1, 4, 3, 2, 1, 3, 2],
  Eb: [2, 1, 4, 3, 2, 1, 3, 2],
  Bb: [2, 1, 3, 2, 1, 4, 3, 2],
  'A#': [2, 1, 3, 2, 1, 4, 3, 2]
};

/** Clases de altura correspondientes a teclas negras (C#, D#, F#, G#, A#). */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

/**
 * Devuelve true si la altura MIDI cae sobre una tecla negra del piano.
 * @param {number} midi Número MIDI.
 * @returns {boolean} True si es tecla negra.
 */
export function isBlackKeyMidi(midi) {
  return BLACK_PCS.has(mod12(midi));
}

/**
 * Determina si conviene ortografía con bemoles para un acorde dado (ej. Cm, Gm, Dm, C7, Cdim7, C7b9),
 * evitando forzar bemoles en dominantes de tonalidades con sostenidos (E7, A7, D7, B7, F#7).
 * @param {Chord} chord Instancia de acorde.
 * @returns {boolean} True si prefiere bemoles.
 */
export function prefersFlatsForChord(chord) {
  if (!chord) return false;
  if (chord.root.includes('b')) return true;
  if (chord.root.includes('#')) return false;
  const qid = chord.quality.id || '';
  if (qid.includes('b') || qid.includes('dim') || qid === 'm7b5') return true;
  if (qid.startsWith('m') && !qid.startsWith('maj')) {
    return prefersFlats(`${chord.root}m`);
  }
  if (/^(7|9|11|13|7sus4)$/.test(qid) && ['C', 'F', 'G'].includes(chord.root)) {
    return true;
  }
  return prefersFlats(chord.root);
}

/**
 * Asegura el cumplimiento del Low Interval Limit (LIL) en un conjunto de notas de mano izquierda:
 * evita intervalos cerrados fangosos en el registro grave desplazando la(s) nota(s) superior(es) o
 * el bloque completo hacia un registro acústicamente claro.
 * @param {number[]} midis Notas de mano izquierda.
 * @returns {number[]} Notas ordenadas y respetuosas del LIL.
 */
export function enforceLeftHandLIL(midis = []) {
  const sorted = [...new Set(midis.map(Math.round))].sort((a, b) => a - b);
  if (sorted.length < 2) return sorted;

  // Si hay 2 notas muy cercanas debajo del LIL, eleva todo el par o abre a décima/octava limpia
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const low = sorted[i];
      const gap = sorted[i + 1] - low;
      const minAllowed = LIL_MIN_LOW_MIDI[gap];
      if (minAllowed !== undefined && low < minAllowed) {
        if (sorted.length === 2 && gap <= 4 && low >= 36) {
          // Convierte tercera grave cerrada en décima o sube todo el bloque si excede 16 st
          sorted[1] += 12;
          if (sorted[1] - sorted[0] > 16) {
            sorted[0] += 12;
            sorted[1] -= 0;
          }
        } else {
          for (let k = 0; k < sorted.length; k++) sorted[k] += 12;
        }
        adjusted = true;
        break;
      }
    }
    sorted.sort((a, b) => a - b);
    if (!adjusted) break;
  }
  return sorted;
}

/**
 * Asigna dedos pianísticos ergonómicos (1–5) a un grupo de notas simultáneas (acorde en bloque)
 * para una sola mano (MD o MI), distinguiendo inversiones por distribución real de intervalos.
 * @param {number[]} sortedMidis Notas ordenadas de grave a aguda para esa mano.
 * @param {'rh'|'lh'} hand Mano destino.
 * @returns {Record<number, number>} Mapa midi -> dedo (1..5).
 */
export function assignChordFingers(sortedMidis, hand = 'rh') {
  const map = {};
  const n = sortedMidis.length;
  if (n === 0) return map;
  const span = sortedMidis[n - 1] - sortedMidis[0];

  let pattern;
  if (hand === 'rh') {
    if (n === 1) {
      pattern = [1];
    } else if (n === 2) {
      pattern = span >= 7 ? [1, 5] : span >= 5 ? [1, 4] : [1, 3];
    } else if (n === 3) {
      const gap1 = sortedMidis[1] - sortedMidis[0];
      const gap2 = sortedMidis[2] - sortedMidis[1];
      // 1.ª inversión de tríada (3.ª abajo, 4.ª arriba, ej. E-G-C) => 1-2-5
      pattern = gap2 >= 5 && gap1 <= 4 ? [1, 2, 5] : [1, 3, 5];
    } else if (n === 4) {
      const gap3 = sortedMidis[3] - sortedMidis[2];
      // 1.ª inversión de cuatríada (segunda arriba, ej. E-G-B-C) => 1-2-4-5
      pattern = gap3 <= 2 ? [1, 2, 4, 5] : [1, 2, 3, 5];
    } else {
      pattern = [1, 2, 3, 4, 5];
    }
  } else {
    if (n === 1) {
      pattern = [5];
    } else if (n === 2) {
      pattern = span >= 7 ? [5, 1] : span >= 5 ? [5, 2] : [5, 3];
    } else if (n === 3) {
      const gap1 = sortedMidis[1] - sortedMidis[0];
      const gap2 = sortedMidis[2] - sortedMidis[1];
      // 2.ª inversión de tríada en MI (4.ª abajo, 3.ª arriba, ej. G-C-E) => 5-2-1
      pattern = gap1 >= 5 && gap2 <= 4 ? [5, 2, 1] : [5, 3, 1];
    } else if (n === 4) {
      const gap1 = sortedMidis[1] - sortedMidis[0];
      // 3.ª inversión de cuatríada en MI (segunda abajo, ej. B-C-E-G) => 5-4-2-1
      pattern = gap1 <= 2 ? [5, 4, 2, 1] : [5, 3, 2, 1];
    } else {
      pattern = [5, 4, 3, 2, 1];
    }
  }

  sortedMidis.forEach((m, idx) => {
    map[m] = pattern[Math.min(idx, pattern.length - 1)];
  });
  return map;
}

/**
 * Calcula un mapa de función armónica (R, 3, b3, 5, b7, 7, 9, 11, 13...) para cada pitch class del acorde,
 * usando la propiedad real `chord.quality.labels`.
 * @param {Chord} chord Instancia de acorde.
 * @returns {Map<number, { label: string, isRoot: boolean }>} Mapa pc -> metadata.
 */
function buildChordFunctionMap(chord) {
  const map = new Map();
  const labels = chord.quality.labels || [];
  chord.quality.intervals.forEach((iv, idx) => {
    const pc = mod12(chord.rootPc + iv);
    const label = labels[idx] || (mod12(iv) === 0 ? 'R' : String(iv));
    if (!map.has(pc)) {
      map.set(pc, { label, isRoot: mod12(iv) === 0 });
    }
  });
  if (chord.bassPc !== null && !map.has(chord.bassPc)) {
    map.set(chord.bassPc, { label: 'Bajo', isRoot: false });
  }
  return map;
}

/**
 * Resuelve la etiqueta de función armónica de una nota añadida en voicings jazz (9, b9, #9, 11, #11, b13, 13)
 * cuando no forma parte explícita de los intervalos base del símbolo (ej. 9.ª o 13.ª añadida en Rootless).
 * @param {Chord} chord Acorde base.
 * @param {number} midi Altura MIDI de la nota.
 * @returns {string} Etiqueta armónica limpia.
 */
function resolveExtendedFunctionLabel(chord, midi) {
  const diff = mod12(midi - chord.rootPc);
  const hasSeventh = chord.quality.intervals.some((iv) => mod12(iv) === 10 || mod12(iv) === 11);
  if (diff === 2) return hasSeventh ? '9' : '2';
  if (diff === 1) return 'b9';
  if (diff === 3) return chord.quality.intervals.some((iv) => mod12(iv) === 4) ? '#9' : 'b3';
  if (diff === 5) return hasSeventh ? '11' : '4';
  if (diff === 6) return chord.quality.intervals.some((iv) => mod12(iv) === 7) ? '#11' : 'b5';
  if (diff === 8) return hasSeventh ? 'b13' : '#5';
  if (diff === 9) return hasSeventh ? '13' : '6';
  return chord.getFunctionLabelForMidi(midi);
}

/**
 * Empaqueta un voicing pianístico en un objeto rico, serializable y compatible con AbcService/AudioSynthService.
 * @param {object} spec Datos del voicing.
 * @returns {object} Objeto PianoVoicing listo para vista y audio.
 */
function createPianoVoicingObject({
  id,
  chord,
  family,
  label,
  description,
  inversion = 0,
  lhMidis = [],
  rhMidis = [],
  tags = []
}) {
  const cleanLh = enforceLeftHandLIL(lhMidis);
  const cleanRh = [...new Set(rhMidis.map(Math.round))].sort((a, b) => a - b);
  const allMidis = [...new Set([...cleanLh, ...cleanRh])].sort((a, b) => a - b);
  const fnMap = buildChordFunctionMap(chord);
  const useFlats = prefersFlatsForChord(chord);

  const fingersLh = assignChordFingers(cleanLh, 'lh');
  const fingersRh = assignChordFingers(cleanRh, 'rh');
  const fingersByMidi = { ...fingersLh, ...fingersRh };
  const handsByMidi = {};
  for (const m of cleanLh) handsByMidi[m] = 'lh';
  for (const m of cleanRh) handsByMidi[m] = 'rh';

  const bassMidi = allMidis[0] ?? 48;
  const bassPc = mod12(bassMidi);

  return {
    id,
    isPianoVoicing: true,
    instrument: 'piano',
    chord: chord.americanSymbol,
    family,
    familyLabel: PIANO_VOICING_FAMILIES[family] || family,
    label,
    description,
    inversion,
    lhMidis: cleanLh,
    rhMidis: cleanRh,
    midis: allMidis,
    fingersByMidi,
    handsByMidi,
    tags: [family, ...tags],

    /** Devuelve los MIDI reales ordenados para reproducción directa en AudioSynthService. */
    getMidiNotes() {
      return [...allMidis];
    },

    /** Devuelve metadatos detallados por nota (midi, nombre, función armónica, dedo y mano). */
    getDetailedNotes(notation = 'americano') {
      return allMidis.map((midi) => {
        const pc = mod12(midi);
        const mapped = fnMap.get(pc);
        const fnLabel = mapped ? mapped.label : resolveExtendedFunctionLabel(chord, midi);
        const isRoot = mapped ? mapped.isRoot : pc === chord.rootPc;
        const rawName = pcToNoteName(pc, useFlats);
        return {
          midi,
          pc,
          name: formatChordSymbol(rawName, notation),
          americanName: rawName,
          label: fnLabel,
          isRoot,
          finger: fingersByMidi[midi] || null,
          hand: handsByMidi[midi] || 'rh'
        };
      });
    },

    /** Etiqueta corta de posición/rango del voicing. */
    getPositionLabel() {
      return label;
    },

    /** Devuelve la nota más grave formateada en notación americana o latina. */
    computeBassNote(notation = 'americano') {
      return formatChordSymbol(pcToNoteName(bassPc, useFlats), notation);
    },

    /** Genera partitura ABC en Gran Pentagrama (Sol + Fa) para mostrar este acorde en modo Pentagrama/Ambos. */
    toAbcStaff(notation = 'americano') {
      const sym = formatChordSymbol(chord.americanSymbol, notation);
      const formatChordGroup = (list) => {
        if (!list || list.length === 0) return 'z4';
        if (list.length === 1) return `${midiToAbcPitch(list[0], useFlats)}4`;
        return `[${list.map((m) => midiToAbcPitch(m, useFlats)).join('')}]4`;
      };
      const rhBar = cleanRh.length > 0 ? `"${sym}"${formatChordGroup(cleanRh)}` : `"${sym}"z4`;
      const lhBar = formatChordGroup(cleanLh);
      return [
        'X:1',
        'M:4/4',
        'L:1/4',
        'K:C',
        '%%staves {1 2}',
        'V:1 clef=treble',
        `${rhBar} |]`,
        'V:2 clef=bass',
        `${lhBar} |]`
      ].join('\n');
    }
  };
}

/**
 * Ajusta una lista de notas en bloque para que su registro quede cómodo dentro de [targetMin..targetMax].
 * @param {number[]} midis Lista ascendente de notas MIDI.
 * @param {number} [targetMin=57] MIDI mínimo deseable.
 * @param {number} [targetMax=79] MIDI máximo deseable.
 * @returns {number[]} Notas ajustadas por octavas completas.
 */
function centerMidisInRange(midis, targetMin = 57, targetMax = 79) {
  let out = [...midis].sort((a, b) => a - b);
  while (out.length > 0 && out[out.length - 1] > targetMax && out[0] - 12 >= targetMin - 5) {
    out = out.map((m) => m - 12);
  }
  while (out.length > 0 && out[0] < targetMin - 2 && out[out.length - 1] + 12 <= targetMax + 4) {
    out = out.map((m) => m + 12);
  }
  return out;
}

/**
 * Coloca una nota de bajo en un registro pianístico claro de mano izquierda (E2..G3).
 * @param {number} pc Clase de altura 0..11.
 * @returns {number} Número MIDI real.
 */
function bassMidiForPc(pc) {
  let m = 48 + mod12(pc); // C3..B3
  if (m > 55) m -= 12; // G#3..B3 -> G#2..B2
  return m;
}

/**
 * Construye una disposición cerrada tocable con una sola mano derecha (<= 4 notas, apertura <= 12 semitonos)
 * plegando tensiones > octava y omitiendo la 5.ª justa si el acorde supera 4 notas.
 * @param {Chord} chord Instancia de acorde.
 * @param {number} rootBase MIDI base (C4..B4).
 * @returns {number[]} Notas ascendentes tocables en una sola mano.
 */
function buildPlayableClosedRh(chord, rootBase) {
  const intervals = [...chord.quality.intervals];
  // Si tiene >4 notas (ej. 9, 11, 13, 7alt), la fundamental ya vive en MI: omite la 5.ª justa (7) primero y luego la R si aún >4
  let chosen = [...intervals];
  if (chosen.length > 4) {
    const noFifth = chosen.filter((iv) => mod12(iv) !== 7);
    if (noFifth.length >= 4) chosen = noFifth;
  }
  if (chosen.length > 4) {
    const noRoot = chosen.filter((iv) => iv !== 0);
    if (noRoot.length >= 4) chosen = noRoot;
  }
  // Pliega todas las tensiones a una sola octava (0..11) para garantizar apertura <= 11 semitonos en MD
  const foldedPcs = [...new Set(chosen.map((iv) => mod12(iv)))].sort((a, b) => a - b);
  return centerMidisInRange(foldedPcs.map((semi) => rootBase + semi), 58, 79);
}

/**
 * Genera el conjunto completo de voicings pianísticos idiomáticos para cualquier acorde:
 * Posición fundamental, inversiones (1.ª–3.ª), Shell (MI + MD), Rootless en MI (Bill Evans A y B) y Drop 2 (2+2).
 * @param {string|Chord} chordInput Símbolo americano o instancia Chord.
 * @returns {Array<object>} Lista ordenada de voicings de piano.
 */
export function generatePianoVoicings(chordInput) {
  const chord = chordInput instanceof Chord ? chordInput : Chord.parse(chordInput);
  const intervals = [...chord.quality.intervals];
  const qid = chord.quality.id || '';
  const rootBase = 60 + chord.rootPc; // C4..B4
  const isSlash = chord.bassPc !== null && chord.bassPc !== chord.rootPc;
  const lhRoot = bassMidiForPc(isSlash ? chord.bassPc : chord.rootPc);

  const closedRh = buildPlayableClosedRh(chord, rootBase);
  const results = [];

  // 1) Posición fundamental (con bajo en MI y bloque tocable <= 12 st en MD)
  results.push(
    createPianoVoicingObject({
      id: `piano-${chord.americanSymbol}-root`,
      chord,
      family: 'fundamental',
      label: isSlash ? `Fundamental / bajo ${chord.bass}` : 'Posición fundamental',
      description: 'Acorde cerrado y ergonómico en mano derecha con fundamental (o bajo slash) firme en mano izquierda.',
      inversion: 0,
      lhMidis: [lhRoot],
      rhMidis: closedRh
    })
  );

  // 2) Inversiones cerradas (garantizando orden estrictamente ascendente y span <= 12 st)
  const maxInv = Math.min(3, Math.max(0, closedRh.length - 1));
  const invNames = ['Fundamental', '1.ª inversión', '2.ª inversión', '3.ª inversión'];
  let prev = [...closedRh];
  for (let inv = 1; inv <= maxInv; inv++) {
    const rest = prev.slice(1);
    let top = prev[0] + 12;
    while (rest.length > 0 && top <= rest[rest.length - 1]) top += 12;
    const rotated = [...rest, top];
    const centered = centerMidisInRange(rotated, 57, 81);
    const invBass = isSlash ? lhRoot : bassMidiForPc(mod12(centered[0]));
    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-inv${inv}`,
        chord,
        family: 'inversion',
        label: invNames[inv],
        description: `Mano derecha en ${invNames[inv].toLowerCase()} para enlazar suavemente con acordes vecinos.`,
        inversion: inv,
        lhMidis: [invBass],
        rhMidis: centered
      })
    );
    prev = rotated;
  }

  // Detecta funciones clave con precisión (evitando confundir 9 con 3ª, o 6/bb7 con 7ª)
  const thirdIv = intervals.find((iv) => iv === 3 || iv === 4) ?? intervals.find((iv) => iv === 5 || iv === 2);
  const fifthIv = intervals.find((iv) => iv === 6 || iv === 7 || iv === 8);
  const realSeventhIv = intervals.find((iv) => iv === 10 || iv === 11);
  const sixthOrDim7Iv = intervals.find((iv) => iv === 9);
  const ninthIv = intervals.find((iv) => iv === 13 || iv === 14 || iv === 15);
  const eleventhIv = intervals.find((iv) => iv === 17 || iv === 18);
  const thirteenthIv = intervals.find((iv) => iv === 20 || iv === 21);

  const isDominant = thirdIv === 4 && realSeventhIv === 10;
  const isDim7 = qid === 'dim7' || (thirdIv === 3 && fifthIv === 6 && sixthOrDim7Iv === 9);
  const isSixth = (qid === '6' || qid === 'm6') && sixthOrDim7Iv === 9 && realSeventhIv === undefined;

  // 3) Shell voicing (MI + MD, respetando slash chords, LIL y tensiones reales sin duplicar 7.ª)
  if (thirdIv !== undefined) {
    let lhShell;
    if (isSlash) {
      // En slash chords, MI sostiene únicamente el bajo real (o su octava) sin inventar notas ajenas
      lhShell = [lhRoot];
    } else if (realSeventhIv !== undefined) {
      lhShell = [lhRoot, lhRoot + realSeventhIv];
    } else if (sixthOrDim7Iv !== undefined) {
      lhShell = [lhRoot, lhRoot + sixthOrDim7Iv];
    } else {
      lhShell = [lhRoot, lhRoot + (fifthIv ?? 7)];
    }

    const rhShellIvs = [thirdIv];
    if (eleventhIv !== undefined) {
      rhShellIvs.push(eleventhIv);
    } else if (fifthIv !== undefined && thirteenthIv === undefined) {
      rhShellIvs.push(fifthIv);
    }
    if (thirteenthIv !== undefined) {
      rhShellIvs.push(thirteenthIv);
    }
    if (ninthIv !== undefined) {
      rhShellIvs.push(ninthIv);
    } else if (realSeventhIv !== undefined && isSlash) {
      rhShellIvs.push(realSeventhIv);
    } else if (realSeventhIv !== undefined && rhShellIvs.length < 3) {
      // Si MI ya toca R–7, añade la 9.ª natural en MD en acordes de séptima para sonoridad limpia sin duplicar la sensible
      rhShellIvs.push(isDominant || thirdIv === 4 || thirdIv === 3 ? 14 : 12);
    } else if (rhShellIvs.length < 3) {
      rhShellIvs.push(12);
    }

    const rhShellPcs = [...new Set(rhShellIvs.map((iv) => mod12(iv)))].sort((a, b) => a - b);
    const rhShell = centerMidisInRange(rhShellPcs.map((s) => rootBase + s), 60, 81);
    const shellLabel = isSlash
      ? `Shell sobre bajo ${chord.bass}`
      : realSeventhIv !== undefined
        ? 'Shell (MI: R–7 · MD: 3–color)'
        : isSixth
          ? 'Shell (MI: R–6 · MD: 3–5–8)'
          : isDim7
            ? 'Shell disminuido (MI: R–bb7)'
            : 'Shell abierto (MI: R–5 · MD: 3–5–8)';

    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-shell`,
        chord,
        family: 'shell',
        label: shellLabel,
        description: 'Distribución limpia a dos manos muy usada en jazz, pop moderno y acompañamiento cantabile.',
        inversion: 0,
        lhMidis: lhShell,
        rhMidis: rhShell
      })
    );
  }

  // 4) Voicings Rootless en MANO IZQUIERDA (Bill Evans Tipo A y B, rango C3–A4 = MIDI 48–69)
  const guideUpperIv = realSeventhIv ?? (isSixth ? 9 : undefined);
  if (thirdIv !== undefined && guideUpperIv !== undefined && !isDim7 && qid !== '11') {
    const isAltSharp9 = qid === '7#9';
    const isAltSharp11 = qid === '7#11';
    const isAlt = qid === '7alt';
    // En dominantes (7, 9, 13), Bill Evans reemplaza la 5.ª por la 13.ª (9 st); en 7#11 por #11 (6); en 7alt por b13 (8)
    const middleColor = thirteenthIv !== undefined
      ? mod12(thirteenthIv)
      : isAlt
        ? 8
        : isAltSharp11
          ? 6
          : isDominant && !isAltSharp9 && fifthIv === 7
            ? 9
            : (fifthIv ?? 7);
    const effNinth = ninthIv !== undefined
      ? mod12(ninthIv)
      : isAlt
        ? 1
        : qid === 'm7b5'
          ? 5 // En semidisminuido (locrio), la 11.ª natural (5 st) suena mucho más idiomática que la 9.ª mayor
          : 2;

    const lhBase = 48 + chord.rootPc; // C3..B3

    // Tipo A: [3, 5/13/#11, 7/6, 9/b9/#9] (siempre estrictamente ascendente en MI)
    const buildAscending = (pcs) => {
      const arr = [lhBase + pcs[0]];
      for (let i = 1; i < pcs.length; i++) {
        let m = lhBase + pcs[i];
        while (m <= arr[i - 1]) m += 12;
        arr.push(m);
      }
      return centerMidisInRange(arr, 48, 69);
    };

    const typeA = buildAscending([mod12(thirdIv), middleColor, mod12(guideUpperIv), effNinth]);
    // En 7#9, evita colocar #9 debajo de la 3.ª en Tipo B: usa [b7, 3, b13/5, #9]
    const typeBPcs = isAltSharp9
      ? [mod12(guideUpperIv), mod12(thirdIv), middleColor, effNinth]
      : [mod12(guideUpperIv), effNinth, mod12(thirdIv), middleColor];
    const typeB = buildAscending(typeBPcs);

    const aLabel = isSixth
      ? 'Rootless MI tipo A (3–5–6–9)'
      : isDominant && middleColor === 9
        ? 'Rootless MI tipo A (3–13–♭7–9)'
        : 'Rootless MI tipo A (3–5–7–9)';
    const bLabel = isSixth
      ? 'Rootless MI tipo B (6–9–3–5)'
      : isAltSharp9
        ? 'Rootless MI tipo B (♭7–3–5–♯9)'
        : isDominant && middleColor === 9
          ? 'Rootless MI tipo B (♭7–9–3–13)'
          : 'Rootless MI tipo B (7–9–3–5)';

    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-rootless-a`,
        chord,
        family: 'rootless',
        label: aLabel,
        description: 'Voicing de mano izquierda sin fundamental estilo Bill Evans (deja libre la mano derecha para melodía/solo).',
        inversion: 1,
        lhMidis: typeA,
        rhMidis: []
      }),
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-rootless-b`,
        chord,
        family: 'rootless',
        label: bLabel,
        description: 'Voicing complementario de mano izquierda desde la 7.ª para enlazar ii–V–I por semitono.',
        inversion: 3,
        lhMidis: typeB,
        rhMidis: []
      })
    );
  }

  // 5) Drop 2 abierto (distribución pianística coral 2 notas MI + 2 notas MD respetando LIL y bajo slash)
  if (closedRh.length >= 3) {
    const base4 = closedRh.length >= 4
      ? closedRh.slice(0, 4)
      : [closedRh[0], closedRh[1], closedRh[2], closedRh[0] + 12];
    // Construye desde 2.ª inversión cerrada para lograr bajo limpio en fundamental (o bajo slash)
    const inv2 = [base4[2] - 12, base4[3] - 12, base4[0], base4[1]].sort((a, b) => a - b);
    const dropped = inv2[2] - 12;
    const dropNotes = [dropped, inv2[0], inv2[1], inv2[3]].sort((a, b) => a - b);
    let lhDrop = [dropNotes[0], dropNotes[1]];
    let rhDrop = [dropNotes[2], dropNotes[3]];
    if (isSlash) {
      lhDrop = [lhRoot, dropNotes[1] < lhRoot + 5 ? dropNotes[1] + 12 : dropNotes[1]];
    }
    lhDrop = enforceLeftHandLIL(lhDrop);
    // Evita cruce de manos entre MI y MD
    if (rhDrop[0] <= lhDrop[lhDrop.length - 1]) {
      rhDrop = rhDrop.map((m) => m + 12);
    }

    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-drop2`,
        chord,
        family: 'drop2',
        label: 'Drop 2 abierto (2 MI + 2 MD)',
        description: 'Disposición coral equilibrada a 4 voces (2 notas en mano izquierda y 2 en mano derecha) con máxima claridad.',
        inversion: 0,
        lhMidis: lhDrop,
        rhMidis: rhDrop
      })
    );
  }

  return results;
}

/**
 * Agrupa voicings pianísticos por familia pedagógica para la grilla de la Biblioteca.
 * @param {Array<object>} voicings Lista filtrada de voicings de piano.
 * @returns {Array<{ id: string, label: string, items: Array<{ voicing: object, flatIndex: number }> }>} Grupos.
 */
export function groupPianoVoicingsByFamily(voicings = []) {
  const order = ['fundamental', 'inversion', 'shell', 'rootless', 'drop2'];
  const map = new Map();
  voicings.forEach((v, flatIndex) => {
    const key = v.family || 'fundamental';
    if (!map.has(key)) {
      map.set(key, { id: key, label: PIANO_VOICING_FAMILIES[key] || key, items: [] });
    }
    map.get(key).items.push({ voicing: v, flatIndex });
  });
  return order.filter((k) => map.has(k)).map((k) => map.get(k));
}

/**
 * Calcula la secuencia óptima de conducción de voces para una progresión en piano mediante
 * programación dinámica (algoritmo de Viterbi), minimizando el movimiento total voz a voz
 * y manteniendo consistencia textural entre acordes consecutivos.
 * @param {string[]} chordSymbols Lista de acordes americanos.
 * @param {{ style?: 'todos'|'cerrado'|'shell'|'rootless' }} [options={}] Estilo preferido.
 * @returns {Array<{ chord: string, voicing: object, voiceLeadingCost: number, commonTones: number }>} Secuencia enlazada.
 */
export function computePianoVoiceLeading(chordSymbols = [], { style = 'todos' } = {}) {
  if (!Array.isArray(chordSymbols) || chordSymbols.length === 0) return [];

  const filterByStyle = (list) => {
    if (style === 'shell') {
      const f = list.filter((v) => v.family === 'shell' || v.family === 'drop2');
      return f.length > 0 ? f : list;
    }
    if (style === 'rootless') {
      const f = list.filter((v) => v.family === 'rootless' || v.family === 'shell');
      return f.length > 0 ? f : list;
    }
    if (style === 'cerrado') {
      const f = list.filter((v) => v.family === 'fundamental' || v.family === 'inversion');
      return f.length > 0 ? f : list;
    }
    return list;
  };

  const mainVoices = (v) => (v.rhMidis && v.rhMidis.length >= 2 ? v.rhMidis : v.lhMidis && v.lhMidis.length >= 2 ? v.lhMidis : v.midis);

  const voiceStepDistance = (a, b) => {
    const va = mainVoices(a);
    const vb = mainVoices(b);
    const len = Math.max(va.length, vb.length);
    let cost = 0;
    for (let k = 0; k < len; k++) {
      const na = va[Math.min(k, va.length - 1)];
      const nb = vb[Math.min(k, vb.length - 1)];
      const weight = k === len - 1 ? 1.25 : 1.0; // Peso leve a melodía superior cantabile
      cost += Math.abs(nb - na) * weight;
    }
    return Math.round(cost);
  };

  const transitionCost = (a, b) => {
    const raw = voiceStepDistance(a, b);
    const familyPenalty =
      (a.family === 'rootless') !== (b.family === 'rootless') ? 4 : 0;
    return raw + familyPenalty;
  };

  const commonTonesCount = (a, b) => {
    const setA = new Set(mainVoices(a));
    return mainVoices(b).filter((m) => setA.has(m)).length;
  };

  const pools = chordSymbols.map((sym) => ({ sym, candidates: filterByStyle(generatePianoVoicings(sym)) })).filter((p) => p.candidates.length > 0);
  if (pools.length === 0) return [];

  // Viterbi DP sobre toda la progresión
  const dp = pools.map((p) => p.candidates.map(() => Infinity));
  const back = pools.map((p) => p.candidates.map(() => -1));

  pools[0].candidates.forEach((cand, idx) => {
    // Preferencia suave por comenzar en fundamental/A sin forzar si otra inversión mejora toda la frase
    dp[0][idx] = cand.family === 'fundamental' || cand.id.endsWith('-rootless-a') ? 0 : 1;
  });

  for (let i = 1; i < pools.length; i++) {
    for (let cur = 0; cur < pools[i].candidates.length; cur++) {
      const curV = pools[i].candidates[cur];
      for (let prev = 0; prev < pools[i - 1].candidates.length; prev++) {
        const total = dp[i - 1][prev] + transitionCost(pools[i - 1].candidates[prev], curV);
        if (total < dp[i][cur]) {
          dp[i][cur] = total;
          back[i][cur] = prev;
        }
      }
    }
  }

  // Reconstruye el camino de costo mínimo
  const lastIdx = pools.length - 1;
  let bestLast = 0;
  for (let j = 1; j < dp[lastIdx].length; j++) {
    if (dp[lastIdx][j] < dp[lastIdx][bestLast]) bestLast = j;
  }

  const chosenIndices = new Array(pools.length);
  chosenIndices[lastIdx] = bestLast;
  for (let i = lastIdx; i > 0; i--) {
    chosenIndices[i - 1] = Math.max(0, back[i][chosenIndices[i]]);
  }

  return pools.map((p, i) => {
    const voicing = p.candidates[chosenIndices[i]];
    const prevVoicing = i > 0 ? pools[i - 1].candidates[chosenIndices[i - 1]] : null;
    return {
      chord: p.sym,
      voicing,
      voiceLeadingCost: prevVoicing ? voiceStepDistance(prevVoicing, voicing) : 0,
      commonTones: prevVoicing ? commonTonesCount(prevVoicing, voicing) : 0
    };
  });
}

/**
 * Solver ergonómico por Programación Dinámica para digitaciones pianísticas (1–5) de cualquier
 * secuencia ascendente de teclas MIDI (modos griegos, jazz, pentatónicas, blues, disminuidas, tonos enteros).
 * Garantiza:
 * - Cero repeticiones de dedo consecutivas.
 * - Penalización fuerte al pulgar (1) y meñique (5) en teclas negras cuando existen teclas blancas.
 * - Cruces ergonómicos reales (MD ascendente: f_prev < f_cur o paso {3,4}->1; MI ascendente: f_prev > f_cur o cruce 1->{3,4}).
 * @param {number[]} midis Secuencia ascendente de alturas MIDI.
 * @param {'rh'|'lh'} hand Mano ('rh' derecha, 'lh' izquierda).
 * @returns {number[]} Dedos óptimos (1..5) para cada nota.
 */
function solveErgonomicScaleFingers(midis, hand = 'rh') {
  const N = midis.length;
  if (N === 0) return [];
  if (N === 1) return [hand === 'rh' ? 1 : 5];

  const fingers = [1, 2, 3, 4, 5];
  const dp = Array.from({ length: N }, () => Array(5).fill(Infinity));
  const back = Array.from({ length: N }, () => Array(5).fill(0));

  const keyPenalty = (midi, f, isFirst, isLast) => {
    const black = isBlackKeyMidi(midi);
    let c = 0;
    if (black && f === 1) c += 120; // Nunca pulgar en tecla negra si existe alternativa
    if (black && f === 5) c += 45;
    if (!isFirst && !isLast && f === 5) c += 18; // Meñique reservado para extremos
    return c;
  };

  const stepCost = (prevMidi, curMidi, pf, cf) => {
    if (pf === cf) return Infinity;
    const semi = curMidi - prevMidi;
    const pBlack = isBlackKeyMidi(prevMidi);
    const cBlack = isBlackKeyMidi(curMidi);

    if (hand === 'rh') {
      // Ascendente en MD: avance natural (pf < cf) o paso de pulgar debajo (pf in {3,4,2} -> cf=1)
      if (cf > pf) {
        const fingerJump = cf - pf;
        let c = Math.abs(fingerJump - (semi >= 3 ? 2 : 1)) * 2;
        if (fingerJump > 2 && semi <= 2) c += 12;
        if (pf === 3 && cf === 4 && semi >= 4) c += 10;
        return c;
      }
      // Paso de pulgar: pf -> 1
      if (cf === 1) {
        if (pf === 5) return 60;
        if (pf === 2) return semi >= 3 ? 6 : 14;
        if (pf === 3 || pf === 4) {
          // Paso ideal desde tecla negra hacia tecla blanca
          return pBlack && !cBlack ? 1 : !cBlack ? 3 : 35;
        }
      }
      return 80;
    }

    // Ascendente en MI: avance natural (cf < pf) o cruce sobre el pulgar (pf=1 -> cf in {3,4,2})
    if (cf < pf) {
      const fingerJump = pf - cf;
      let c = Math.abs(fingerJump - (semi >= 3 ? 2 : 1)) * 2;
      if (fingerJump > 2 && semi <= 2) c += 12;
      return c;
    }
    if (pf === 1) {
      if (cf === 5) return 60;
      if (cf === 2) return semi >= 3 ? 6 : 14;
      if (cf === 3 || cf === 4) {
        return !pBlack && cBlack ? 1 : !pBlack ? 3 : 35;
      }
    }
    return 80;
  };

  for (let fi = 0; fi < 5; fi++) {
    const f = fingers[fi];
    const startBias =
      hand === 'rh'
        ? (isBlackKeyMidi(midis[0]) ? (f === 2 || f === 3 ? 0 : 8) : (f === 1 ? 0 : 6))
        : (isBlackKeyMidi(midis[0]) ? (f === 3 || f === 2 ? 0 : 8) : (f === 5 ? 0 : f === 4 ? 3 : 8));
    dp[0][fi] = keyPenalty(midis[0], f, true, false) + startBias;
  }

  for (let i = 1; i < N; i++) {
    const isLast = i === N - 1;
    for (let ci = 0; ci < 5; ci++) {
      const cf = fingers[ci];
      const kp = keyPenalty(midis[i], cf, false, isLast);
      for (let pi = 0; pi < 5; pi++) {
        const pf = fingers[pi];
        const total = dp[i - 1][pi] + stepCost(midis[i - 1], midis[i], pf, cf) + kp;
        if (total < dp[i][ci]) {
          dp[i][ci] = total;
          back[i][ci] = pi;
        }
      }
    }
  }

  let bestLast = 0;
  for (let fi = 1; fi < 5; fi++) {
    if (dp[N - 1][fi] < dp[N - 1][bestLast]) bestLast = fi;
  }
  const out = new Array(N);
  let cur = bestLast;
  for (let i = N - 1; i >= 0; i--) {
    out[i] = fingers[cur];
    cur = back[i][cur];
  }
  return out;
}

/**
 * Expande una digitación canónica de 1 octava (8 elementos) a 2 octavas usando el pivote exacto
 * de paso de pulgar / cruce en la tónica intermedia (ej. Bb mayor MD: 2-1-2-3-1-2-3-[4]-1-2-3-1-2-3-4).
 * @param {number[]} oneOct Digitación de 1 octava (8 dedos).
 * @param {'rh'|'lh'} hand Mano.
 * @param {boolean} startsOnBlack True si la tónica es tecla negra.
 * @param {number} octaves Cantidad de octavas.
 * @returns {number[]} Secuencia expandida de dedos.
 */
function expandCanonicalOneOctave(oneOct, hand, startsOnBlack, octaves) {
  if (octaves === 1) return [...oneOct];
  const seq = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (let i = 0; i < 7; i++) {
      if (oct > 0 && i === 0) {
        if (hand === 'rh') {
          // Si empieza en blanca, el pulgar (1) pasa debajo del 4; si empieza en negra (ej. Bb, Eb, Db), se usa el dedo final (oneOct[7], ej. 4 en Bb)
          seq.push(startsOnBlack ? oneOct[7] : 1);
        } else {
          // En MI ascendente, el pivote de 2.ª octava usa el dedo que llega a la octava (1 en blancas, o el dedo de llegada en negras)
          seq.push(oneOct[7]);
        }
      } else {
        seq.push(oneOct[i]);
      }
    }
  }
  seq.push(oneOct[7]);
  return seq;
}

/**
 * Calcula la secuencia de dedos pianísticos (1–5) para una escala de cualquier longitud
 * (mayor, menor natural/armónica/melódica, modos griegos, pentatónicas, blues, cromática, simétricas)
 * para MD o MI, respetando reglas canónicas de conservatorio y evitando pulgar en tecla negra.
 * @param {string} root Raíz americana ('C'..'B', con # o b).
 * @param {object} scaleDef Definición de escala del ScaleCatalogService.
 * @param {'rh'|'lh'} hand Mano ('rh' derecha, 'lh' izquierda).
 * @param {number} [octaves=1] Cantidad de octavas.
 * @returns {number[]} Arreglo de dedos (1..5) para cada nota ascendente (incluyendo la tónica final).
 */
export function computePianoScaleFingers(root, scaleDef, hand = 'rh', octaves = 1) {
  const intervals = scaleDef.intervals || [0, 2, 4, 5, 7, 9, 11];
  const n = intervals.length;
  const rootPc = NOTE_TO_PC[root] ?? 0;
  const baseMidi = (hand === 'rh' ? 60 : 48) + rootPc;

  const midis = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const iv of intervals) midis.push(baseMidi + oct * 12 + iv);
  }
  midis.push(baseMidi + octaves * 12);

  // 1) Escala cromática: digitación canónica universal (3 en negras, 1 en blancas, 2 en par blanco E-F / B-C)
  if (n === 12 || scaleDef.id === 'cromatica') {
    return midis.map((m, idx) => {
      if (isBlackKeyMidi(m)) return 3;
      const pc = mod12(m);
      if (hand === 'rh') {
        // En MD ascendente: F (5) tras E (4) y C (0) tras B (11) llevan dedo 2
        return (pc === 5 || pc === 0) && idx > 0 ? 2 : 1;
      }
      // En MI ascendente: E (4) antes de F (5) y B (11) antes de C (0) llevan dedo 2
      return (pc === 4 || pc === 11) && idx < midis.length - 1 ? 2 : 1;
    });
  }

  // 2) Escala Mayor (Jónico): tabla canónica exacta en las 12 tonalidades
  if (scaleDef.id === 'mayor') {
    const table = hand === 'rh' ? CANONICAL_MAJOR_RH : CANONICAL_MAJOR_LH;
    const oneOct = table[root] || (hand === 'rh' ? [1, 2, 3, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 3, 2, 1]);
    return expandCanonicalOneOctave(oneOct, hand, isBlackKeyMidi(baseMidi), octaves);
  }

  // 3) Escalas Menores (natural, armónica, melódica): tabla canónica menor verificada para cero pulgar en tecla negra
  if (['menor-natural', 'menor-armonica', 'menor-melodica'].includes(scaleDef.id)) {
    const table = hand === 'rh' ? CANONICAL_MINOR_RH : CANONICAL_MINOR_LH;
    const oneOct = table[root];
    if (oneOct) {
      const candidate = expandCanonicalOneOctave(oneOct, hand, isBlackKeyMidi(baseMidi), octaves);
      // Valida que en menor armónica/melódica las alteraciones del 6.º/7.º grado no metan pulgar en tecla negra
      const thumbOnBlack = candidate.some((f, idx) => f === 1 && isBlackKeyMidi(midis[idx]));
      if (!thumbOnBlack) return candidate;
    }
  }

  // 4) Modos griegos (Lidio, Dórico, Mixolidio, Frigio, Locrio), jazz, pentatónicas, blues, bebop y simétricas:
  // Solver ergonómico DP garantizando cero pulgar innecesario en teclas negras y cruces reales
  return solveErgonomicScaleFingers(midis, hand);
}

/**
 * Construye el layout completo del teclado SVG interactivo para una escala/modo en Piano,
 * reutilizando el catálogo de 22 escalas de ScaleCatalogService con digitaciones 1–5 por mano.
 * @param {object} params Parámetros de escala.
 * @param {string} params.root Raíz americana.
 * @param {object} params.scale Definición de escala.
 * @param {Array<object>} params.notesMeta Metadatos ortográficos de notas (`spellScaleNotes`).
 * @param {'md-1oct'|'mi-1oct'|'ambas-2oct'} [params.systemId='md-1oct'] Sistema seleccionado.
 * @returns {object} Layout listo para `PianoKeyboardView` y reproducción sincronizada.
 */
export function computePianoScaleLayout({ root, scale, notesMeta, systemId = 'md-1oct' }) {
  const rootPc = NOTE_TO_PC[root] ?? 0;
  const hand = systemId === 'mi-1oct' ? 'lh' : 'rh';
  const octaves = systemId === 'ambas-2oct' ? 2 : 1;

  const baseStartMidi = systemId === 'mi-1oct' ? 48 : systemId === 'ambas-2oct' ? 48 : 60;
  const scaleRootMidi = baseStartMidi + rootPc;

  const startMidi = Math.floor(scaleRootMidi / 12) * 12;
  const highestNeeded = scaleRootMidi + 12 * octaves;
  const endMidi = Math.max(startMidi + 24, Math.ceil((highestNeeded + 1) / 12) * 12);

  const metaByPc = new Map(notesMeta.map((m) => [m.pc, m]));
  const intervals = scale.intervals || [0, 2, 4, 5, 7, 9, 11];
  const ascendingMidis = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const iv of intervals) {
      ascendingMidis.push(scaleRootMidi + oct * 12 + iv);
    }
  }
  ascendingMidis.push(scaleRootMidi + octaves * 12);

  const fingerByMidi = new Map();
  if (systemId === 'ambas-2oct') {
    // Octava inferior = digitación de Mano Izquierda (MI); octava superior = digitación de Mano Derecha (MD)
    const lhFingers = computePianoScaleFingers(root, scale, 'lh', 1);
    const rhFingers = computePianoScaleFingers(root, scale, 'rh', 1);
    const perOct = intervals.length;
    for (let i = 0; i < perOct; i++) {
      fingerByMidi.set(ascendingMidis[i], lhFingers[i]);
    }
    for (let i = 0; i <= perOct; i++) {
      const m = ascendingMidis[perOct + i];
      if (m !== undefined) fingerByMidi.set(m, rhFingers[i]);
    }
  } else {
    const fingersSeq = computePianoScaleFingers(root, scale, hand, octaves);
    ascendingMidis.forEach((midi, idx) => {
      if (!fingerByMidi.has(midi)) {
        fingerByMidi.set(midi, fingersSeq[idx]);
      }
    });
  }

  const activeMidiSet = new Set(ascendingMidis);
  const dots = [];
  for (let midi = startMidi; midi <= endMidi; midi++) {
    const pc = mod12(midi);
    const meta = metaByPc.get(pc);
    if (!meta) continue;
    const inPosition = systemId === 'ambas-2oct' ? true : activeMidiSet.has(midi);
    const noteHand = systemId === 'ambas-2oct' ? (midi < scaleRootMidi + 12 ? 'lh' : 'rh') : hand;
    dots.push({
      midi,
      pc,
      name: meta.name,
      degree: meta.degree,
      isRoot: meta.isRoot,
      isCharacteristic: meta.isCharacteristic,
      isAvoid: meta.isAvoid,
      isChordTone: meta.isChordTone,
      inPosition,
      finger: fingerByMidi.get(midi) || null,
      hand: noteHand
    });
  }

  const posLabel =
    systemId === 'mi-1oct'
      ? 'Mano izquierda (5–1)'
      : systemId === 'ambas-2oct'
        ? 'Ambas manos (MI grave + MD aguda)'
        : 'Mano derecha (1–5)';

  return {
    isPiano: true,
    root,
    scale,
    hand,
    octaves,
    startMidi,
    endMidi,
    scaleRootMidi,
    ascendingMidis,
    notesMeta,
    dots,
    positions: [{ id: systemId, label: posLabel }],
    positionIndex: 0,
    activePosition: { id: systemId, label: posLabel }
  };
}
