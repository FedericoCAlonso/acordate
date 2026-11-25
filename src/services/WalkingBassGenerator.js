import {
  getKeySignatureMap,
  midiToAbcPitch,
  mod12,
  parseChord,
  parseTimeSignature,
  prefersFlats
} from '../core/MusicTheory.js';

/**
 * Rango escrito en clave de fa (clef=bass) para bajo de 4 cuerdas (E2=40 a Bb3=58 escrito; suena -12).
 * En bajo de 5 cuerdas desciende hasta B1 escrito (35, que suena B0=23).
 */
const BASS_4_MIN_MIDI = 40;
const BASS_5_MIN_MIDI = 35;
const BASS_MAX_MIDI = 58;

/**
 * Salto máximo permitido entre dos notas consecutivas de walking bass (sexta mayor = 9 semitonos).
 */
const MAX_LEAP_SEMITONES = 9;

/** Clases de altura diatónicas de la escala de Do mayor (C, D, E, F, G, A, B). */
const NATURAL_LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Servicio de dominio puro que genera líneas de walking bass en negras a partir de un cifrado
 * o lista de pasos (`steps` con soporte para compases partidos `bars: 0.5`, compás `3/4` y bajo 4c/5c).
 * Reglas implementadas:
 * 1) Raíz (o bajo slash) en el tiempo 1 de cada acorde/compás.
 * 2) Notas del acorde (3ª, 5ª, 7ª o paso escalar en variante movimiento) en los tiempos internos.
 * 3) Aproximación cromática (o diatónica real según armadura) hacia la raíz del acorde siguiente.
 * 4) Evita saltos mayores a una sexta mayor (9 semitonos) y evita repetir la misma nota consecutivamente.
 * 5) Soporta variantes: 'clasico', 'movimiento' y 'tresillos', con alteraciones intra-compás exactas.
 */
