import {
  NOTE_TO_PC,
  getKeySignatureMap,
  midiToAbcPitch,
  mod12,
  parseChord,
  pcToNoteName,
  prefersFlats
} from '../core/MusicTheory.js';
import { ChordProgression, PROGRESSION_TEMPLATES } from '../models/ChordProgression.js';

/**
 * Mapa de grados romanos a desplazamiento en semitonos desde la tónica mayor y cualidad por defecto.
 */
const ROMAN_DEGREE_MAP = {
  I: { semitones: 0, defaultQuality: '' },
  Imaj7: { semitones: 0, defaultQuality: 'maj7' },
  I7: { semitones: 0, defaultQuality: '7' },
  i: { semitones: 0, defaultQuality: 'm' },
  im7: { semitones: 0, defaultQuality: 'm7' },
  ii: { semitones: 2, defaultQuality: 'm' },
  ii7: { semitones: 2, defaultQuality: 'm7' },
  'iiø7': { semitones: 2, defaultQuality: 'm7b5' },
  II7: { semitones: 2, defaultQuality: '7' },
  iii: { semitones: 4, defaultQuality: 'm' },
  iii7: { semitones: 4, defaultQuality: 'm7' },
  bIII: { semitones: 3, defaultQuality: '' },
  IV: { semitones: 5, defaultQuality: '' },
  IVmaj7: { semitones: 5, defaultQuality: 'maj7' },
  IV7: { semitones: 5, defaultQuality: '7' },
  iv: { semitones: 5, defaultQuality: 'm' },
  iv7: { semitones: 5, defaultQuality: 'm7' },
  '#ivdim7': { semitones: 6, defaultQuality: 'dim7' },
  V: { semitones: 7, defaultQuality: '' },
  V7: { semitones: 7, defaultQuality: '7' },
  vi: { semitones: 9, defaultQuality: 'm' },
  vi7: { semitones: 9, defaultQuality: 'm7' },
  VI7: { semitones: 9, defaultQuality: '7' },
  bVI: { semitones: 8, defaultQuality: '' },
  bVII: { semitones: 10, defaultQuality: '' },
  bVII7: { semitones: 10, defaultQuality: '7' },
  vii: { semitones: 11, defaultQuality: 'dim' },
  'viiø7': { semitones: 11, defaultQuality: 'm7b5' }
};

/**
 * Servicio de dominio puro que genera progresiones armónicas en notación ABC
 * con cifrado americano y una melodía base conducida por notas guía (3ª y 7ª).
 */
export class ProgressionGenerator {
  /**
   * Traduce un esquema de grados romanos a acordes concretos en la tonalidad indicada.
   * @param {string[]} degrees Arreglo de grados romanos (ej. ["ii7", "V7", "Imaj7"]).
   * @param {string} [key='C'] Tonalidad destino.
   * @returns {string[]} Lista de símbolos de acordes en cifrado americano.
   */
  resolveDegreesToChords(degrees, key = 'C') {
    const cleanKey = String(key || 'C').replace(/m$/, '');
    const rootPc = NOTE_TO_PC[cleanKey] ?? 0;
    const useFlats = prefersFlats(key);

    return degrees.map((deg) => {
      const trimmed = String(deg).trim();
      const entry = ROMAN_DEGREE_MAP[trimmed];
      if (!entry) {
        // Si ya es un acorde concreto (ej. "Dm7"), lo respeta tal cual
        return parseChord(trimmed) ? trimmed : `${cleanKey}`;
      }
      const chordRoot = pcToNoteName(rootPc + entry.semitones, useFlats);
      return `${chordRoot}${entry.defaultQuality}`;
    });
  }

