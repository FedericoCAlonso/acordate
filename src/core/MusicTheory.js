/**
 * Nombres cromáticos con sostenidos indexados por clase de altura (0 = C .. 11 = B).
 */
export const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Nombres cromáticos con bemoles indexados por clase de altura (0 = C .. 11 = B).
 */
export const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Tonalidades disponibles para selección en filtros, transposición y generadores.
 */
export const ALL_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Mapa de nombre de nota a su clase de altura cromática (0 a 11).
 */
export const NOTE_TO_PC = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11
};

/**
 * Conjunto de tonalidades que convencionalmente usan bemoles en la armadura.
 */
export const FLAT_KEY_NAMES = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

/**
 * Armaduras de clave en ABC: cantidad de sostenidos (+) o bemoles (-) por tonalidad mayor.
 */
const MAJOR_KEY_ACCIDENTALS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7
};

/**
 * Orden de sostenidos en las armaduras de clave.
 */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/**
 * Orden de bemoles en las armaduras de clave.
 */
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/**
 * Intervalos en semitonos desde la raíz para cada cualidad de acorde soportada.
 */
export const CHORD_QUALITIES = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '-': [0, 3, 7],
  dim: [0, 3, 6],
  o: [0, 3, 6],
  aug: [0, 4, 8],
  '+': [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  '-7': [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  ø: [0, 3, 6, 10],
  ø7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  o7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 18],
  '7alt': [0, 4, 8, 10, 13],
  '13': [0, 4, 7, 10, 21]
};

/**
 * Normaliza un entero módulo 12 siempre en el rango [0, 11].
 * @param {number} n Entero arbitrario.
 * @returns {number} Clase de altura en [0, 11].
 */
export function mod12(n) {
  return ((n % 12) + 12) % 12;
}

/**
 * Indica si una tonalidad utiliza bemoles por convención.
 * @param {string} keyName Nombre de la tonalidad (ej. "F", "Bb", "Dm").
 * @returns {boolean} True si prefiere bemoles.
 */
export function prefersFlats(keyName) {
  if (!keyName) return false;
  const clean = keyName.trim().split(/\s+/)[0];
  return FLAT_KEY_NAMES.has(clean) || clean.includes('b');
}

/**
 * Convierte una clase de altura (0-11) en nombre de nota.
 * @param {number} pc Clase de altura cromática.
 * @param {boolean} [useFlats=false] True para usar bemoles en lugar de sostenidos.
 * @returns {string} Nombre de nota (ej. "F#" o "Gb").
 */
export function pcToNoteName(pc, useFlats = false) {
  const index = mod12(pc);
  return useFlats ? FLAT_NOTES[index] : SHARP_NOTES[index];
}

/**
 * Convierte una nota con octava (ej. "C4", "F#2", "Bb3") a número MIDI.
 * @param {string} noteStr Nota con octava científica (C4 = 60).
 * @returns {number} Número de nota MIDI.
 */
export function noteNameToMidi(noteStr) {
  const match = String(noteStr).trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) {
    throw new Error(`Nota inválida: ${noteStr}`);
  }
  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  const pc = NOTE_TO_PC[`${letter}${accidental}`];
  return (octave + 1) * 12 + pc;
}

/**
 * Convierte un número MIDI en frecuencia en Hertz (A4 = 440 Hz).
 * @param {number} midi Número MIDI (0-127).
 * @returns {number} Frecuencia en Hz.
 */
export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Devuelve un mapa de alteraciones por letra natural ('C'..'B') según la tonalidad ABC.
 * @param {string} keyStr Valor del campo K: (ej. "F", "G", "Dm", "Bb").
 * @returns {Record<string, number>} Mapa letra -> alteración (-1, 0, +1).
 */