export class WalkingBassGenerator {
  /**
   * Genera una línea de walking bass en notación ABC y retorna metadatos verificables por compás.
   * @param {object} options Parámetros de generación.
   * @param {string[]|string} [options.chords] Arreglo de acordes por compás o cadena separada por "|" o espacios.
   * @param {Array<{ chord: string, bars?: number }>} [options.steps] Pasos armónicos con duración en compases (soporta 0.5).
   * @param {string} [options.timeSignature='4/4'] Compás ('4/4' o '3/4').
   * @param {string} [options.key='F'] Tonalidad de referencia.
   * @param {'clasico'|'movimiento'|'tresillos'} [options.variant='clasico'] Estilo de línea.
   * @param {'cromatica'|'diatonica'} [options.approach='cromatica'] Tipo preferido de aproximación.
   * @param {number} [options.bassStrings=4] Cantidad de cuerdas (4 o 5).
   * @param {string} [options.title] Título opcional.
   * @returns {{ abc: string, measures: Array<{ chord: string, nextChord: string, notes: number[], approachType: string }>, title: string }} Resultado completo.
   */
  generate(options = {}) {
    const tsRaw = String(options.timeSignature || '4/4').trim();
    const { beats: tsBeats, beatUnit } = parseTimeSignature(tsRaw);
    const beatsPerBar = Math.max(2, Math.min(4, Math.round(tsBeats * (4 / beatUnit))));
    const timeSigStr = beatsPerBar === 3 ? '3/4' : '4/4';
    const minMidi = Number(options.bassStrings) === 5 ? BASS_5_MIN_MIDI : BASS_4_MIN_MIDI;

    const barSlots = this._buildBarSlots(options.steps, options.chords, beatsPerBar);
    if (barSlots.length === 0) {
      throw new Error('Indicá al menos un acorde para generar la línea de walking bass.');
    }

    const firstChord = barSlots[0][0].chord;
    const key = options.key || parseChord(firstChord)?.root || 'F';
    const variant = options.variant || 'clasico';
    const approachPref = options.approach || 'cromatica';
    const allChordSyms = barSlots.flatMap((bar) => bar.map((s) => s.chord));
    const useFlats = prefersFlats(key) || allChordSyms.some((c) => c.includes('b'));
    const keyMap = getKeySignatureMap(key);
    const diatonicPcs = this._buildDiatonicPcSet(keyMap);
    const title = options.title || `Walking bass en ${key}`;

    // Aplana todos los segmentos de acorde con su índice global para elegir raíces suaves encadenadas
    const flatSegs = [];
    barSlots.forEach((bar, barIdx) => {
      bar.forEach((seg) => {
        flatSegs.push({ ...seg, barIdx });
      });
    });

    const segRoots = [];
    for (let i = 0; i < flatSegs.length; i++) {
      const parsed = parseChord(flatSegs[i].chord);
      const pc = parsed ? (parsed.bassPc ?? parsed.rootPc) : 0;
      const prevRoot = i === 0 ? Math.max(minMidi + 4, 45) : segRoots[i - 1];
      segRoots.push(this._chooseRootMidi(pc, prevRoot, minMidi));
    }

    const measures = [];
    const abcBars = [];
    let segCursor = 0;

    for (let barIdx = 0; barIdx < barSlots.length; barIdx++) {
      const bar = barSlots[barIdx];
      const barAcc = {};
      const barMidis = [];
      const barTokens = [];
      let barApproachType = approachPref;

      for (let sIdx = 0; sIdx < bar.length; sIdx++) {
        const gIdx = segCursor++;
        const seg = bar[sIdx];
        const nextGIdx = (gIdx + 1) % flatSegs.length;
        const chordSymbol = seg.chord;
        const parsed = parseChord(chordSymbol) || { rootPc: 0, intervals: [0, 4, 7, 10], quality: '' };
        const beat1 = segRoots[gIdx];
        const nextRoot = segRoots[nextGIdx];
        const durBeats = seg.beats;

        const approachChoice = this._chooseApproachNote(nextRoot, beat1, approachPref, barIdx, minMidi, diatonicPcs);
        barApproachType = approachChoice.type;

        if (durBeats === 1) {
          barMidis.push(beat1);
          barTokens.push(`"${chordSymbol}"${midiToAbcPitch(beat1, useFlats, keyMap, barAcc)}`);
        } else if (durBeats === 2) {
          // Compás partido (2 negras por acorde): raíz + aproximación o 3ª/5ª sin repetir
          let beat2 = approachChoice.midi;
          if (beat2 === beat1 || Math.abs(beat2 - beat1) > MAX_LEAP_SEMITONES) {
            const { beat2: mid2 } = this._chooseMiddleBeats(parsed, beat1, nextRoot, variant, barIdx, minMidi);
            beat2 = mid2;
          }
          barMidis.push(beat1, beat2);
          const n1 = midiToAbcPitch(beat1, useFlats, keyMap, barAcc);
          const n2 = midiToAbcPitch(beat2, useFlats, keyMap, barAcc);
          barTokens.push(`"${chordSymbol}"${n1} ${n2}`);
        } else if (durBeats === 3) {
          // Compás 3/4 (jazz waltz): raíz, nota del acorde, aproximación
          const beat3 = approachChoice.midi;
          const { beat2 } = this._chooseMiddleBeats(parsed, beat1, beat3, variant, barIdx, minMidi);
          barMidis.push(beat1, beat2, beat3);
          const n1 = midiToAbcPitch(beat1, useFlats, keyMap, barAcc);
          const n2 = midiToAbcPitch(beat2, useFlats, keyMap, barAcc);
          const n3 = midiToAbcPitch(beat3, useFlats, keyMap, barAcc);
          barTokens.push(`"${chordSymbol}"${n1} ${n2} ${n3}`);
        } else {
          // Compás completo 4/4
          const beat4 = approachChoice.midi;
          const { beat2, beat3 } = this._chooseMiddleBeats(parsed, beat1, beat4, variant, barIdx, minMidi);
          barMidis.push(beat1, beat2, beat3, beat4);
          const n1 = midiToAbcPitch(beat1, useFlats, keyMap, barAcc);
          const n2 = midiToAbcPitch(beat2, useFlats, keyMap, barAcc);
          const n3 = midiToAbcPitch(beat3, useFlats, keyMap, barAcc);

          if (variant === 'tresillos' && barIdx % 2 === 1) {
            // Tresillo swing de enlace en el tiempo 4 con 3 alturas distintas (sin repetir n4 dos veces)
            const { firstMidi, midMidi } = this._chooseTripletLinkNotes(beat3, beat4, nextRoot, minMidi);
            const nA = midiToAbcPitch(firstMidi, useFlats, keyMap, barAcc);
            const nB = midiToAbcPitch(midMidi, useFlats, keyMap, barAcc);
            const n4 = midiToAbcPitch(beat4, useFlats, keyMap, barAcc);
            barTokens.push(`"${chordSymbol}"${n1} ${n2} ${n3} (3${nA}/2${nB}/2${n4}/2`);
          } else {
            const n4 = midiToAbcPitch(beat4, useFlats, keyMap, barAcc);
            barTokens.push(`"${chordSymbol}"${n1} ${n2} ${n3} ${n4}`);
          }
        }
      }

      const nextBar = barSlots[(barIdx + 1) % barSlots.length];
      measures.push({
        chord: bar[0].chord,
        chords: bar.map((s) => s.chord),
        nextChord: nextBar[0].chord,
        notes: barMidis,
        approachType: barApproachType
      });
      abcBars.push(barTokens.join(' '));
    }

    const lines = [];
    for (let i = 0; i < abcBars.length; i += 4) {
      const slice = abcBars.slice(i, i + 4);
      const isLast = i + 4 >= abcBars.length;
      lines.push(`${slice.join(' | ')}${isLast ? ' |]' : ' |'}`);
    }

    const abc = [
      'X:1',
      `T:${title}`,
      `M:${timeSigStr}`,
      'L:1/4',
      `K:${key} clef=bass`,
      ...lines
    ].join('\n');

    return {
      abc,
      measures,
      title
    };
  }

