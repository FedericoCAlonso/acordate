import { NOTE_TO_PC, mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { getCuratedVoicingsForChord } from '../data/voicings.js';
import { Chord } from '../models/Chord.js';
import { Tuning } from '../models/Tuning.js';

/**
 * Definición de los 7 grados diatónicos en tonalidad mayor y menor (tríadas, séptimas y función tonal).
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
    { degree: 3, romanTriad: 'III', roman7: 'IIImaj7', semitones: 3, triadQ: '', seventhQ: 'maj7', fn: 'tónica' },
    { degree: 4, romanTriad: 'iv', roman7: 'iv7', semitones: 5, triadQ: 'm', seventhQ: 'm7', fn: 'subdominante' },
    { degree: 5, romanTriad: 'V', roman7: 'V7', semitones: 7, triadQ: '', seventhQ: '7', fn: 'dominante' },
    { degree: 6, romanTriad: 'VI', roman7: 'VImaj7', semitones: 8, triadQ: '', seventhQ: 'maj7', fn: 'subdominante' },
    { degree: 7, romanTriad: 'VII', roman7: 'VII7', semitones: 10, triadQ: '', seventhQ: '7', fn: 'dominante' }
  ]
};

/**
 * Atajos de progresiones frecuentes para el Explorador de Campo Armónico.
 */
export const HARMONIC_FIELD_SHORTCUTS = [
  { id: 'I-IV-V', label: 'I – IV – V – I', mode: 'major', degrees: [1, 4, 5, 1] },
  { id: 'I-vi-IV-V', label: 'I – vi – IV – V', mode: 'major', degrees: [1, 6, 4, 5] },
  { id: 'ii-V-I', label: 'ii – V – I', mode: 'major', degrees: [2, 5, 1, 1] },
  { id: 'blues-12', label: 'Blues de 12 compases', mode: 'major', degrees: [1, 4, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], forceDom7: true },
  { id: 'i-iv-V', label: 'i – iv – V – i (menor)', mode: 'minor', degrees: [1, 4, 5, 1] }
];

/**
 * Servicio de dominio puro de teoría armónica aplicada:
 * - Calcula el campo armónico diatónico (tríadas y séptimas) en las 12 tonalidades mayores y menores.
 * - Genera progresiones atajo listas para reproducir o guardar.
 * - Genera preguntas de entrenamiento de oído (calidades, séptimas, inversiones y progresiones).
 */
export class HarmonyService {
  /**
   * Devuelve los 7 grados diatónicos de una tonalidad mayor o menor con su acorde, función tonal y voicing recomendado.
   * @param {string} [key='C'] Raíz de la tonalidad (ej. "C", "G", "F", "Bb", "E").
   * @param {'major'|'minor'} [mode='major'] Modo mayor o menor.
   * @param {boolean} [useSevenths=false] Si true genera acordes de séptima; si false, tríadas.
   * @param {'guitar'|'bass'} [instrument='guitar'] Instrumento para sugerir voicing.
   * @returns {Array<{ degree: number, roman: string, chord: Chord, symbol: string, harmonicFunction: string, voicing: import('../models/Voicing.js').Voicing|null }>} Campo armónico.
   */
  getDiatonicField(key = 'C', mode = 'major', useSevenths = false, instrument = 'guitar') {
    const cleanRoot = String(key || 'C').replace(/m$/, '').trim();
    const rootPc = NOTE_TO_PC[cleanRoot] ?? 0;
    const specs = DIATONIC_SPECS[mode === 'minor' ? 'minor' : 'major'];
    const useFlats = prefersFlats(mode === 'minor' ? `${cleanRoot}m` : cleanRoot);
    const tuning = Tuning.defaultForInstrument(instrument);

    return specs.map((spec) => {
      const chordRoot = pcToNoteName(mod12(rootPc + spec.semitones), useFlats);
      const quality = useSevenths ? spec.seventhQ : spec.triadQ;
      const chord = new Chord({ root: chordRoot, quality });
      const voicings = getCuratedVoicingsForChord(chord.americanSymbol, instrument, tuning);

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
   * Resuelve uno de los atajos clásicos (I-IV-V, I-vi-IV-V, ii-V-I, blues-12, i-iv-V) en la tonalidad dada.
   * @param {string} shortcutId Clave de HARMONIC_FIELD_SHORTCUTS.
   * @param {string} [key='C'] Tonalidad destino.
   * @param {boolean} [useSevenths=false] Si true usa acordes con séptima.
   * @returns {string[]} Arreglo de símbolos de acordes en cifrado americano.
   */
  buildShortcutProgression(shortcutId, key = 'C', useSevenths = false) {
    const sc = HARMONIC_FIELD_SHORTCUTS.find((s) => s.id === shortcutId) || HARMONIC_FIELD_SHORTCUTS[0];
    const field = this.getDiatonicField(key, sc.mode, useSevenths || sc.forceDom7);
    return sc.degrees.map((deg) => {
      const entry = field.find((f) => f.degree === deg) || field[0];
      if (sc.forceDom7) {
        return `${entry.chord.root}7`;
      }
      return entry.symbol;
    });
  }

  /**
   * Genera una pregunta aleatoria de entrenamiento de oído armónico según el nivel de dificultad (1 a 4).
   * - Nivel 1: calidad de tríada (Mayor, Menor, Disminuido, Aumentado).
   * - Nivel 2: tipo de séptima (maj7, 7, m7, m7b5).
   * - Nivel 3: inversión de tríada (Fundamental, 1.ª inversión, 2.ª inversión).
   * - Nivel 4: progresión diatónica simple (I-IV-V, I-vi-IV-V, ii-V-I, i-iv-V).
   * @param {number} [level=1] Dificultad (1..4).
   * @param {number} [seed] Semilla determinista opcional para tests unitarios.
   * @returns {{ level: number, prompt: string, options: Array<{ id: string, label: string }>, correctId: string, playbackMidis: number[][], explanation: string }} Pregunta lista para reproducir.
   */
  createEarTrainingQuestion(level = 1, seed = null) {
    const rand = (n) => {
      const r = seed !== null ? Math.abs(Math.sin(seed * 9301 + 49297)) % 1 : Math.random();
      return Math.floor(r * n);
    };

    const roots = ['C', 'D', 'E', 'F', 'G', 'A'];
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
      const opts = [
        { id: '0', label: 'Estado fundamental (bajo en R)', midis: [rootMidi, rootMidi + 4, rootMidi + 7] },
        { id: '1', label: '1.ª inversión (bajo en 3ª)', midis: [rootMidi + 4, rootMidi + 7, rootMidi + 12] },
        { id: '2', label: '2.ª inversión (bajo en 5ª)', midis: [rootMidi + 7, rootMidi + 12, rootMidi + 16] }
      ];
      const chosen = opts[rand(opts.length)];
      return {
        level: 3,
        prompt: 'Escuchá el bajo del acorde: ¿en qué inversión está?',
        options: opts.map((o) => ({ id: o.id, label: o.label })),
        correctId: chosen.id,
        playbackMidis: [chosen.midis],
        explanation: `Tríada mayor en ${chosen.label.toLowerCase()}.`
      };
    }

    // Nivel 4: progresiones diatónicas
    const progOpts = [
      { id: 'I-IV-V', label: 'I – IV – V – I', chords: this.buildShortcutProgression('I-IV-V', 'C', false) },
      { id: 'I-vi-IV-V', label: 'I – vi – IV – V', chords: this.buildShortcutProgression('I-vi-IV-V', 'C', false) },
      { id: 'ii-V-I', label: 'ii – V – I', chords: this.buildShortcutProgression('ii-V-I', 'C', true) },
      { id: 'i-iv-V', label: 'i – iv – V – i (menor)', chords: this.buildShortcutProgression('i-iv-V', 'A', false) }
    ];
    const chosen = progOpts[rand(progOpts.length)];
    const playbackMidis = chosen.chords.map((sym) => {
      const c = Chord.parse(sym);
      const base = 48 + c.rootPc;
      return c.quality.intervals.map((iv) => base + iv);
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
