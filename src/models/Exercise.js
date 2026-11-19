import { extractMeasuresFromAbc, extractTimeSignatureFromAbc, parseTimeSignature } from '../core/MusicTheory.js';

/**
 * Modelo de dominio puro que representa la estructura musical parseada de una práctica (compases, acordes y pulso).
 */
export class Exercise {
  /**
   * Construye un ejercicio a partir del texto ABC y metadatos de una práctica.
   * @param {{ practiceId: string, abc: string, key: string, timeSignature: string }} params Datos del ejercicio.
   */
  constructor({ practiceId, abc, key = 'C', timeSignature = '4/4' }) {
    /** Identificador de la práctica asociada. */
    this.practiceId = practiceId;
    /** Texto fuente en notación ABC. */
    this.abc = abc || '';
    /** Tonalidad principal del ejercicio. */
    this.key = key;
    /** Compás efectivo detectado o heredado. */
    this.timeSignature = extractTimeSignatureFromAbc(this.abc, timeSignature);
    /** Numerador y denominador numéricos del compás. */
    this.meter = parseTimeSignature(this.timeSignature);
    /** Compases extraídos con su lista de acordes por compás. */
    this.measures = extractMeasuresFromAbc(this.abc);
  }

  /**
   * Devuelve la cantidad total de compases detectados en el ejercicio.
   * @returns {number} Cantidad de compases.
   */
  get measureCount() {
    return this.measures.length;
  }

  /**
   * Indica si el ejercicio contiene al menos un símbolo de acorde cifrado.
   * @returns {boolean} True si tiene cifrado.
   */
  get hasChords() {
    return this.measures.some((m) => m.chords.length > 0);
  }

  /**
   * Devuelve todos los acordes distintos utilizados en el ejercicio en orden de aparición.
   * @returns {string[]} Lista única de acordes.
   */
  getUniqueChords() {
    const seen = new Set();
    const list = [];
    for (const measure of this.measures) {
      for (const chord of measure.chords) {
        if (!seen.has(chord)) {
          seen.add(chord);
          list.push(chord);
        }
      }
    }
    return list;
  }
}