  /**
   * Convierte pasos con duración en compases (incluyendo fraccionales como `bars: 0.5`)
   * o una lista simple de acordes en compases exactos de `beatsPerBar` negras.
   */
  _buildBarSlots(steps, chords, beatsPerBar) {
    if (Array.isArray(steps) && steps.length > 0) {
      const bars = [];
      let currentBar = [];
      let usedBeats = 0;

      for (const st of steps) {
        const chord = String(st?.chord || '').trim();
        if (!chord) continue;
        let remainingBeats = Math.max(1, Math.round((Number(st.bars) || 1) * beatsPerBar));
        while (remainingBeats > 0) {
          const space = beatsPerBar - usedBeats;
          const take = Math.min(space, remainingBeats);
          currentBar.push({ chord, beats: take });
          usedBeats += take;
          remainingBeats -= take;
          if (usedBeats >= beatsPerBar) {
            bars.push(currentBar);
            currentBar = [];
            usedBeats = 0;
          }
        }
      }
      if (currentBar.length > 0) {
        const last = currentBar[currentBar.length - 1];
        last.beats += beatsPerBar - usedBeats;
        bars.push(currentBar);
      }
      return bars;
    }

    const chordList = this._normalizeChordList(chords);
    return chordList.map((chord) => [{ chord, beats: beatsPerBar }]);
  }

  /** Construye el conjunto de clases de altura diatónicas (0..11) de la armadura activa. */
  _buildDiatonicPcSet(keyMap) {
    const set = new Set();
    for (const [letter, basePc] of Object.entries(NATURAL_LETTER_PC)) {
      set.add(mod12(basePc + (keyMap?.[letter] || 0)));
    }
    return set;
  }

