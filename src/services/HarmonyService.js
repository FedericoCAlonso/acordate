import { NOTE_TO_PC, mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';

/**
 * Letras diatónicas en orden ascendente y su clase de altura natural para ortografía armónica correcta.
 */
const DIATONIC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Definición de los 7 grados diatónicos en modo mayor, menor natural (eólico),
 * menor armónico y menor melódico (tríadas, séptimas y función tonal).
 */
const DIATONIC_SPECS = {
  major: [
    { degree: 1, romanTriad: 'I', roman7: 'Imaj7', semitones: 0, triadQ: '', seventhQ: 'maj7', fn: 'tónica' },
    { degree: 2, romanTriad: 'ii', roman7: 'ii7', semitones: 2, triadQ: 'm', seventhQ: 'm7', fn: 'subdominante' },
    { degree: 3, romanTriad: 'iii', roman7: 'iii7', semitones: 4, triadQ: 'm', seventhQ: 'm7', fn: 'tónica' },
    { degree: 4, romanTriad: 'IV', roman7: 'IVmaj7', semitones: 5, triadQ: '', seventhQ: 'maj7', fn: 'subdominante' },
    { degree: 5, romanTriad: 'V', roman7: 'V7', semitones: 7, triadQ: '', seventhQ: '7', fn: 'dominante' },
    { degree: 6, romanTriad: 'vi', roman7: 'vi7', semitones: 9, triadQ: 'm', seventhQ: 'm7', fn: 'tónica' },
    { degree: 7, romanTriad: 'vii°', roman7: 'viiø7', semitones: 11, triadQ: 'dim', seventhQ: 'm7b5', fn: 'dominante' }
  ],
  minor: [
    { degree: 1, romanTriad: 'i', roman7: 'im7', semitones: 0, triadQ: 'm', seventhQ: 'm7', fn: 'tónica' },
    { degree: 2, romanTriad: 'ii°', roman7: 'iiø7', semitones: 2, triadQ: 'dim', seventhQ: 'm7b5', fn: 'subdominante' },
    { degree: 3, romanTriad: 'bIII', roman7: 'bIIImaj7', semitones: 3, triadQ: '', seventhQ: 'maj7', fn: 'tónica' },
    { degree: 4, romanTriad: 'iv', roman7: 'iv7', semitones: 5, triadQ: 'm', seventhQ: 'm7', fn: 'subdominante' },
    { degree: 5, romanTriad: 'v', roman7: 'v7', semitones: 7, triadQ: 'm', seventhQ: 'm7', fn: 'dominante' },
    { degree: 6, romanTriad: 'bVI', roman7: 'bVImaj7', semitones: 8, triadQ: '', seventhQ: 'maj7', fn: 'subdominante' },
    { degree: 7, romanTriad: 'bVII', roman7: 'bVII7', semitones: 10, triadQ: '', seventhQ: '7', fn: 'subdominante menor' }
  ],
  'harmonic-minor': [
    { degree: 1, romanTriad: 'i', roman7: 'im(maj7)', semitones: 0, triadQ: 'm', seventhQ: 'mMaj7', fn: 'tónica' },
    { degree: 2, romanTriad: 'ii°', roman7: 'iiø7', semitones: 2, triadQ: 'dim', seventhQ: 'm7b5', fn: 'subdominante' },
    { degree: 3, romanTriad: 'bIII+', roman7: 'bIII+', semitones: 3, triadQ: 'aug', seventhQ: 'aug', fn: 'tónica' },
    { degree: 4, romanTriad: 'iv', roman7: 'iv7', semitones: 5, triadQ: 'm', seventhQ: 'm7', fn: 'subdominante' },
    { degree: 5, romanTriad: 'V', roman7: 'V7', semitones: 7, triadQ: '', seventhQ: '7', fn: 'dominante' },
    { degree: 6, romanTriad: 'bVI', roman7: 'bVImaj7', semitones: 8, triadQ: '', seventhQ: 'maj7', fn: 'subdominante' },
    { degree: 7, romanTriad: 'vii°', roman7: 'vii°7', semitones: 11, triadQ: 'dim', seventhQ: 'dim7', fn: 'dominante' }
  ],
  'melodic-minor': [
    { degree: 1, romanTriad: 'i', roman7: 'im(maj7)', semitones: 0, triadQ: 'm', seventhQ: 'mMaj7', fn: 'tónica' },
    { degree: 2, romanTriad: 'ii', roman7: 'ii7', semitones: 2, triadQ: 'm', seventhQ: 'm7', fn: 'subdominante' },
    { degree: 3, romanTriad: 'bIII+', roman7: 'bIII+', semitones: 3, triadQ: 'aug', seventhQ: 'aug', fn: 'tónica' },
    { degree: 4, romanTriad: 'IV', roman7: 'IV7', semitones: 5, triadQ: '', seventhQ: '7', fn: 'subdominante' },
    { degree: 5, romanTriad: 'V', roman7: 'V7', semitones: 7, triadQ: '', seventhQ: '7', fn: 'dominante' },
    { degree: 6, romanTriad: 'vi°', roman7: 'viø7', semitones: 9, triadQ: 'dim', seventhQ: 'm7b5', fn: 'tónica' },
    { degree: 7, romanTriad: 'vii°', roman7: 'viiø7', semitones: 11, triadQ: 'dim', seventhQ: 'm7b5', fn: 'dominante' }
  ]
};

/**
 * Atajos de progresiones frecuentes para el Explorador de Campo Armónico.
 */
export const HARMONIC_FIELD_SHORTCUTS = [
  { id: 'I-IV-V', label: 'I – IV – V – I', mode: 'major', degrees: [1, 4, 5, 1] },
  { id: 'I-vi-IV-V', label: 'I – vi – IV – V', mode: 'major', degrees: [1, 6, 4, 5] },
  { id: 'ii-V-I', label: 'ii – V – I', mode: 'major', degrees: [2, 5, 1] },
  { id: 'blues-12', label: 'Blues de 12 compases', mode: 'major', degrees: [1, 4, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], forceDom7: true },
  { id: 'i-iv-V', label: 'i – iv – V – i (menor arm.)', mode: 'harmonic-minor', degrees: [1, 4, 5, 1] },
  { id: 'andaluza', label: 'Cadencia andaluza (i–bVII–bVI–V)', mode: 'minor', degrees: [1, 7, 6, 5], forceDominantV: true }
];

/**
 * Calcula la ortografía diatónica exacta de un grado avanzando la letra desde la raíz de la tonalidad.
 * Si resultara doble alteración, cae de forma segura al enarmónico de una sola alteración.
 * @param {string} keyRoot Raíz de la tonalidad (ej. "F#", "Bb", "D").
 * @param {number} degreeOffset Índice de grado 0..6.
 * @param {number} targetPc Clase de altura objetivo 0..11.
 * @param {boolean} fallbackFlats Preferencia de bemoles si hace falta enarmónico.
 * @returns {string} Nombre de nota con ortografía diatónica válida en NOTE_TO_PC.
 */
function spellDiatonicDegree(keyRoot, degreeOffset, targetPc, fallbackFlats) {
  const baseLetter = String(keyRoot || 'C')[0].toUpperCase();
  const startIdx = DIATONIC_LETTERS.indexOf(baseLetter);
  if (startIdx < 0) return pcToNoteName(targetPc, fallbackFlats);

  const letter = DIATONIC_LETTERS[(startIdx + degreeOffset) % 7];
  const natPc = NATURAL_LETTER_PC[letter];
  let delta = mod12(targetPc - natPc);
  if (delta > 6) delta -= 12;

  if (delta === 0) return letter;
  if (delta === 1 && NOTE_TO_PC[`${letter}#`] !== undefined) return `${letter}#`;
  if (delta === -1 && NOTE_TO_PC[`${letter}b`] !== undefined) return `${letter}b`;
  return pcToNoteName(targetPc, fallbackFlats);
}

/**
 * Servicio de dominio puro de teoría armónica aplicada:
 * - Calcula el campo armónico diatónico (tríadas y séptimas) en las 12 tonalidades y 4 modos.
 * - Genera progresiones atajo o aleatorias diatónicas listas para practicar o conducir voces.
 * - Genera preguntas de entrenamiento de oído (tríadas, séptimas, inversiones y progresiones conducidas).
 */
export class HarmonyService {
  /**
   * Devuelve los 7 grados diatónicos de una tonalidad mayor o menor (natural/armónica/melódica)
   * con ortografía diatónica correcta, función tonal y voicing recomendado.
   * @param {string} [key='C'] Raíz de la tonalidad (ej. "C", "G", "F#", "Bb", "E").
   * @param {'major'|'minor'|'harmonic-minor'|'melodic-minor'} [mode='major'] Modo armónico.
   * @param {boolean} [useSevenths=false] Si true genera acordes de séptima; si false, tríadas.
   * @param {'guitar'|'bass'} [instrument='guitar'] Instrumento para sugerir voicing.
   * @param {Tuning|null} [tuning=null] Afinación opcional.
   * @returns {Array<{ degree: number, roman: string, chord: Chord, symbol: string, harmonicFunction: string, voicing: import('../models/Voicing.js').Voicing|null }>} Campo armónico.
   */
  getDiatonicField(key = 'C', mode = 'major', useSevenths = false, instrument = 'guitar', tuning = null) {
    const cleanRoot = String(key || 'C').replace(/m$/, '').trim();
    const rootPc = NOTE_TO_PC[cleanRoot] ?? 0;
    const resolvedMode = DIATONIC_SPECS[mode] ? mode : 'major';
    const specs = DIATONIC_SPECS[resolvedMode];
    const isMinorMode = resolvedMode !== 'major';
    const useFlats = prefersFlats(isMinorMode ? `${cleanRoot}m` : cleanRoot);
    const activeTuning = tuning || Tuning.defaultForInstrument(instrument);

    return specs.map((spec, idx) => {
      const targetPc = mod12(rootPc + spec.semitones);
      const chordRoot = spellDiatonicDegree(cleanRoot, idx, targetPc, useFlats);
      const quality = useSevenths ? spec.seventhQ : spec.triadQ;
      const chord = new Chord({ root: chordRoot, quality });
      const voicings = getCuratedVoicingsForChord(chord.americanSymbol, instrument, activeTuning);

      return {
        degree: spec.degree,
        roman: useSevenths ? spec.roman7 : spec.romanTriad,
        chord,
        symbol: chord.americanSymbol,
        harmonicFunction: spec.fn,
        voicing: voicings[0] || null
      };
    });
  }

  /**
   * Resuelve uno de los atajos clásicos (I-IV-V, I-vi-IV-V, ii-V-I, blues-12, i-iv-V, andaluza) en la tonalidad dada.
   * @param {string} shortcutId Clave de HARMONIC_FIELD_SHORTCUTS.
   * @param {string} [key='C'] Tonalidad destino.
   * @param {boolean} [useSevenths=false] Si true usa acordes con séptima.
   * @returns {string[]} Arreglo de símbolos de acordes en cifrado americano.
   */
  buildShortcutProgression(shortcutId, key = 'C', useSevenths = false) {
    const sc = HARMONIC_FIELD_SHORTCUTS.find((s) => s.id === shortcutId) || HARMONIC_FIELD_SHORTCUTS[0];
    const field = this.getDiatonicField(key, sc.mode, useSevenths || Boolean(sc.forceDom7));
    return sc.degrees.map((deg) => {
      const entry = field.find((f) => f.degree === deg) || field[0];
      if (sc.forceDom7) {
        return `${entry.chord.root}7`;
      }
      if (sc.forceDominantV && deg === 5) {
        return useSevenths ? `${entry.chord.root}7` : entry.chord.root;
      }
      return entry.symbol;
    });
  }

  /**
   * Genera una secuencia musical aleatoria de acordes diatónicos (para variar ejercicios sin secuencias fijas).
   * @param {object} [options={}] Opciones de generación.
   * @param {string} [options.key='C'] Tonalidad.
   * @param {'major'|'minor'|'harmonic-minor'|'melodic-minor'} [options.mode='major'] Modo.
   * @param {boolean} [options.useSevenths=false] Usar acordes de séptima.
   * @param {number} [options.length=4] Cantidad de acordes (2..8).
   * @param {number|null} [options.seed=null] Semilla opcional determinista.
   * @returns {string[]} Lista de símbolos de acordes distintos consecutivos.
   */
  generateRandomDiatonicSequence({ key = 'C', mode = 'major', useSevenths = false, length = 4, seed = null } = {}) {
    const field = this.getDiatonicField(key, mode, useSevenths);
    const count = Math.max(2, Math.min(8, Number(length) || 4));
    let state = seed !== null ? seed : Math.floor(Math.random() * 100000);
    const nextRand = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };

    // Prioriza grados musicales estables (I, ii, iii, IV, V, vi) evitando repetir dos seguidos
    const pool = field.filter((f) => f.degree !== 7 || useSevenths);
    const out = [pool[0].symbol];
    for (let i = 1; i < count; i++) {
      let pick = pool[Math.floor(nextRand() * pool.length)];
      let guard = 0;
      while (pick.symbol === out[out.length - 1] && guard < 10) {
        pick = pool[Math.floor(nextRand() * pool.length)];
        guard += 1;
      }
      out.push(pick.symbol);
    }
    return out;
  }

  /**
   * Genera una pregunta aleatoria de entrenamiento de oído armónico según el nivel de dificultad (1 a 4).
   * - Nivel 1: calidad de tríada (Mayor, Menor, Disminuido, Aumentado).
   * - Nivel 2: tipo de séptima (maj7, 7, m7, m7b5).
   * - Nivel 3: inversión de tríada (mayor o menor, centradas en la misma tesitura).
   * - Nivel 4: progresión diatónica con conducción de voces real y bajo separado.
   * @param {number} [level=1] Dificultad (1..4).
   * @param {number|null} [seed=null] Semilla determinista opcional para tests unitarios.
   * @returns {{ level: number, prompt: string, options: Array<{ id: string, label: string }>, correctId: string, playbackMidis: number[][], explanation: string }} Pregunta lista para reproducir.
   */
  createEarTrainingQuestion(level = 1, seed = null) {
    let prngState = seed !== null ? Math.abs(Math.floor(seed)) + 1 : null;
    const rand = (n) => {
      if (prngState !== null) {
        prngState = (prngState * 1664525 + 1013904223) % 4294967296;
        return Math.floor((prngState / 4294967296) * n);
      }
      return Math.floor(Math.random() * n);
    };

    const roots = ['C', 'D', 'Eb', 'E', 'F', 'G', 'A', 'Bb'];
    const root = roots[rand(roots.length)];
    const rootMidi = 48 + (NOTE_TO_PC[root] ?? 0);

    if (level === 1) {
      const opts = [
        { id: '', label: 'Mayor', intervals: [0, 4, 7] },
        { id: 'm', label: 'Menor', intervals: [0, 3, 7] },
        { id: 'dim', label: 'Disminuido', intervals: [0, 3, 6] },
        { id: 'aug', label: 'Aumentado', intervals: [0, 4, 8] }
      ];
      const chosen = opts[rand(opts.length)];
      return {
        level: 1,
        prompt: 'Escuchá la tríada e identificá su calidad:',
        options: opts.map((o) => ({ id: o.id, label: o.label })),
        correctId: chosen.id,
        playbackMidis: [chosen.intervals.map((iv) => rootMidi + iv)],
        explanation: `Era ${root}${chosen.id} (${chosen.label}).`
      };
    }

    if (level === 2) {
      const opts = [
        { id: 'maj7', label: 'Maj7 (séptima mayor)', intervals: [0, 4, 7, 11] },
        { id: '7', label: 'Dominante 7', intervals: [0, 4, 7, 10] },
        { id: 'm7', label: 'Menor 7', intervals: [0, 3, 7, 10] },
        { id: 'm7b5', label: 'Semidisminuido (m7b5)', intervals: [0, 3, 6, 10] }
      ];
      const chosen = opts[rand(opts.length)];
      return {
        level: 2,
        prompt: 'Identificá el tipo de acorde de séptima:',
        options: opts.map((o) => ({ id: o.id, label: o.label })),
        correctId: chosen.id,
        playbackMidis: [chosen.intervals.map((iv) => rootMidi + iv)],
        explanation: `Era ${root}${chosen.id} (${chosen.label}).`
      };
    }

    if (level === 3) {
      // Alterna tríada mayor y menor, centrando la tesitura para que se escuche la inversión y no solo la altura
      const isMinor = rand(2) === 1;
      const third = isMinor ? 3 : 4;
      const opts = [
        { id: '0', label: 'Estado fundamental (bajo en R)', midis: [rootMidi, rootMidi + third, rootMidi + 7] },
        { id: '1', label: '1.ª inversión (bajo en 3ª)', midis: [rootMidi + third - 12, rootMidi + 7 - 12, rootMidi] },
        { id: '2', label: '2.ª inversión (bajo en 5ª)', midis: [rootMidi + 7 - 12, rootMidi, rootMidi + third] }
      ];
      const chosen = opts[rand(opts.length)];
      const qualLabel = isMinor ? 'menor' : 'mayor';
      return {
        level: 3,
        prompt: `Escuchá el bajo de la tríada ${qualLabel}: ¿en qué inversión está?`,
        options: opts.map((o) => ({ id: o.id, label: o.label })),
        correctId: chosen.id,
        playbackMidis: [chosen.midis],
        explanation: `Tríada ${qualLabel} (${root}${isMinor ? 'm' : ''}) en ${chosen.label.toLowerCase()}.`
      };
    }

    // Nivel 4: progresiones diatónicas con voces superiores conducidas alrededor de C4 (MIDI 60)
    const progOpts = [
      { id: 'I-IV-V', label: 'I – IV – V – I', chords: this.buildShortcutProgression('I-IV-V', 'C', false) },
      { id: 'I-vi-IV-V', label: 'I – vi – IV – V', chords: this.buildShortcutProgression('I-vi-IV-V', 'C', false) },
      { id: 'ii-V-I', label: 'ii – V – I', chords: this.buildShortcutProgression('ii-V-I', 'C', true) },
      { id: 'i-iv-V', label: 'i – iv – V – i (menor)', chords: this.buildShortcutProgression('i-iv-V', 'A', false) }
    ];
    const chosen = progOpts[rand(progOpts.length)];
    const playbackMidis = chosen.chords.map((sym) => {
      const c = Chord.parse(sym);
      const bass = 45 + ((c.rootPc - 9 + 12) % 12); // Bajo cómodo entre A2 y G#3
      const upper = c.quality.intervals.map((iv) => {
        const pc = mod12(c.rootPc + iv);
        // Coloca las voces superiores cerca de C4..B4 (MIDI 57..68) para conducción natural
        let m = 60 + pc;
        if (m > 69) m -= 12;
        if (m < 57) m += 12;
        return m;
      });
      return [bass, ...new Set(upper.sort((a, b) => a - b))];
    });
    return {
      level: 4,
      prompt: 'Escuchá la progresión armónica e identificá la secuencia de grados:',
      options: progOpts.map((o) => ({ id: o.id, label: o.label })),
      correctId: chosen.id,
      playbackMidis,
      explanation: `La secuencia era ${chosen.label} (${chosen.chords.join(' – ')}).`
    };
  }
}
