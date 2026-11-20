import { formatChordSymbol } from '../core/i18n.js';
import { NOTE_TO_PC, mod12, pcToNoteName, prefersFlats } from '../core/MusicTheory.js';
import { ChordQuality } from './ChordQuality.js';

/**
 * Modelo de dominio puro que representa un acorde con raíz, calidad, bajo opcional (slash chord)
 * y utilidades para cifrado americano/latino, notas constituyentes e intervalos.
 */
export class Chord {
  /**
   * Construye una instancia de Chord validando raíz, calidad y bajo opcional.
   * @param {{ root: string, quality?: string|ChordQuality, bass?: string|null }} params Datos del acorde.
   */
  constructor({ root, quality = '', bass = null }) {
    const cleanRoot = String(root || 'C').trim();
    const rootPc = NOTE_TO_PC[cleanRoot];
    if (rootPc === undefined) {
      throw new Error(`Raíz de acorde inválida: "${root}"`);
    }

    /** Nombre de la raíz en cifrado americano (ej. "C", "F#", "Bb"). */
    this.root = cleanRoot;
    /** Clase de altura cromática de la raíz (0..11). */
    this.rootPc = rootPc;
    /** Calidad armónica con sus intervalos y etiquetas. */
    this.quality = quality instanceof ChordQuality ? quality : ChordQuality.fromSymbol(quality);

    let cleanBass = null;
    let bassPc = null;
    if (bass) {
      const b = String(bass).trim();
      if (NOTE_TO_PC[b] !== undefined) {
        cleanBass = b;
        bassPc = NOTE_TO_PC[b];
      }
    }
    /** Nota del bajo si es un slash chord (ej. "E" en "C/E") o null si es estado fundamental. */
    this.bass = cleanBass;
    /** Clase de altura cromática del bajo explícito o null. */
    this.bassPc = bassPc;
  }

  /**
   * Símbolo completo del acorde en cifrado americano (ej. "Dm7", "C/E").
   * @returns {string} Símbolo americano.
   */
  get americanSymbol() {
    const core = `${this.root}${this.quality.id}`;
    return this.bass ? `${core}/${this.bass}` : core;
  }

  /**
   * Símbolo completo del acorde en cifrado latino (ej. "Rem7", "Do/Mi").
   * @returns {string} Símbolo latino.
   */
  get latinSymbol() {
    return formatChordSymbol(this.americanSymbol, 'latino');
  }

  /**
   * Devuelve el símbolo formateado según la preferencia activa ('americano' | 'latino').
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {string} Símbolo formateado.
   */
  getSymbol(notation = 'americano') {
    return notation === 'latino' ? this.latinSymbol : this.americanSymbol;
  }

  /**
   * Devuelve las clases de altura (0..11) que integran el acorde (incluyendo el bajo si es slash).
   * @returns {number[]} Clases de altura ordenadas.
   */
  getPitchClasses() {
    const pcs = this.quality.intervals.map((iv) => mod12(this.rootPc + iv));
    if (this.bassPc !== null && !pcs.includes(this.bassPc)) {
      pcs.unshift(this.bassPc);
    }
    return pcs;
  }

  /**
   * Devuelve la lista de notas del acorde con su nombre e intervalo armónico.
   * @param {'americano'|'latino'} [notation='americano'] Sistema de cifrado.
   * @returns {Array<{ pc: number, name: string, label: string, interval: number }>} Notas del acorde.
   */
  getNotesInfo(notation = 'americano') {
    const useFlats = prefersFlats(this.root) || this.quality.id.includes('b') || this.quality.id.includes('dim');
    return this.quality.intervals.map((iv, idx) => {
      const pc = mod12(this.rootPc + iv);
      const amName = pcToNoteName(pc, useFlats);
      return {
        pc,
        name: formatChordSymbol(amName, notation),
        label: this.quality.labels[idx] || '',
        interval: iv
      };
    });
  }

  /**
   * Identifica la función armónica (R, 3, b3, 5, b7, 7, 9, etc.) de una nota MIDI respecto a este acorde.
   * @param {number} midi Número MIDI de la nota.
   * @returns {string} Etiqueta de función armónica.
   */
  getFunctionLabelForMidi(midi) {
    const pc = mod12(midi);
    const diff = mod12(pc - this.rootPc);

    // Primero busca coincidencia exacta con los intervalos propios de la calidad del acorde
    for (let i = 0; i < this.quality.intervals.length; i++) {
      if (mod12(this.quality.intervals[i]) === diff) {
        return this.quality.labels[i];
      }
    }

    const fallbackMap = {
      0: 'R', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '4',
      6: 'b5', 7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7'
    };
    return fallbackMap[diff] || '';
  }

  /**
   * Determina el número de inversión (0 = fundamental, 1 = 1ª, 2 = 2ª, 3 = 3ª) dada la clase de altura más grave.
   * Reconoce además bajos en 7ª (b7/7) en acordes con bajo agregado como Am/G.
   * @param {number} lowestPc Clase de altura de la nota más grave que suena.
   * @returns {number} Índice de inversión (0..3).
   */
  getInversionForBassPc(lowestPc) {
    const diff = mod12(lowestPc - this.rootPc);
    if (diff === 0) return 0;
    const idx = this.quality.intervals.findIndex((iv) => mod12(iv) === diff);
    if (idx > 0) return Math.min(3, idx);
    if (diff === 10 || diff === 11) return 3;
    return 0;
  }

  /**
   * Parsea un símbolo en cifrado americano (ej. "C", "Am7", "D/F#", "Bm7b5") a una instancia Chord.
   * @param {string} symbol Cadena del acorde.
   * @returns {Chord} Instancia de Chord.
   */
  static parse(symbol) {
    const clean = String(symbol || '').trim();
    const [mainPart, bassPart] = clean.split('/');
    const match = mainPart.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) {
      throw new Error(`No se pudo parsear el acorde "${symbol}".`);
    }
    return new Chord({
      root: `${match[1]}${match[2]}`,
      quality: match[3] || '',
      bass: bassPart || null
    });
  }
}