  /**
   * Normaliza la entrada de acordes (arreglo o cadena con separadores "|" o espacios).
   * @param {string[]|string} input Entrada de cifrado.
   * @returns {string[]} Lista limpia de acordes.
   */
  _normalizeChordList(input) {
    if (Array.isArray(input)) {
      return input.map((c) => String(c).trim()).filter(Boolean);
    }
    if (typeof input === 'string') {
      return input
        .split(/[|,\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Elige la altura MIDI de la raíz en el rango grave del bajo minimizando saltos bruscos.
   */
  _chooseRootMidi(pc, referenceMidi, minMidi = BASS_4_MIN_MIDI) {
    const candidates = [];
    for (let m = minMidi; m <= BASS_MAX_MIDI - 4; m++) {
      if (mod12(m) === pc) candidates.push(m);
    }
    if (candidates.length === 0) return minMidi + pc;
    candidates.sort((a, b) => Math.abs(a - referenceMidi) - Math.abs(b - referenceMidi));
    return candidates[0];
  }

  /**
   * Selecciona la nota de aproximación hacia `nextRoot`:
   * - `'cromatica'`: ±1 semitono.
   * - `'diatonica'`: grado conjunto diatónico real en `diatonicPcs` (±1 si es semitono diatónico, ±2 si es tono).
   */
  _chooseApproachNote(nextRoot, currentRoot, preference, barIndex, minMidi = BASS_4_MIN_MIDI, diatonicPcs = null) {
    const pickDiatonicNeighbor = (dir) => {
      for (const st of [1, 2]) {
        const cand = nextRoot + dir * st;
        if (cand >= minMidi && cand <= BASS_MAX_MIDI && (!diatonicPcs || diatonicPcs.has(mod12(cand)))) {
          return cand;
        }
      }
      const fallback = nextRoot + dir * 2;
      return fallback >= minMidi && fallback <= BASS_MAX_MIDI ? fallback : null;
    };

    const below = preference === 'diatonica' ? pickDiatonicNeighbor(-1) : (nextRoot - 1 >= minMidi ? nextRoot - 1 : null);
    const above = preference === 'diatonica' ? pickDiatonicNeighbor(1) : (nextRoot + 1 <= BASS_MAX_MIDI ? nextRoot + 1 : null);

    let chosen;
    if (below !== null && above !== null) {
      if (nextRoot > currentRoot) chosen = below;
      else if (nextRoot < currentRoot) chosen = above;
      else chosen = barIndex % 2 === 0 ? below : above;
    } else if (below !== null) {
      chosen = below;
    } else if (above !== null) {
      chosen = above;
    } else {
      chosen = Math.max(minMidi, nextRoot - 1);
    }

    return { midi: chosen, type: preference === 'diatonica' ? 'diatonica' : 'cromatica' };
  }

  /**
   * Elige las notas de los tiempos 2 y 3 (notas del acorde con conducción hacia `beat4`),
   * garantizando saltos <= sexta mayor (9 semitonos) y sin notas repetidas consecutivas.
   */
  _chooseMiddleBeats(parsedChord, beat1, beat4, variant, barIndex, minMidi = BASS_4_MIN_MIDI) {
    const qLow = String(parsedChord.quality || '').toLowerCase();
    const isAlteredOrDim = qLow.includes('dim') || qLow.includes('b5') || qLow.includes('b9') || qLow.includes('alt');

    const chordTonePcs = new Set((parsedChord.intervals || [0, 4, 7]).map((iv) => mod12(parsedChord.rootPc + iv)));
    if (variant === 'movimiento' && !isAlteredOrDim) {
      chordTonePcs.add(mod12(parsedChord.rootPc + 2));
      chordTonePcs.add(mod12(parsedChord.rootPc + 9));
    }

    const chordCandidates = [];
    for (let m = minMidi; m <= BASS_MAX_MIDI; m++) {
      if (chordTonePcs.has(mod12(m))) {
        chordCandidates.push(m);
      }
    }

    const thirdPc = mod12(parsedChord.rootPc + (parsedChord.intervals?.[1] ?? 4));
    const fifthPc = mod12(parsedChord.rootPc + (parsedChord.intervals?.[2] ?? 7));

    let bestPair = null;
    let bestScore = Infinity;

    for (const b2 of chordCandidates) {
      if (b2 === beat1) continue;
      const leap12 = Math.abs(b2 - beat1);
      if (leap12 > MAX_LEAP_SEMITONES) continue;

      for (const b3 of chordCandidates) {
        if (b3 === b2 || b3 === beat4) continue;
        const leap23 = Math.abs(b3 - b2);
        const leap34 = Math.abs(beat4 - b3);
        if (leap23 > MAX_LEAP_SEMITONES || leap34 > MAX_LEAP_SEMITONES) continue;

        let score = leap12 * 0.9 + leap23 * 0.9 + leap34 * 1.1;
        const dir12 = Math.sign(b2 - beat1);
        const dir23 = Math.sign(b3 - b2);
        if (dir12 === dir23) score -= 2.2;
        if (mod12(b2) === thirdPc) score -= 2.0;
        if (mod12(b3) === fifthPc) score -= 1.8;
        if (variant === 'movimiento' && leap12 <= 3 && leap23 <= 3) score -= 2.5;
        if (barIndex % 2 === 1 && b2 < beat1) score -= 0.6;

        if (score < bestScore) {
          bestScore = score;
          bestPair = { beat2: b2, beat3: b3 };
        }
      }
    }

    if (bestPair) return bestPair;

    const fallback2 = Math.min(BASS_MAX_MIDI, beat1 + (parsedChord.intervals?.[1] ?? 4));
    const fallback3 = fallback2 === beat4 ? Math.max(minMidi, fallback2 - 2) : Math.min(BASS_MAX_MIDI, beat1 + 7);
    return {
      beat2: fallback2 !== beat1 ? fallback2 : beat1 + 2,
      beat3: fallback3 !== fallback2 && fallback3 !== beat4 ? fallback3 : Math.round((beat1 + beat4) / 2)
    };
  }

  /**
   * Elige 2 notas distintas de enlace antes de `beat4` para formar un tresillo swing limpio
   * `(3 a/2 b/2 beat4/2` sin repetir notas consecutivas.
   */
  _chooseTripletLinkNotes(beat3, beat4, nextRoot, minMidi = BASS_4_MIN_MIDI) {
    const dir = beat4 >= beat3 ? 1 : -1;
    let firstMidi = beat3 + dir;
    let midMidi = beat4 - dir;
    if (firstMidi === beat3 || firstMidi === beat4) firstMidi = beat3 + (beat3 > minMidi + 2 ? -2 : 2);
    if (midMidi === firstMidi || midMidi === beat4) midMidi = beat4 + (beat4 < BASS_MAX_MIDI - 1 ? 1 : -1);
    if (midMidi === firstMidi) midMidi = nextRoot > beat4 ? Math.min(BASS_MAX_MIDI, beat4 + 2) : Math.max(minMidi, beat4 - 2);
    firstMidi = Math.max(minMidi, Math.min(BASS_MAX_MIDI, firstMidi));
    midMidi = Math.max(minMidi, Math.min(BASS_MAX_MIDI, midMidi));
    return { firstMidi, midMidi };
  }
}
