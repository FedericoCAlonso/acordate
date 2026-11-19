import {
  getKeySignatureMap,
  midiToAbcPitch,
  mod12,
  parseChord,
  prefersFlats
} from '../core/MusicTheory.js';

/**
 * Rango escrito en clave de fa (clef=bass) para bajo de 4 cuerdas (E2=40 a G3=55 escrito, suena octava grave).
 * Nota: en ABC con clef=bass, E, es MIDI 40 (línea adicional inferior), C es MIDI 48, G es MIDI 55.
 */
const BASS_MIN_MIDI = 40;
const BASS_MAX_MIDI = 58;

/**
 * Salto máximo permitido entre dos notas consecutivas de walking bass (sexta mayor = 9 semitonos).
 */
const MAX_LEAP_SEMITONES = 9;

/**
 * Servicio de dominio puro que genera líneas de walking bass en negras a partir de un cifrado.
 * Reglas implementadas:
 * 1) Raíz en el tiempo 1 de cada compás.
 * 2) Notas del acorde (3ª, 5ª, 7ª o paso escalar en variante movimiento) en los tiempos 2 y 3.
 * 3) Aproximación cromática (o diatónica) hacia la raíz del acorde siguiente en el tiempo 4.
 * 4) Evita saltos mayores a una sexta mayor (9 semitonos) y evita repetir la misma nota consecutivamente.
 * 5) Soporta variantes: 'clasico', 'movimiento' y 'tresillos'.
 */