export function getKeySignatureMap(keyStr = 'C') {
  const map = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const clean = String(keyStr).trim().split(/\s+/)[0];
  if (!clean || clean === 'none') return map;

  const match = clean.match(/^([A-G][#b]?)(m|min|dor|mix|lyd|phr|loc)?/i);
  if (!match) return map;

  let root = match[1];
  const mode = (match[2] || '').toLowerCase();
  let rootPc = NOTE_TO_PC[root];
  if (rootPc === undefined) return map;

  // Determina la relativa mayor para calcular la armadura
  const modeOffsets = {
    '': 0,
    m: 3,
    min: 3,
    dor: -2,
    phr: -4,
    lyd: -5,
    mix: -7,
    loc: 1
  };
  const majorPc = mod12(rootPc + (modeOffsets[mode] ?? 0));
  const useFlats = prefersFlats(clean);
  const majorName = pcToNoteName(majorPc, useFlats);
  const count = MAJOR_KEY_ACCIDENTALS[majorName] ?? MAJOR_KEY_ACCIDENTALS[pcToNoteName(majorPc, !useFlats)] ?? 0;

  if (count > 0) {
    for (let i = 0; i < count; i++) map[SHARP_ORDER[i]] = 1;
  } else if (count < 0) {
    for (let i = 0; i < Math.abs(count); i++) map[FLAT_ORDER[i]] = -1;
  }
  return map;
}

/**
 * Convierte un número MIDI a sintaxis de altura ABC (C4 = "C", C5 = "c", C3 = "C,").
 * Considera la armadura de clave para no redundar alteraciones innecesarias.
 * @param {number} midi Número MIDI a convertir.
 * @param {boolean} [useFlats=false] Si true, prefiere bemoles para notas cromáticas.
 * @param {Record<string, number>|null} [keyMap=null] Armadura de clave activa para emitir =, ^ o _ correctamente.
 * @returns {string} Token de altura en notación ABC.
 */
export function midiToAbcPitch(midi, useFlats = false, keyMap = null) {
  const pc = mod12(midi);
  const octave = Math.floor(midi / 12) - 1;
  const noteName = pcToNoteName(pc, useFlats);
  const letter = noteName[0];
  const desiredAcc = noteName[1] === '#' ? 1 : noteName[1] === 'b' ? -1 : 0;

  let accPrefix = '';
  if (keyMap) {
    const keyAcc = keyMap[letter] || 0;
    if (desiredAcc !== keyAcc) {
      accPrefix = desiredAcc === 1 ? '^' : desiredAcc === -1 ? '_' : '=';
    }
  } else if (desiredAcc === 1) {
    accPrefix = '^';
  } else if (desiredAcc === -1) {
    accPrefix = '_';
  }

  let pitchCore = '';
  if (octave >= 5) {
    pitchCore = letter.toLowerCase() + "'".repeat(octave - 5);
  } else if (octave === 4) {
    pitchCore = letter;
  } else {
    pitchCore = letter + ','.repeat(4 - octave);
  }

  return `${accPrefix}${pitchCore}`;
}

/**
 * Convierte un token de nota ABC (ej. "_e", "^F,", "c'") a número MIDI.
 * @param {string} abcNoteToken Token de altura ABC sin duración.
 * @param {Record<string, number>} [keyMap] Armadura de clave activa.
 * @param {Record<string, number>} [barAccidentals] Alteraciones accidentales vigentes dentro del compás.
 * @returns {number|null} Número MIDI o null si no corresponde a una nota válida.
 */
export function abcPitchToMidi(abcNoteToken, keyMap = null, barAccidentals = null) {
  const match = String(abcNoteToken).match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)$/);
  if (!match) return null;

  const [, accStr, letter, octaveMarks] = match;
  const upper = letter.toUpperCase();
  const basePc = NOTE_TO_PC[upper];

  let octave = letter === upper ? 4 : 5;
  for (const ch of octaveMarks) {
    if (ch === ',') octave -= 1;
    if (ch === "'") octave += 1;
  }

  let acc = 0;
  const pitchKey = `${upper}${octave}`;
  if (accStr) {
    if (accStr === '^') acc = 1;
    else if (accStr === '^^') acc = 2;
    else if (accStr === '_') acc = -1;
    else if (accStr === '__') acc = -2;
    else if (accStr === '=') acc = 0;
    if (barAccidentals) barAccidentals[pitchKey] = acc;
  } else if (barAccidentals && barAccidentals[pitchKey] !== undefined) {
    acc = barAccidentals[pitchKey];
  } else if (keyMap && keyMap[upper] !== undefined) {
    acc = keyMap[upper];
  }

  return (octave + 1) * 12 + basePc + acc;
}

/**
 * Parsea un símbolo de acorde en cifrado americano y devuelve raíz, cualidad, intervalos y bajo.
 * @param {string} symbol Símbolo del acorde (ej. "Dm7", "G7/B", "F#m7b5").
 * @returns {{ raw: string, root: string, rootPc: number, quality: string, intervals: number[], bass: string|null, bassPc: number|null }|null} Acorde parseado o null.
 */
export function parseChord(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const trimmed = symbol.trim();
  const [mainPart, bassPart] = trimmed.split('/');
  const match = mainPart.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) return null;

  const root = `${match[1]}${match[2]}`;
  const rootPc = NOTE_TO_PC[root];
  if (rootPc === undefined) return null;

  const quality = match[3] || '';
  const intervals = CHORD_QUALITIES[quality] || inferChordIntervals(quality);

  let bass = null;
  let bassPc = null;
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-G][#b]?)$/);
    if (bassMatch && NOTE_TO_PC[bassMatch[1]] !== undefined) {
      bass = bassMatch[1];
      bassPc = NOTE_TO_PC[bass];
    }
  }

  return {
    raw: trimmed,
    root,
    rootPc,
    quality,
    intervals,
    bass,
    bassPc
  };
}