  /**
   * Genera una práctica ABC a partir de una plantilla o lista de grados/acordes,
   * creando una melodía de notas guía con conducción suave de voces.
   * @param {object} options Configuración de generación.
   * @param {string} [options.templateId='ii-V-I'] Identificador de PROGRESSION_TEMPLATES.
   * @param {string[]} [options.customDegrees] Grados personalizados (anula templateId si se provee).
   * @param {string[]} [options.customChords] Acordes literales por compás (anula grados si se provee).
   * @param {string} [options.key='C'] Tonalidad base.
   * @param {'guitarra-clasica'|'guitarra'|'bajo'} [options.instrument='guitarra'] Instrumento destino.
   * @param {'blancas'|'negras'|'arpegio'} [options.pattern='blancas'] Patrón melódico de notas guía.
   * @param {string} [options.title] Título opcional.
   * @returns {{ abc: string, progression: ChordProgression, chords: string[], title: string }} Resultado generado.
   */
  generate(options = {}) {
    const key = options.key || 'C';
    const instrument = options.instrument || 'guitarra';
    const pattern = options.pattern || 'blancas';
    const isBass = instrument === 'bajo';
    const template = PROGRESSION_TEMPLATES[options.templateId] || PROGRESSION_TEMPLATES['ii-V-I'];

    let chords;
    let degrees = [];
    if (Array.isArray(options.customChords) && options.customChords.length > 0) {
      chords = options.customChords.map((c) => c.trim()).filter(Boolean);
    } else {
      degrees = Array.isArray(options.customDegrees) && options.customDegrees.length > 0
        ? options.customDegrees
        : template.degrees;
      chords = this.resolveDegreesToChords(degrees, key);
    }

    const progression = new ChordProgression({
      name: options.title || `${template.name} en ${key}`,
      key,
      timeSignature: template.timeSignature || '4/4',
      chords,
      degrees
    });

    const useFlats = prefersFlats(key);
    const keyMap = getKeySignatureMap(key);
    const clef = isBass ? 'bass' : 'treble-8';

    // Rango de conducción de notas guía (en treble-8 escrito C5=72 suena C4=60; en bass escrito C3=48 suena C2=36)
    const minMidi = isBass ? 40 : 62;
    const maxMidi = isBass ? 57 : 79;
    let prevGuideMidi = isBass ? 48 : 69;

    const bars = chords.map((chordSymbol) => {
      const parsed = parseChord(chordSymbol) || parseChord(key) || { rootPc: 0, intervals: [0, 4, 7] };
      const thirdPc = mod12(parsed.rootPc + (parsed.intervals[1] ?? 4));
      const fifthPc = mod12(parsed.rootPc + (parsed.intervals[2] ?? 7));
      const seventhPc = parsed.intervals[3] !== undefined
        ? mod12(parsed.rootPc + parsed.intervals[3])
        : parsed.rootPc;

      // Elige la nota guía (3ª o 7ª) más cercana a la nota anterior para enlace suave
      const guide1 = this._nearestPitchInRange(thirdPc, prevGuideMidi, minMidi, maxMidi);
      const guide2 = this._nearestPitchInRange(seventhPc, guide1, minMidi, maxMidi);
      const rootNote = this._nearestPitchInRange(parsed.rootPc, guide1, minMidi, maxMidi);
      const fifthNote = this._nearestPitchInRange(fifthPc, guide1, minMidi, maxMidi);
      prevGuideMidi = guide2;

      const toAbc = (m) => midiToAbcPitch(m, useFlats, keyMap);

      if (pattern === 'arpegio') {
        const n1 = toAbc(rootNote);
        const n2 = toAbc(guide1);
        const n3 = toAbc(fifthNote);
        const n4 = toAbc(guide2);
        return `"${chordSymbol}"${n1} ${n2} ${n3} ${n4}`;
      }
      if (pattern === 'negras') {
        const n1 = toAbc(guide1);
        const n2 = toAbc(fifthNote);
        const n3 = toAbc(guide2);
        const n4 = toAbc(guide1);
        return `"${chordSymbol}"${n1} ${n2} ${n3} ${n4}`;
      }
      // Por defecto: blancas con 3ª y 7ª (notas guía clásicas)
      const n1 = toAbc(guide1);
      const n2 = toAbc(guide2);
      return `"${chordSymbol}"${n1}2 ${n2}2`;
    });

    const lines = [];
    for (let i = 0; i < bars.length; i += 4) {
      const slice = bars.slice(i, i + 4);
      const isLast = i + 4 >= bars.length;
      lines.push(`${slice.join(' | ')}${isLast ? ' |]' : ' |'}`);
    }

    const abc = [
      'X:1',
      `T:${progression.name}`,
      `M:${progression.timeSignature}`,
      'L:1/4',
      `K:${key} clef=${clef}`,
      ...lines
    ].join('\n');

    return {
      abc,
      progression,
      chords,
      title: progression.name
    };
  }

  /**
   * Encuentra la altura MIDI de una clase de altura dada más próxima a una referencia dentro de un rango.
   * @param {number} pc Clase de altura objetivo (0-11).
   * @param {number} referenceMidi Altura MIDI de referencia previa.
   * @param {number} minMidi Límite inferior del registro.
   * @param {number} maxMidi Límite superior del registro.
   * @returns {number} Altura MIDI seleccionada.
   */
  _nearestPitchInRange(pc, referenceMidi, minMidi, maxMidi) {
    let best = null;
    let bestDist = Infinity;
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (mod12(midi) === pc) {
        const dist = Math.abs(midi - referenceMidi);
        if (dist < bestDist) {
          bestDist = dist;
          best = midi;
        }
      }
    }
    return best ?? referenceMidi;
  }

  /**
   * Devuelve la lista de plantillas de progresiones predefinidas.
   * @returns {Array<{ id: string, name: string, degrees: string[] }>} Plantillas disponibles.
   */
  getAvailableTemplates() {
    return Object.entries(PROGRESSION_TEMPLATES).map(([id, def]) => ({
      id,
      name: def.name,
      degrees: [...def.degrees]
    }));
  }
}
