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
 * Tablas canónicas de digitación pianística (1=pulgar .. 5=meñique) para escalas mayores y menores
 * en las 12 tonalidades (estándar conservatorio / Hanon / Czerny).
 * Índice 0..6 = grados 1..7, índice 7 = octava (grado 1 superior).
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
  Eb: [3, 1, 2, 3, 4, 1, 2, 3],
  Ab: [3, 4, 1, 2, 3, 1, 2, 3],
  Db: [2, 3, 1, 2, 3, 4, 1, 2],
  'C#': [2, 3, 1, 2, 3, 4, 1, 2],
  Gb: [2, 3, 4, 1, 2, 3, 1, 2],
  'F#': [2, 3, 4, 1, 2, 3, 1, 2],
  'A#': [2, 1, 2, 3, 1, 2, 3, 4],
  'D#': [3, 1, 2, 3, 4, 1, 2, 3],
  'G#': [3, 4, 1, 2, 3, 1, 2, 3]
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
  Eb: [3, 2, 1, 4, 3, 2, 1, 3],
  Ab: [3, 2, 1, 4, 3, 2, 1, 3],
  Db: [3, 2, 1, 4, 3, 2, 1, 3],
  'C#': [3, 2, 1, 4, 3, 2, 1, 3],
  Gb: [4, 3, 2, 1, 3, 2, 1, 4],
  'F#': [4, 3, 2, 1, 3, 2, 1, 4],
  'A#': [3, 2, 1, 4, 3, 2, 1, 3],
  'D#': [3, 2, 1, 4, 3, 2, 1, 3],
  'G#': [3, 2, 1, 4, 3, 2, 1, 3]
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
 * Asigna dedos pianísticos ergonómicos (1–5) a un grupo de notas simultáneas (acorde en bloque)
 * para una sola mano (MD o MI).
 * @param {number[]} sortedMidis Notas ordenadas de grave a aguda para esa mano.
 * @param {'rh'|'lh'} hand Mano destino.
 * @returns {Record<number, number>} Mapa midi -> dedo (1..5).
 */
function assignChordFingers(sortedMidis, hand = 'rh') {
  const map = {};
  const n = sortedMidis.length;
  if (n === 0) return map;
  const span = sortedMidis[n - 1] - sortedMidis[0];

  let pattern;
  if (hand === 'rh') {
    if (n === 1) pattern = [1];
    else if (n === 2) pattern = span >= 9 ? [1, 5] : span >= 5 ? [1, 4] : [1, 3];
    else if (n === 3) pattern = span >= 10 ? [1, 3, 5] : [1, 3, 5];
    else if (n === 4) pattern = [1, 2, 3, 5];
    else pattern = [1, 2, 3, 4, 5];
  } else {
    if (n === 1) pattern = [5];
    else if (n === 2) pattern = span >= 9 ? [5, 1] : span >= 5 ? [5, 2] : [5, 3];
    else if (n === 3) pattern = [5, 3, 1];
    else if (n === 4) pattern = [5, 3, 2, 1];
    else pattern = [5, 4, 3, 2, 1];
  }

  sortedMidis.forEach((m, idx) => {
    map[m] = pattern[Math.min(idx, pattern.length - 1)];
  });
  return map;
}

/**
 * Calcula un mapa de función armónica (R, 3, b3, 5, b7, 7, 9, 11, 13...) para cada pitch class del acorde.
 * @param {Chord} chord Instancia de acorde.
 * @returns {Map<number, { label: string, isRoot: boolean }>} Mapa pc -> metadata.
 */