/**
 * Infiere los intervalos de un acorde si su cualidad tiene extensiones no listadas literalmente.
 * @param {string} quality Sufijo del acorde (ej. "m11", "7b13").
 * @returns {number[]} Arreglo de intervalos en semitonos.
 */
function inferChordIntervals(quality) {
  const q = quality || '';
  const isMinor = q.startsWith('m') && !q.startsWith('maj');
  const isDim = q.includes('dim') || q.includes('o');
  const isAug = q.includes('aug') || q.includes('+');
  const isSus4 = q.includes('sus4');
  const isSus2 = q.includes('sus2');

  const third = isSus4 ? 5 : isSus2 ? 2 : (isMinor || isDim) ? 3 : 4;
  const fifth = isDim || q.includes('b5') ? 6 : (isAug || q.includes('#5')) ? 8 : 7;
  const intervals = [0, third, fifth];

  if (q.includes('maj7') || q.includes('M7') || q.includes('maj9')) intervals.push(11);
  else if (q.includes('dim7') || q.includes('o7')) intervals.push(9);
  else if (q.includes('7') || q.includes('9') || q.includes('11') || q.includes('13')) intervals.push(10);
  else if (q.includes('6')) intervals.push(9);

  if (q.includes('b9')) intervals.push(13);
  else if (q.includes('#9')) intervals.push(15);
  else if (q.includes('9')) intervals.push(14);

  return intervals;
}

/**
 * Construye un voicing MIDI equilibrado para reproducir el acompañamiento de un acorde.
 * @param {string} chordSymbol Símbolo del acorde en cifrado americano.
 * @param {number} [baseOctaveMidi=48] Altura base de referencia (48 = C3 para acompañamiento de guitarra).
 * @returns {{ bassMidi: number, chordMidis: number[] }|null} Notas MIDI para bajo y bloque de acorde.
 */
export function getChordVoicingMidi(chordSymbol, baseOctaveMidi = 48) {
  const parsed = parseChord(chordSymbol);
  if (!parsed) return null;

  const bassPc = parsed.bassPc !== null ? parsed.bassPc : parsed.rootPc;
  // Mantiene el bajo del acorde entre E2 (40) y Eb3 (51)
  let bassMidi = 36 + bassPc;
  if (bassMidi < 40) bassMidi += 12;

  const rootMidi = baseOctaveMidi + parsed.rootPc;
  const chordMidis = parsed.intervals.map((interval) => {
    let note = rootMidi + interval;
    while (note > 72) note -= 12;
    while (note < 48) note += 12;
    return note;
  });

  // Ordena las voces y elimina duplicados
  const uniqueSorted = [...new Set(chordMidis)].sort((a, b) => a - b);
  return { bassMidi, chordMidis: uniqueSorted };
}

/**
 * Transpone un símbolo de acorde una cantidad de semitonos, respetando bajos invertidos.
 * @param {string} symbol Acorde original (ej. "Dm7", "G7/B").
 * @param {number} semitones Cantidad de semitonos a transponer (puede ser negativa).
 * @param {boolean} [useFlats=false] Si true, escribe notas alteradas con bemoles.
 * @returns {string} Símbolo de acorde transpuesto.
 */