export class WalkingBassGenerator {
  /**
   * Genera una línea de walking bass en notación ABC y retorna metadatos verificables por compás.
   * @param {object} options Parámetros de generación.
   * @param {string[]|string} options.chords Arreglo de acordes por compás o cadena separada por "|" o espacios.
   * @param {string} [options.key='F'] Tonalidad de referencia.
   * @param {'clasico'|'movimiento'|'tresillos'} [options.variant='clasico'] Estilo de línea.
   * @param {'cromatica'|'diatonica'} [options.approach='cromatica'] Tipo preferido de aproximación en el tiempo 4.
   * @param {string} [options.title] Título opcional.
   * @returns {{ abc: string, measures: Array<{ chord: string, nextChord: string, notes: number[], approachType: string }>, title: string }} Resultado completo.
   */
  generate(options = {}) {
    const chordList = this._normalizeChordList(options.chords);
    if (chordList.length === 0) {
      throw new Error('Indicá al menos un acorde para generar la línea de walking bass.');
    }

    const key = options.key || parseChord(chordList[0])?.root || 'F';
    const variant = options.variant || 'clasico';
    const approachPref = options.approach || 'cromatica';
    const useFlats = prefersFlats(key) || chordList.some((c) => c.includes('b'));
    const keyMap = getKeySignatureMap(key);
    const title = options.title || `Walking bass en ${key}`;

    // Selecciona primero las raíces de cada compás (tiempo 1) cuidando el registro del bajo
    const roots = [];
    for (let i = 0; i < chordList.length; i++) {
      const parsed = parseChord(chordList[i]);
      const pc = parsed ? (parsed.bassPc ?? parsed.rootPc) : 0;
      const prevRoot = i === 0 ? 45 : roots[i - 1];
      roots.push(this._chooseRootMidi(pc, prevRoot));
    }

    const measures = [];
    const abcBars = [];

    for (let i = 0; i < chordList.length; i++) {
      const chordSymbol = chordList[i];
      const nextIndex = (i + 1) % chordList.length;
      const nextChordSymbol = chordList[nextIndex];
      const parsed = parseChord(chordSymbol) || { rootPc: 0, intervals: [0, 4, 7, 10] };

      const beat1 = roots[i];
      const nextRoot = roots[nextIndex];

      // Elige el tiempo 4 como aproximación cromática (o diatónica) hacia nextRoot
      const approachChoice = this._chooseApproachNote(nextRoot, beat1, approachPref, i);
      const beat4 = approachChoice.midi;

      // Elige los tiempos 2 y 3 respetando notas del acorde, conducción hacia beat4, salto <= 6ª y sin repeticiones
      const { beat2, beat3 } = this._chooseMiddleBeats(parsed, beat1, beat4, variant, i);

      const barMidis = [beat1, beat2, beat3, beat4];
      measures.push({
        chord: chordSymbol,
        nextChord: nextChordSymbol,
        notes: barMidis,
        approachType: approachChoice.type
      });

      const n1 = midiToAbcPitch(beat1, useFlats, keyMap);
      const n2 = midiToAbcPitch(beat2, useFlats, keyMap);
      const n3 = midiToAbcPitch(beat3, useFlats, keyMap);
      const n4 = midiToAbcPitch(beat4, useFlats, keyMap);

      // En la variante con tresillos, agrega un tresillo swing de enlace en el tiempo 4 en compases pares
      if (variant === 'tresillos' && i % 2 === 1) {
        const pickup = this._chooseSkipNote(beat3, beat4);
        const nPick = midiToAbcPitch(pickup, useFlats, keyMap);
        abcBars.push(`"${chordSymbol}"${n1} ${n2} ${n3} (3${nPick}/2${n4}/2${n4}/2`);
      } else {
        abcBars.push(`"${chordSymbol}"${n1} ${n2} ${n3} ${n4}`);
      }
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
      'M:4/4',
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
   * @param {number} pc Clase de altura de la raíz (0-11).
   * @param {number} referenceMidi Altura de referencia.
   * @returns {number} Altura MIDI seleccionada.
   */
  _chooseRootMidi(pc, referenceMidi) {
    const candidates = [];
    for (let m = BASS_MIN_MIDI; m <= BASS_MAX_MIDI - 4; m++) {
      if (mod12(m) === pc) candidates.push(m);
    }
    if (candidates.length === 0) return BASS_MIN_MIDI + pc;
    candidates.sort((a, b) => Math.abs(a - referenceMidi) - Math.abs(b - referenceMidi));
    return candidates[0];
  }

  /**
   * Selecciona la nota de aproximación en el tiempo 4 (medio tono o tono entero hacia la próxima raíz).
   * @param {number} nextRoot Altura MIDI de la raíz del siguiente compás.
   * @param {number} currentRoot Altura MIDI de la raíz actual.
   * @param {'cromatica'|'diatonica'} preference Preferencia de aproximación.
   * @param {number} barIndex Índice de compás para alternar dirección ascendente/descendente.
   * @returns {{ midi: number, type: 'cromatica'|'diatonica' }} Nota de aproximación elegida.
   */
  _chooseApproachNote(nextRoot, currentRoot, preference, barIndex) {
    const step = preference === 'diatonica' ? 2 : 1;
    const below = nextRoot - step;
    const above = nextRoot + step;

    const validBelow = below >= BASS_MIN_MIDI && below <= BASS_MAX_MIDI;
    const validAbove = above >= BASS_MIN_MIDI && above <= BASS_MAX_MIDI;

    let chosen;
    if (validBelow && validAbove) {
      // Si el siguiente compás es más agudo, aproxima desde abajo; si es más grave, desde arriba; si igual, alterna
      if (nextRoot > currentRoot) chosen = below;
      else if (nextRoot < currentRoot) chosen = above;
      else chosen = barIndex % 2 === 0 ? below : above;
    } else if (validBelow) {
      chosen = below;
    } else {
      chosen = above;
    }

    return { midi: chosen, type: step === 1 ? 'cromatica' : 'diatonica' };
  }

  /**
   * Elige las notas de los tiempos 2 y 3 (notas del acorde con conducción hacia el tiempo 4),
   * garantizando saltos <= sexta mayor (9 semitonos) y sin notas repetidas consecutivas.
   * @param {{ rootPc: number, intervals: number[] }} parsedChord Acorde parseado.
   * @param {number} beat1 Altura MIDI del tiempo 1.
   * @param {number} beat4 Altura MIDI del tiempo 4.
   * @param {'clasico'|'movimiento'|'tresillos'} variant Variante estilística.
   * @param {number} barIndex Índice del compás.
   * @returns {{ beat2: number, beat3: number }} Par de notas elegidas.
   */
  _chooseMiddleBeats(parsedChord, beat1, beat4, variant, barIndex) {
    // Clases de altura válidas del acorde (3ª, 5ª, 7ª y raíz en octava si hace falta)
    const chordTonePcs = new Set(parsedChord.intervals.map((iv) => mod12(parsedChord.rootPc + iv)));
    if (variant === 'movimiento') {
      // Agrega 2ª/9ª y 6ª diatónica como posibles notas de paso suaves
      chordTonePcs.add(mod12(parsedChord.rootPc + 2));
      chordTonePcs.add(mod12(parsedChord.rootPc + 9));
    }

    const chordCandidates = [];
    for (let m = BASS_MIN_MIDI; m <= BASS_MAX_MIDI; m++) {
      if (chordTonePcs.has(mod12(m))) {
        chordCandidates.push(m);
      }
    }

    const thirdPc = mod12(parsedChord.rootPc + (parsedChord.intervals[1] ?? 4));
    const fifthPc = mod12(parsedChord.rootPc + (parsedChord.intervals[2] ?? 7));

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

        // Puntúa la musicalidad: conducción gradual, preferencia por 3ª y 5ª en tiempos 2 y 3
        let score = leap12 * 0.9 + leap23 * 0.9 + leap34 * 1.1;

        // Bonifica contorno direccional hacia beat4
        const dir12 = Math.sign(b2 - beat1);
        const dir23 = Math.sign(b3 - b2);
        if (dir12 === dir23) score -= 2.2;

        // Bonifica tercera en tiempo 2 y quinta en tiempo 3 (idioma walking clásico)
        if (mod12(b2) === thirdPc) score -= 2.0;
        if (mod12(b3) === fifthPc) score -= 1.8;

        // En variante movimiento, favorece pasos conjuntos (2-3 semitonos)
        if (variant === 'movimiento' && leap12 <= 3 && leap23 <= 3) {
          score -= 2.5;
        }

        // Pequeña variación determinista entre compases para evitar patrones idénticos
        if (barIndex % 2 === 1 && b2 < beat1) {
          score -= 0.6;
        }

        if (score < bestScore) {
          bestScore = score;
          bestPair = { beat2: b2, beat3: b3 };
        }
      }
    }

    if (bestPair) return bestPair;

    // Respaldo garantizado respetando salto máximo y sin repeticiones
    const fallback2 = Math.min(BASS_MAX_MIDI, beat1 + (parsedChord.intervals[1] ?? 4));
    const fallback3 = fallback2 === beat4 ? Math.max(BASS_MIN_MIDI, fallback2 - 2) : Math.min(BASS_MAX_MIDI, beat1 + 7);
    return {
      beat2: fallback2 !== beat1 ? fallback2 : beat1 + 2,
      beat3: fallback3 !== fallback2 && fallback3 !== beat4 ? fallback3 : Math.round((beat1 + beat4) / 2)
    };
  }

  /**
   * Elige una nota de paso breve para el tresillo swing sin repetir el tiempo 3 ni el 4.
   * @param {number} beat3 Altura MIDI del tiempo 3.
   * @param {number} beat4 Altura MIDI del tiempo 4.
   * @returns {number} Altura MIDI de la nota de enlace.
   */
  _chooseSkipNote(beat3, beat4) {
    const mid = Math.round((beat3 + beat4) / 2);
    if (mid !== beat3 && mid !== beat4) return mid;
    return beat4 > BASS_MIN_MIDI + 2 ? beat4 - 2 : beat4 + 2;
  }
}