function buildChordFunctionMap(chord) {
  const map = new Map();
  chord.quality.intervals.forEach((iv, idx) => {
    const pc = mod12(chord.rootPc + iv);
    const label = chord.quality.intervalLabels?.[idx] || (iv === 0 ? 'R' : String(iv));
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
  const cleanLh = [...new Set(lhMidis.map(Math.round))].sort((a, b) => a - b);
  const cleanRh = [...new Set(rhMidis.map(Math.round))].sort((a, b) => a - b);
  const allMidis = [...new Set([...cleanLh, ...cleanRh])].sort((a, b) => a - b);
  const fnMap = buildChordFunctionMap(chord);
  const useFlats = prefersFlats(chord.root);

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
        const fn = fnMap.get(pc) || { label: 'N', isRoot: pc === chord.rootPc };
        const rawName = pcToNoteName(pc, useFlats);
        return {
          midi,
          pc,
          name: formatChordSymbol(rawName, notation),
          americanName: rawName,
          label: fn.label,
          isRoot: fn.isRoot,
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
      const rhBar = `"${sym}"${formatChordGroup(cleanRh)}`;
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
 * Ajusta una lista de notas en bloque para que su centro quede cómodo cerca del Do central (C4..G5).
 * @param {number[]} midis Lista ascendente de notas MIDI.
 * @param {number} [targetMin=57] MIDI mínimo deseable para la mano derecha.
 * @param {number} [targetMax=79] MIDI máximo deseable para la mano derecha.
 * @returns {number[]} Notas ajustadas por octavas completas.
 */
function centerRhMidis(midis, targetMin = 57, targetMax = 79) {
  let out = [...midis].sort((a, b) => a - b);
  while (out.length > 0 && out[0] > targetMin + 12 && out[out.length - 1] > targetMax) {
    out = out.map((m) => m - 12);
  }
  while (out.length > 0 && out[0] < targetMin - 3) {
    out = out.map((m) => m + 12);
  }
  return out;
}

/**
 * Coloca una nota de bajo en un registro pianístico claro de mano izquierda (C2..B3, preferentemente E2..G3).
 * @param {number} pc Clase de altura 0..11.
 * @returns {number} Número MIDI real.
 */
function bassMidiForPc(pc) {
  let m = 48 + mod12(pc); // C3..B3
  if (m > 55) m -= 12; // G#3..B3 -> G#2..B2 para cuerpo sin embarrar
  return m;
}

/**
 * Genera el conjunto completo de voicings pianísticos idiomáticos para cualquier acorde:
 * Posición fundamental, inversiones (1.ª, 2.ª, 3.ª), Shell (MI + MD), Rootless (A y B) y Drop 2.
 * @param {string|Chord} chordInput Símbolo americano o instancia Chord.
 * @returns {Array<object>} Lista ordenada de voicings de piano.
 */
export function generatePianoVoicings(chordInput) {
  const chord = chordInput instanceof Chord ? chordInput : Chord.parse(chordInput);
  const intervals = [...chord.quality.intervals];
  const rootBase = 60 + chord.rootPc; // C4..B4
  const lhRoot = bassMidiForPc(chord.bassPc !== null ? chord.bassPc : chord.rootPc);

  // Notas base en posición cerrada (ajustando extensiones a una octava cómoda si exceden 5 notas)
  const closedRootMidis = centerRhMidis(intervals.map((iv) => rootBase + iv), 58, 79);
  const results = [];

  // 1) Posición fundamental (con bajo en MI si es slash o refuerzo limpio en fundamental)
  results.push(
    createPianoVoicingObject({
      id: `piano-${chord.americanSymbol}-root`,
      chord,
      family: 'fundamental',
      label: chord.bass ? `Fundamental / bajo ${chord.bass}` : 'Posición fundamental',
      description: 'Acorde cerrado en mano derecha con fundamental (o bajo slash) firme en mano izquierda.',
      inversion: 0,
      lhMidis: [lhRoot],
      rhMidis: closedRootMidis
    })
  );

  // 2) Inversiones cerradas (1.ª, 2.ª y 3.ª cuando tiene 4+ notas)
  const maxInv = Math.min(3, Math.max(0, closedRootMidis.length - 1));
  const invNames = ['Fundamental', '1.ª inversión', '2.ª inversión', '3.ª inversión'];
  let prev = [...closedRootMidis];
  for (let inv = 1; inv <= maxInv; inv++) {
    const rotated = [...prev.slice(1), prev[0] + 12];
    const centered = centerRhMidis(rotated, 57, 81);
    const invBass = chord.bassPc !== null ? lhRoot : bassMidiForPc(mod12(centered[0]));
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

  // 3) Shell voicing (MI: R + 7ª o R + 3ª; MD: notas guía + color/5ª)
  const thirdIv = intervals.find((iv) => [3, 4, 5, 2].includes(mod12(iv)));
  const fifthIv = intervals.find((iv) => [6, 7, 8].includes(mod12(iv)));
  const seventhIv = intervals.find((iv) => [9, 10, 11].includes(mod12(iv)));
  const ninthIv = intervals.find((iv) => iv >= 13 && [1, 2, 3].includes(mod12(iv)));

  if (thirdIv !== undefined) {
    const lhShell = seventhIv !== undefined
      ? [lhRoot, lhRoot + mod12(seventhIv)]
      : [lhRoot, lhRoot + 7];
    // Respeta Low Interval Limit: si el intervalo de MI es < 7 semitonos y muy grave, sube la nota superior
    if (lhShell.length === 2 && lhShell[1] - lhShell[0] < 5 && lhShell[0] < 48) {
      lhShell[1] += 12;
    }
    const rhShellIvs = [];
    rhShellIvs.push(thirdIv);
    if (fifthIv !== undefined) rhShellIvs.push(fifthIv);
    if (seventhIv !== undefined) rhShellIvs.push(seventhIv);
    if (ninthIv !== undefined) rhShellIvs.push(ninthIv);
    else if (rhShellIvs.length < 3) rhShellIvs.push(12); // octava para claridad
    const rhShell = centerRhMidis(rhShellIvs.map((iv) => rootBase + iv), 60, 81);

    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-shell`,
        chord,
        family: 'shell',
        label: seventhIv !== undefined ? 'Shell (MI: R–7 · MD: 3–5–7)' : 'Shell abierto (MI: R–5 · MD: 3–5–8)',
        description: 'Distribución limpia a dos manos muy usada en jazz, pop moderno y acompañamiento cantabile.',
        inversion: 0,
        lhMidis: lhShell,
        rhMidis: rhShell
      })
    );
  }

  // 4) Voicings Rootless (Tipo A: 3-5-7-9 y Tipo B: 7-9-3-5) — ideales con bajista o en mano izquierda de jazz
  if (thirdIv !== undefined && seventhIv !== undefined) {
    const effFifth = fifthIv !== undefined ? fifthIv : 7;
    const effNinth = ninthIv !== undefined ? mod12(ninthIv) : 2; // 9ª mayor natural por defecto
    const typeARaw = [
      rootBase + mod12(thirdIv),
      rootBase + mod12(effFifth),
      rootBase + mod12(seventhIv),
      rootBase + 12 + effNinth
    ];
    // Asegura orden estrictamente ascendente
    for (let i = 1; i < typeARaw.length; i++) {
      while (typeARaw[i] <= typeARaw[i - 1]) typeARaw[i] += 12;
    }
    const typeA = centerRhMidis(typeARaw, 52, 76);

    const typeBRaw = [
      rootBase + mod12(seventhIv),
      rootBase + 12 + effNinth,
      rootBase + 12 + mod12(thirdIv),
      rootBase + 12 + mod12(effFifth)
    ];
    for (let i = 1; i < typeBRaw.length; i++) {
      while (typeBRaw[i] <= typeBRaw[i - 1]) typeBRaw[i] += 12;
    }
    const typeB = centerRhMidis(typeBRaw, 52, 76);

    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-rootless-a`,
        chord,
        family: 'rootless',
        label: 'Rootless tipo A (3–5–7–9)',
        description: 'Voicing sin fundamental estilo Bill Evans desde la 3.ª; ideal para mano izquierda en trío con contrabajo.',
        inversion: 1,
        lhMidis: [],
        rhMidis: typeA
      }),
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-rootless-b`,
        chord,
        family: 'rootless',
        label: 'Rootless tipo B (7–9–3–5)',
        description: 'Voicing sin fundamental desde la 7.ª para enlazar por semitono en progresiones ii–V–I.',
        inversion: 3,
        lhMidis: [],
        rhMidis: typeB
      })
    );
  }

  // 5) Drop 2 (sonoridad coral abierta a dos manos: baja la 2.ª voz superior una octava hacia MI)
  if (closedRootMidis.length >= 3) {
    const base4 = closedRootMidis.length >= 4
      ? closedRootMidis.slice(0, 4)
      : [...closedRootMidis, closedRootMidis[0] + 12];
    const dropped = base4[base4.length - 2] - 12;
    const upper = base4.filter((_, i) => i !== base4.length - 2);
    results.push(
      createPianoVoicingObject({
        id: `piano-${chord.americanSymbol}-drop2`,
        chord,
        family: 'drop2',
        label: 'Drop 2 abierto',
        description: 'Baja la segunda voz más aguda una octava para lograr amplitud armónica y claridad coral.',
        inversion: 0,
        lhMidis: [dropped],
        rhMidis: upper
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
 * Calcula la secuencia óptima de conducción de voces para una progresión en piano,
 * minimizando el desplazamiento total en semitonos entre acordes consecutivos.
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

  const upperMidis = (v) => (v.rhMidis && v.rhMidis.length > 0 ? v.rhMidis : v.midis);

  const transitionCost = (a, b) => {
    const ma = upperMidis(a);
    const mb = upperMidis(b);
    let cost = 0;
    for (const n of mb) {
      let best = Infinity;
      for (const prev of ma) best = Math.min(best, Math.abs(n - prev));
      cost += Number.isFinite(best) ? best : 4;
    }
    return cost;
  };

  const commonTonesCount = (a, b) => {
    const setA = new Set(upperMidis(a));
    return upperMidis(b).filter((m) => setA.has(m)).length;
  };

  const result = [];
  for (let i = 0; i < chordSymbols.length; i++) {
    const sym = chordSymbols[i];
    const candidates = filterByStyle(generatePianoVoicings(sym));
    if (candidates.length === 0) continue;

    if (i === 0 || result.length === 0) {
      result.push({ chord: sym, voicing: candidates[0], voiceLeadingCost: 0, commonTones: 0 });
      continue;
    }

    const prevVoicing = result[result.length - 1].voicing;
    let bestCandidate = candidates[0];
    let bestCost = transitionCost(prevVoicing, bestCandidate);
    for (let j = 1; j < candidates.length; j++) {
      const c = transitionCost(prevVoicing, candidates[j]);
      if (c < bestCost) {
        bestCost = c;
        bestCandidate = candidates[j];
      }
    }
    result.push({
      chord: sym,
      voicing: bestCandidate,
      voiceLeadingCost: bestCost,
      commonTones: commonTonesCount(prevVoicing, bestCandidate)
    });
  }

  return result;
}

/**
 * Calcula la secuencia de dedos pianísticos (1–5) para una escala de cualquier longitud
 * (heptatónica, pentatónica, blues, cromática, tonos enteros o disminuida) para MD o MI.
 * @param {string} root Raíz americana ('C'..'B', con # o b).
 * @param {object} scaleDef Definición de escala del ScaleCatalogService.
 * @param {'rh'|'lh'} hand Mano ('rh' derecha, 'lh' izquierda).
 * @param {number} [octaves=1] Cantidad de octavas.
 * @returns {number[]} Arreglo de dedos (1..5) para cada nota ascendente (incluyendo la tónica final).
 */
export function computePianoScaleFingers(root, scaleDef, hand = 'rh', octaves = 1) {
  const intervals = scaleDef.intervals || [0, 2, 4, 5, 7, 9, 11];
  const n = intervals.length;
  const totalNotes = n * octaves + 1;
  const rootPc = NOTE_TO_PC[root] ?? 0;

  // Escalas heptatónicas (7 notas): usan digitación canónica por tonalidad y adaptaciones de teclas negras
  if (n === 7) {
    const baseTable = hand === 'rh' ? CANONICAL_MAJOR_RH : CANONICAL_MAJOR_LH;
    let oneOct = baseTable[root] ? [...baseTable[root]] : (hand === 'rh' ? [1, 2, 3, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 3, 2, 1]);

    // Si la tónica es blanca pero el grado 4 es tecla negra (ej. F mayor o F lidio en MD) o tónica negra,
    // aseguramos que el pulgar (1) nunca caiga innecesariamente en tecla negra cuando el vecino es tecla blanca
    const firstMidi = (hand === 'rh' ? 60 : 48) + rootPc;
    if (isBlackKeyMidi(firstMidi) && oneOct[0] === 1) {
      oneOct = hand === 'rh' ? [2, 1, 2, 3, 1, 2, 3, 4] : [3, 2, 1, 4, 3, 2, 1, 3];
    }

    if (octaves === 1) return oneOct;

    // 2 octavas: reemplaza el 5 (MD) o 5 inicial (MI) en el pivote de octava por el paso correspondiente (1 o 4)
    const seq = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (let i = 0; i < 7; i++) {
        if (oct > 0 && i === 0) {
          seq.push(hand === 'rh' ? (isBlackKeyMidi(firstMidi) ? oneOct[0] : 1) : (oneOct[7] === 1 ? 1 : oneOct[0]));
        } else {
          seq.push(oneOct[i]);
        }
      }
    }
    seq.push(oneOct[7]);
    return seq;
  }

  // Escalas pentatónicas (5 notas)
  if (n === 5) {
    const base = hand === 'rh' ? [1, 2, 3, 1, 2] : [5, 4, 3, 2, 1];
    const seq = [];
    for (let i = 0; i < totalNotes - 1; i++) seq.push(base[i % 5]);
    seq.push(hand === 'rh' ? 3 : 1);
    return seq;
  }

  // Escalas de 6 notas (Blues / Tonos enteros)
  if (n === 6) {
    const base = hand === 'rh' ? [1, 2, 3, 1, 2, 3] : [4, 3, 2, 1, 3, 2];
    const seq = [];
    for (let i = 0; i < totalNotes - 1; i++) seq.push(base[i % 6]);
    seq.push(hand === 'rh' ? 4 : 1);
    return seq;
  }

  // Escalas de 8 notas (Disminuida simétrica)
  if (n === 8) {
    const base = hand === 'rh' ? [1, 2, 3, 4, 1, 2, 3, 4] : [4, 3, 2, 1, 4, 3, 2, 1];
    const seq = [];
    for (let i = 0; i < totalNotes - 1; i++) seq.push(base[i % 8]);
    seq.push(hand === 'rh' ? 5 : 1);
    return seq;
  }

  // Respaldo genérico (ej. cromática)
  const seq = [];
  for (let i = 0; i < totalNotes; i++) {
    const midi = (hand === 'rh' ? 60 : 48) + rootPc + (intervals[i % n] || 0);
    seq.push(isBlackKeyMidi(midi) ? 3 : (hand === 'rh' ? 1 : 2));
  }
  return seq;
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

  // Rango visual de teclado: 2 octavas limpias (de Do a Do, 25 teclas) centradas en la mano elegida
  const baseStartMidi = systemId === 'mi-1oct' ? 48 : systemId === 'ambas-2oct' ? 48 : 60;
  const scaleRootMidi = baseStartMidi + rootPc;

  // Rango del teclado visible: siempre inicia en C (Do) debajo o igual a scaleRootMidi y cubre al menos 2 octavas completas
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

  const fingersSeq = computePianoScaleFingers(root, scale, hand, octaves);
  const fingerByMidi = new Map();
  ascendingMidis.forEach((midi, idx) => {
    if (!fingerByMidi.has(midi)) {
      fingerByMidi.set(midi, fingersSeq[idx]);
    }
  });

  const activeMidiSet = new Set(ascendingMidis);
  const dots = [];
  for (let midi = startMidi; midi <= endMidi; midi++) {
    const pc = mod12(midi);
    const meta = metaByPc.get(pc);
    if (!meta) continue;
    const inPosition = systemId === 'ambas-2oct' ? true : activeMidiSet.has(midi);
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
      hand
    });
  }

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
    positions: [
      {
        id: systemId,
        label: systemId === 'mi-1oct' ? 'Mano izquierda (5–1)' : systemId === 'ambas-2oct' ? 'Vista 2 octavas' : 'Mano derecha (1–5)'
      }
    ],
    positionIndex: 0,
    activePosition: {
      id: systemId,
      label: systemId === 'mi-1oct' ? 'Mano izquierda (5–1)' : systemId === 'ambas-2oct' ? 'Vista 2 octavas' : 'Mano derecha (1–5)'
    }
  };
}
