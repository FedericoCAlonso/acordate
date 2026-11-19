/**
 * Esquemas predefinidos de progresiones armónicas expresadas en grados romanos.
 */
export const PROGRESSION_TEMPLATES = {
  'I-IV-V-I': {
    name: 'I – IV – V – I (Cadencia básica)',
    degrees: ['I', 'IV', 'V', 'I'],
    timeSignature: '4/4'
  },
  'I-vi-IV-V': {
    name: 'I – vi – IV – V (Pop clásico)',
    degrees: ['I', 'vi', 'IV', 'V'],
    timeSignature: '4/4'
  },
  'I-vi-ii-V': {
    name: 'I – vi – ii – V (Turnaround estándar)',
    degrees: ['Imaj7', 'vi7', 'ii7', 'V7'],
    timeSignature: '4/4'
  },
  'ii-V-I': {
    name: 'ii – V – I mayor (Jazz)',
    degrees: ['ii7', 'V7', 'Imaj7', 'Imaj7'],
    timeSignature: '4/4'
  },
  'ii-V-i-minor': {
    name: 'iiø – V7b9 – i menor (Jazz menor)',
    degrees: ['iiø7', 'V7', 'im7', 'im7'],
    timeSignature: '4/4'
  },
  'blues-12': {
    name: 'Blues de 12 compases',
    degrees: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    timeSignature: '4/4'
  },
  'blues-jazz-12': {
    name: 'Blues jazz de 12 compases',
    degrees: ['I7', 'IV7', 'I7', 'I7', 'IV7', '#ivdim7', 'I7', 'VI7', 'ii7', 'V7', 'I7', 'V7'],
    timeSignature: '4/4'
  },
  'rhythm-changes-a': {
    name: 'Rhythm Changes (Sección A - 8 compases)',
    degrees: ['Imaj7', 'vi7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'],
    timeSignature: '4/4'
  }
};

/**
 * Modelo de dominio puro que encapsula una progresión de acordes en una tonalidad dada.
 */
export class ChordProgression {
  /**
   * Inicializa una progresión armónica.
   * @param {{ name: string, key: string, timeSignature?: string, chords: string[], degrees?: string[] }} params Datos de la progresión.
   */
  constructor({ name, key = 'C', timeSignature = '4/4', chords = [], degrees = [] }) {
    /** Nombre descriptivo de la progresión. */
    this.name = name || 'Progresión personalizada';
    /** Tonalidad base en cifrado americano. */
    this.key = key;
    /** Compás de la progresión. */
    this.timeSignature = timeSignature;
    /** Lista ordenada de acordes por compás. */
    this.chords = [...chords];
    /** Grados romanos originales si provienen de un esquema. */
    this.degrees = [...degrees];
  }

  /**
   * Cantidad total de compases de la progresión.
   * @returns {number} Número de compases.
   */
  get barCount() {
    return this.chords.length;
  }
}
