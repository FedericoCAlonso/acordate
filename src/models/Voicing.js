import { formatChordSymbol } from '../core/i18n.js';
import { midiToAbcPitch, mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { soundingMidiToWrittenMidi } from '../core/PitchPolicy.js';
import { Chord } from './Chord.js';
import { Tuning } from './Tuning.js';

/**
 * Etiquetas legibles para los grados de inversión de un acorde.
 */
export const INVERSION_LABELS = {
  0: 'Fundamental',
  1: '1.ª inversión',
  2: '2.ª inversión',
  3: '3.ª inversión'
};

/**
 * Símbolos Unicode de número de cuerda en círculo (1ª a 6ª) para pentagrama clásico.
 */
const CIRCLED_STRINGS = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥' };

/**
 * Modelo de dominio puro que representa una digitación concreta (voicing) de un acorde.
 * Los números MIDI reales y las funciones armónicas (R, 3, 5, 7) siempre se calculan
 * dinámicamente a partir de Tuning + frets (no se almacenan duplicados).
 */
export class Voicing {
  /**
   * Construye una instancia de Voicing conforme al esquema oficial de v3.
   * @param {object} data Datos del voicing.
   */
  constructor(data) {
    /** Identificador único del voicing (ej. "c-major-open"). */
    this.id = data.id || `voicing-${Math.random().toString(36).slice(2, 8)}`;
    /** Símbolo del acorde en cifrado americano (ej. "C", "Am7", "C/E"). */
    this.chord = String(data.chord || 'C').trim();
    /** Familia de instrumento ('guitar' o 'bass'). */
    this.instrument = data.instrument === 'bass' ? 'bass' : 'guitar';
    /** Trastes de la cuerda más grave a la más aguda; null indica cuerda silenciada, 0 al aire. */
    this.frets = Array.isArray(data.frets)
      ? data.frets.map((f) => (f === null || f === undefined || f === 'x' ? null : Number(f)))
      : [null, 3, 2, 0, 1, 0];
    /** Dedos recomendados (0 = aire, 1-4 = dedos de mano izquierda, null = cuerda apagada). */
    this.fingers = Array.isArray(data.fingers)
      ? data.fingers.map((f) => (f === null || f === undefined ? null : Number(f)))
      : this.frets.map((f) => (f === null ? null : f === 0 ? 0 : 1));
    /** Primer traste visible del diagrama (1 para primera posición, o el traste más bajo pisado). */
    this.baseFret = Number(data.baseFret) || this._inferBaseFret();
    /** Lista de cejillas: [{ fret, fromString, toString, finger }] (índices 0-based grave->aguda). */
    this.barres = Array.isArray(data.barres) ? data.barres.map((b) => ({ ...b })) : [];
    /** Grado de inversión (0 fundamental, 1 primera, 2 segunda, 3 tercera). */
    this.inversion = Number.isInteger(data.inversion) ? data.inversion : 0;
    /** Nombre de la nota más grave del voicing (ej. "C", "E"). */
    this.bassNote = data.bassNote || null;
    /** Etiquetas descriptivas (abierto, cejilla, triada, drop2, shell, CAGED, clasica, sugerido). */
    this.tags = Array.isArray(data.tags) ? [...data.tags] : [];
    /** Indica si la forma es transportable a lo largo del mango. */
    this.movable = Boolean(data.movable);
    /** Indica si proviene del generador automático ("sugerida"). */
    this.suggested = Boolean(data.suggested);
  }

  /**
   * Deduce el traste base óptimo para el diagrama de 4-5 trastes.
   * @returns {number} Traste inicial >= 1.
   */
  _inferBaseFret() {
    const fretted = this.frets.filter((f) => f !== null && f > 0);
    if (fretted.length === 0) return 1;
    const minFret = Math.min(...fretted);
    const maxFret = Math.max(...fretted);
    if (maxFret <= 4) return 1;
    return minFret;
  }

  /**
   * Calcula las alturas MIDI reales que suenan para este voicing en la afinación dada,
   * ordenadas de la cuerda más grave a la más aguda.
   * @param {Tuning} [tuning] Afinación activa (por defecto estándar del instrumento).
   * @returns {number[]} Arreglo de números MIDI reales.
   */
  getMidiNotes(tuning = Tuning.defaultForInstrument(this.instrument)) {
    const notes = [];
    for (let i = 0; i < this.frets.length && i < tuning.stringCount; i++) {
      const midi = tuning.getMidiAt(i, this.frets[i]);
      if (midi !== null) notes.push(midi);
    }
    return notes;
  }

  /**
   * Calcula detalle completo de cada cuerda que suena: MIDI, nombre de nota y función armónica (R, 3, 5, 7).
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {Array<{ stringIndex: number, stringNumber: number, fret: number, finger: number|null, midi: number, noteName: string, fnLabel: string }>} Notas detalladas.
   */
  getDetailedNotes(tuning = Tuning.defaultForInstrument(this.instrument), notation = 'americano') {
    const chordObj = Chord.parse(this.chord);
    const useFlats = prefersFlats(chordObj.root) || this.chord.includes('b');
    const out = [];

    for (let i = 0; i < this.frets.length && i < tuning.stringCount; i++) {
      const fret = this.frets[i];
      if (fret === null) continue;
      const midi = tuning.getMidiAt(i, fret);
      if (midi === null) continue;
      const amNote = pcToNoteName(mod12(midi), useFlats);
      out.push({
        stringIndex: i,
        stringNumber: tuning.getTraditionalStringNumber(i),
        fret,
        finger: this.fingers[i] ?? null,
        midi,
        noteName: formatChordSymbol(amNote, notation),
        fnLabel: chordObj.getFunctionLabelForMidi(midi)
      });
    }
    return out;
  }

  /**
   * Calcula la inversión real (0, 1, 2 o 3) a partir de la nota más grave que produce Tuning + frets.
   * @param {Tuning} [tuning] Afinación activa.
   * @returns {number} Grado de inversión.
   */
  computeInversion(tuning = Tuning.defaultForInstrument(this.instrument)) {
    const midis = this.getMidiNotes(tuning);
    if (midis.length === 0) return 0;
    const lowest = Math.min(...midis);
    const chordObj = Chord.parse(this.chord);
    return chordObj.getInversionForBassPc(mod12(lowest));
  }

  /**
   * Devuelve el nombre de la nota más grave del voicing calculado dinámicamente desde Tuning + frets.
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {string} Nombre de la nota más grave.
   */
  computeBassNote(tuning = Tuning.defaultForInstrument(this.instrument), notation = 'americano') {
    const midis = this.getMidiNotes(tuning);
    if (midis.length === 0) return '';
    const lowest = Math.min(...midis);
    const chordObj = Chord.parse(this.chord);
    const am = pcToNoteName(mod12(lowest), prefersFlats(chordObj.root) || this.chord.includes('b'));
    return formatChordSymbol(am, notation);
  }

  /**
   * Construye una descripción textual accesible completa del diagrama para lectores de pantalla.
   * Ejemplo: "Do mayor: cuerda 5 traste 3 (dedo 3), cuerda 4 traste 2 (dedo 2), cuerda 3 al aire…"
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {string} Descripción accesible.
   */
  toAccessibleDescription(tuning = Tuning.defaultForInstrument(this.instrument), notation = 'americano') {
    const chordObj = Chord.parse(this.chord);
    const name = `${chordObj.getSymbol(notation)} (${chordObj.quality.name})`;
    const details = this.getDetailedNotes(tuning, notation);
    if (details.length === 0) return `${name}: sin notas activas.`;

    const parts = details.map((d) => {
      if (d.fret === 0) return `cuerda ${d.stringNumber} al aire (${d.noteName})`;
      const fingerText = d.finger ? `, dedo ${d.finger}` : '';
      return `cuerda ${d.stringNumber} traste ${d.fret}${fingerText} (${d.noteName})`;
    });
    return `${name}: ${parts.join('; ')}.`;
  }

  /**
   * Genera una partitura ABC de un compás con el acorde escrito en pentagrama (clave de sol octavada
   * para guitarra/clásica o clave de fa para bajo), incluyendo digitación y cuerdas en círculo.
   * @param {Tuning} [tuning] Afinación activa.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {string} Cadena ABC lista para abcjs (sin tablatura).
   */
  toAbcStaff(tuning = Tuning.defaultForInstrument(this.instrument), notation = 'americano') {
    const details = this.getDetailedNotes(tuning, notation);
    const chordObj = Chord.parse(this.chord);
    const useFlats = prefersFlats(chordObj.root) || this.chord.includes('b');
    const isBass = this.instrument === 'bass';
    const policyInst = isBass ? 'bajo' : 'guitarra-clasica';
    const clef = isBass ? 'bass' : 'treble-8';

    const chordNotesAbc = details.map((d) => {
      const written = soundingMidiToWrittenMidi(d.midi, policyInst);
      return midiToAbcPitch(written, useFlats);
    });

    const fingSummary = details
      .map((d) => `${d.finger ?? 0}${CIRCLED_STRINGS[d.stringNumber] || ''}`)
      .join(' ');

    const symbol = chordObj.getSymbol(notation);
    const chordBlock = chordNotesAbc.length > 0 ? `[${chordNotesAbc.join('')}]4` : 'z4';

    return [
      'X:1',
      'M:4/4',
      'L:1/4',
      `K:C clef=${clef}`,
      `"${symbol}""^${fingSummary}"${chordBlock} |]`
    ].join('\n');
  }

  /**
   * Devuelve una etiqueta clara de la posición en el mango (ej. "Posición abierta" o "Traste 8").
   * @returns {string} Etiqueta legible de posición sin abreviaturas ambiguas.
   */
  getPositionLabel() {
    const hasOpen = this.frets.includes(0);
    if (this.baseFret <= 1 && hasOpen) return 'Posición abierta';
    return `Traste ${Math.max(1, this.baseFret)}`;
  }

  /**
   * Devuelve las cuerdas tradicionales activas del voicing (ej. "cuerdas 4-3-2" o "cuerdas 5-4-3-2-1").
   * @param {Tuning} [tuning] Afinación activa.
   * @returns {string} Descripción de cuerdas utilizadas.
   */
  getUsedStringsLabel(tuning = Tuning.defaultForInstrument(this.instrument)) {
    const nums = [];
    for (let i = 0; i < this.frets.length && i < tuning.stringCount; i++) {
      if (this.frets[i] !== null) {
        nums.push(tuning.getTraditionalStringNumber(i));
      }
    }
    return nums.length > 0 ? `cuerdas ${nums.join('-')}` : 'sin cuerdas';
  }

  /**
   * Serializa el voicing al esquema JSON oficial (sin persistir MIDI ni funciones derivadas).
   * @returns {object} Objeto JSON plano.
   */
  toJSON() {
    return {
      id: this.id,
      chord: this.chord,
      instrument: this.instrument,
      frets: [...this.frets],
      fingers: [...this.fingers],
      baseFret: this.baseFret,
      barres: this.barres.map((b) => ({ ...b })),
      inversion: this.inversion,
      bassNote: this.bassNote,
      tags: [...this.tags],
      movable: this.movable,
      ...(this.suggested ? { suggested: true } : {})
    };
  }
}