export function transposeChordSymbol(symbol, semitones, useFlats = false) {
  if (!symbol || semitones === 0) return symbol;
  const parsed = parseChord(symbol);
  if (!parsed) return symbol;

  const newRoot = pcToNoteName(parsed.rootPc + semitones, useFlats);
  let result = `${newRoot}${parsed.quality}`;
  if (parsed.bassPc !== null) {
    const newBass = pcToNoteName(parsed.bassPc + semitones, useFlats);
    result += `/${newBass}`;
  }
  return result;
}

/**
 * Transpone una cadena completa en notación ABC (armadura K:, cifrados "..." y notas).
 * Preserva cabeceras, comentarios, indicaciones de digitación y claves (clef=...).
 * @param {string} abcText Texto ABC original.
 * @param {number} semitones Semitonos a desplazar (-11 a +11 o cualquier entero).
 * @returns {string} Nuevo texto ABC transpuesto.
 */
export function transposeAbc(abcText, semitones) {
  if (!abcText || !semitones) return abcText || '';

  const lines = abcText.split('\n');
  let sourceKeyStr = 'C';
  let targetKeyStr = 'C';
  let sourceKeyMap = getKeySignatureMap('C');
  let targetKeyMap = getKeySignatureMap('C');
  let targetUseFlats = false;

  const outputLines = lines.map((line) => {
    const trimmed = line.trim();
    // Comentarios o líneas vacías
    if (!trimmed || trimmed.startsWith('%')) return line;

    // Cabecera de tonalidad K:
    if (/^K:\s*/.test(trimmed)) {
      const rest = trimmed.slice(2).trim();
      const parts = rest.split(/\s+/);
      const rawKey = parts[0] || 'C';
      const trailing = parts.slice(1).join(' ');
      sourceKeyStr = rawKey;
      sourceKeyMap = getKeySignatureMap(rawKey);

      const keyMatch = rawKey.match(/^([A-G][#b]?)(.*)$/);
      if (keyMatch && NOTE_TO_PC[keyMatch[1]] !== undefined) {
        const newPc = mod12(NOTE_TO_PC[keyMatch[1]] + semitones);
        const modeSuffix = keyMatch[2] || '';
        const flatCandidate = pcToNoteName(newPc, true) + modeSuffix;
        const sharpCandidate = pcToNoteName(newPc, false) + modeSuffix;
        targetUseFlats = prefersFlats(flatCandidate) && !['B', 'E', 'A', 'D', 'G', 'F#'].includes(sharpCandidate);
        targetKeyStr = targetUseFlats ? flatCandidate : sharpCandidate;
        targetKeyMap = getKeySignatureMap(targetKeyStr);
        return `K:${targetKeyStr}${trailing ? ' ' + trailing : ''}`;
      }
      return line;
    }

    // Otras cabeceras ABC (X:, T:, M:, L:, Q:, V:, w:, etc.)
    if (/^[A-Za-z]:/.test(trimmed)) {
      return line;
    }

    // Línea de música: transponer acordes "..." y notas respetando compases
    return transposeMusicLine(line, semitones, sourceKeyMap, targetKeyMap, targetUseFlats);
  });

  return outputLines.join('\n');
}

/**
 * Transpone una línea de música ABC procesando tokens de texto, decoraciones, compases y notas.
 * @param {string} line Línea de cuerpo ABC.
 * @param {number} semitones Cantidad de semitonos.
 * @param {Record<string, number>} srcKeyMap Armadura original.
 * @param {Record<string, number>} dstKeyMap Armadura destino.
 * @param {boolean} useFlats Preferencia de bemoles.
 * @returns {string} Línea transpuesta.
 */
function transposeMusicLine(line, semitones, srcKeyMap, dstKeyMap, useFlats) {
  let result = '';
  let i = 0;
  let barAccSrc = {};
  let barAccDst = {};

  while (i < line.length) {
    const ch = line[i];

    // Comentario al final de línea
    if (ch === '%') {
      result += line.slice(i);
      break;
    }

    // Campo inline [K:...], [M:...], [V:...]
    if (ch === '[' && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
      const end = line.indexOf(']', i);
      if (end !== -1) {
        result += line.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // Cadenas entre comillas: acordes ("Dm7") o anotaciones ("^1", "_R")
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      if (end !== -1) {
        const content = line.slice(i + 1, end);
        if (/^[\^_<>@]/.test(content)) {
          result += `"${content}"`;
        } else if (/^[A-G][#b]?/.test(content)) {
          result += `"${transposeChordSymbol(content, semitones, useFlats)}"`;
        } else {
          result += `"${content}"`;
        }
        i = end + 1;
        continue;
      }
    }

    // Decoraciones !fermata!, !accent!, etc.
    if (ch === '!') {
      const end = line.indexOf('!', i + 1);
      if (end !== -1) {
        result += line.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // Barras de compás reinician alteraciones accidentales del compás
    if (ch === '|') {
      barAccSrc = {};
      barAccDst = {};
      result += ch;
      i += 1;
      continue;
    }

    // Nota ABC con posible alteración y marcas de octava
    const noteMatch = line.slice(i).match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/);
    if (noteMatch) {
      const fullToken = noteMatch[0];
      const midi = abcPitchToMidi(fullToken, srcKeyMap, barAccSrc);
      if (midi !== null) {
        const transposedMidi = midi + semitones;
        // Calcula token ABC considerando alteraciones activas en el compás destino
        const abcPitch = midiToAbcInBar(transposedMidi, useFlats, dstKeyMap, barAccDst);
        result += abcPitch;
        i += fullToken.length;
        continue;
      }
    }

    result += ch;
    i += 1;
  }

  return result;
}

/**
 * Convierte un MIDI a nota ABC rastreando alteraciones accidentales dentro del mismo compás.
 * @param {number} midi Número MIDI destino.
 * @param {boolean} useFlats Preferencia de bemoles.
 * @param {Record<string, number>} keyMap Armadura destino.
 * @param {Record<string, number>} barAccDst Mapa mutable de alteraciones activas en el compás.
 * @returns {string} Token ABC de la nota.
 */
function midiToAbcInBar(midi, useFlats, keyMap, barAccDst) {
  const pc = mod12(midi);
  const octave = Math.floor(midi / 12) - 1;
  const noteName = pcToNoteName(pc, useFlats);
  const letter = noteName[0];
  const desiredAcc = noteName[1] === '#' ? 1 : noteName[1] === 'b' ? -1 : 0;
  const pitchKey = `${letter}${octave}`;
  const currentAcc = barAccDst[pitchKey] !== undefined ? barAccDst[pitchKey] : (keyMap[letter] || 0);

  let accPrefix = '';
  if (desiredAcc !== currentAcc) {
    accPrefix = desiredAcc === 1 ? '^' : desiredAcc === -1 ? '_' : '=';
    barAccDst[pitchKey] = desiredAcc;
  }

  let pitchCore = '';
  if (octave >= 5) {
    pitchCore = letter.toLowerCase() + "'".repeat(octave - 5);
  } else if (octave === 4) {
    pitchCore = letter;
  } else {
    pitchCore = letter + ','.repeat(4 - octave);
  }
  return `${accPrefix}${pitchCore}`;
}

/**
 * Extrae la estructura de compases y sus acordes de un texto ABC para la vista de Cifrado (chart).
 * @param {string} abcText Partitura en notación ABC.
 * @returns {Array<{ index: number, chords: string[], raw: string }>} Lista de compases con sus acordes.
 */
export function extractMeasuresFromAbc(abcText) {
  if (!abcText) return [];
  const musicLines = abcText
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith('%') && !/^[A-Za-z]:/.test(t);
    });

  // Si hay múltiples voces (V:1, V:2), prioriza la primera voz para la grilla de acordes
  const fullBody = abcText.split('\n');
  let inPrimaryVoice = true;
  const primaryMusicLines = [];
  let sawVoiceHeader = false;
  for (const line of fullBody) {
    const t = line.trim();
    if (!t || t.startsWith('%')) continue;
    if (/^V:\s*/.test(t)) {
      if (!sawVoiceHeader) {
        sawVoiceHeader = true;
        inPrimaryVoice = true;
      } else {
        inPrimaryVoice = /^V:\s*1\b/.test(t);
      }
      continue;
    }
    if (/^[A-Za-z]:/.test(t)) continue;
    if (inPrimaryVoice) primaryMusicLines.push(t);
  }

  const chosenLines = primaryMusicLines.length > 0 ? primaryMusicLines : musicLines;
  const joined = chosenLines.join(' ').replace(/%.*$/gm, '');
  const rawBars = joined
    .split(/:\|\||\|\|:|\|\]|\[\||:\||\|:|\|\||\|/)
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0 && /[A-Ga-gzZ"]/.test(bar));

  return rawBars.map((raw, idx) => {
    const chords = [];
    const regex = /"([^"]+)"/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const text = match[1].trim();
      if (!/^[\^_<>@]/.test(text) && /^[A-G][#b]?/.test(text)) {
        chords.push(text);
      }
    }
    return {
      index: idx + 1,
      chords,
      raw
    };
  });
}

/**
 * Analiza la función armónica de una nota de bajo respecto al acorde actual y al siguiente.
 * Útil para mostrar etiquetas (R, 3, 5, 7, Crom, Aprox) sobre líneas de walking bass.
 * @param {number} noteMidi Número MIDI de la nota de bajo.
 * @param {string} chordSymbol Acorde vigente en el compás actual.
 * @param {string|null} [nextChordSymbol=null] Acorde del compás siguiente (para detectar aproximaciones).
 * @param {boolean} [isApproachPosition=false] True si la nota está en el último pulso del compás (tiempo 4).
 * @returns {string} Etiqueta corta de función armónica ("R", "3", "b3", "5", "7", "b7", "Crom", "Aprox", etc.).
 */
export function analyzeBassFunction(noteMidi, chordSymbol, nextChordSymbol = null, isApproachPosition = false) {
  const parsed = parseChord(chordSymbol);
  if (!parsed) return '';

  const notePc = mod12(noteMidi);
  const interval = mod12(notePc - parsed.rootPc);
  const chordToneSet = new Set((parsed.intervals || [0, 4, 7]).map((iv) => mod12(iv)));
  const qual = String(parsed.quality || '');
  const isMinorChord = chordToneSet.has(3) && !chordToneSet.has(4);
  const isAugOrAlt = /(\+|aug|#5|alt)/i.test(qual);
  const isLydian = /#11/i.test(qual);
  const hasFlatNine = /(b9|alt)/i.test(qual);

  // En el último pulso del compás (tiempo 4), solo marca aproximación cromática/diatónica
  // cuando el acorde realmente cambia a otra raíz y la nota no es ya nota del acorde vigente
  if (isApproachPosition && nextChordSymbol) {
    const nextParsed = parseChord(nextChordSymbol);
    if (nextParsed && nextParsed.rootPc !== parsed.rootPc && !chordToneSet.has(interval)) {
      const distToNext = mod12(nextParsed.rootPc - notePc);
      if (distToNext === 1 || distToNext === 11) {
        return 'Crom';
      }
      if (distToNext === 2 || distToNext === 10) {
        return 'Aprox';
      }
    }
  }

  switch (interval) {
    case 0: return 'R';
    case 1: return hasFlatNine ? 'b2' : 'Crom';
    case 2: return '2';
    case 3: return 'b3';
    case 4: return '3';
    case 5: return '4';
    case 6: return isLydian ? '#4' : 'b5';
    case 7: return '5';
    case 8: return isAugOrAlt || !isMinorChord ? (isAugOrAlt ? '#5' : 'b6') : 'b6';
    case 9: return '6';
    case 10: return 'b7';
    case 11: return '7';
    default: return 'Paso';
  }
}

/**
 * Extrae el compás (ej. "4/4", "6/8") desde una cadena ABC o devuelve el valor por defecto.
 * @param {string} abcText Texto ABC.
 * @param {string} [fallback='4/4'] Valor por defecto.
 * @returns {string} Compás detectado.
 */
export function extractTimeSignatureFromAbc(abcText, fallback = '4/4') {
  const match = String(abcText || '').match(/^M:\s*([0-9]+\/[0-9]+|C\|?)/m);
  if (!match) return fallback;
  if (match[1] === 'C') return '4/4';
  if (match[1] === 'C|') return '2/2';
  return match[1];
}

/**
 * Parsea un compás de tipo "4/4" o "6/8" en numerador y denominador numéricos.
 * @param {string} timeSignature Cadena de compás.
 * @returns {{ beats: number, beatUnit: number }} Numerador y denominador.
 */
export function parseTimeSignature(timeSignature = '4/4') {
  const match = String(timeSignature).match(/^(\d+)\/(\d+)$/);
  if (!match) return { beats: 4, beatUnit: 4 };
  return {
    beats: Math.max(1, Math.min(16, Number(match[1]))),
    beatUnit: Number(match[2])
  };
}
