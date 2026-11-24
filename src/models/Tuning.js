/**
 * Afinaciones predefinidas para guitarra (estándar y alternativas) y bajo (4 y 5 cuerdas).
 * Las notas van siempre de la cuerda más grave a la más aguda.
 */
export const PRESET_TUNINGS = {
  'guitar-standard': {
    id: 'guitar-standard',
    name: 'Guitarra estándar (E A D G B E)',
    instrument: 'guitar',
    strings: [40, 45, 50, 55, 59, 64],
    noteNames: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
  },
  'guitar-drop-d': {
    id: 'guitar-drop-d',
    name: 'Guitarra Drop D (D A D G B E)',
    instrument: 'guitar',
    strings: [38, 45, 50, 55, 59, 64],
    noteNames: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
  },
  'guitar-dadgad': {
    id: 'guitar-dadgad',
    name: 'Guitarra DADGAD',
    instrument: 'guitar',
    strings: [38, 45, 50, 55, 57, 62],
    noteNames: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']
  },
  'guitar-open-g': {
    id: 'guitar-open-g',
    name: 'Guitarra Open G (D G D G B D)',
    instrument: 'guitar',
    strings: [38, 43, 50, 55, 59, 62],
    noteNames: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4']
  },
  'bass-4-standard': {
    id: 'bass-4-standard',
    name: 'Bajo 4 cuerdas estándar (E A D G)',
    instrument: 'bass',
    strings: [28, 33, 38, 43],
    noteNames: ['E1', 'A1', 'D2', 'G2']
  },
  'bass-5-standard': {
    id: 'bass-5-standard',
    name: 'Bajo 5 cuerdas estándar (B E A D G)',
    instrument: 'bass',
    strings: [23, 28, 33, 38, 43],
    noteNames: ['B0', 'E1', 'A1', 'D2', 'G2']
  },
  'bass-4-drop-d': {
    id: 'bass-4-drop-d',
    name: 'Bajo 4 cuerdas Drop D (D A D G)',
    instrument: 'bass',
    strings: [26, 33, 38, 43],
    noteNames: ['D1', 'A1', 'D2', 'G2']
  }
};

/**
 * Modelo de dominio puro que representa la afinación y cantidad de cuerdas de un instrumento.
 * Las cuerdas se indexan de la más grave (índice 0) a la más aguda (índice stringCount - 1).
 */
export class Tuning {
  /**
   * Construye una instancia de afinación a partir de sus alturas MIDI al aire.
   * @param {{ id?: string, name: string, instrument?: 'guitar'|'bass', strings: number[], noteNames?: string[] }} data Datos de afinación.
   */
  constructor(data) {
    if (!data || !Array.isArray(data.strings) || data.strings.length < 4) {
      throw new Error('Una afinación debe especificar al menos 4 cuerdas en números MIDI.');
    }
    /** Identificador único de la afinación. */
    this.id = data.id || 'custom-tuning';
    /** Nombre descriptivo legible. */
    this.name = data.name || 'Afinación personalizada';
    /** Familia instrumental ('guitar' o 'bass'). */
    this.instrument = data.instrument === 'bass' ? 'bass' : 'guitar';
    /** Alturas MIDI reales al aire ordenadas de la cuerda más grave a la más aguda. */
    this.strings = data.strings.map(Number);
    /** Etiquetas científicas de cada cuerda al aire (ej. ["E2", "A2", ...]). */
    this.noteNames = Array.isArray(data.noteNames) ? [...data.noteNames] : [];
  }

  /**
   * Cantidad total de cuerdas del instrumento en esta afinación.
   * @returns {number} Número de cuerdas (ej. 6, 4 o 5).
   */
  get stringCount() {
    return this.strings.length;
  }

  /**
   * Nombres de nota limpios (sin número de octava) para etiquetar cada cuerda al aire (ej. ["E", "A", "D", "G", "B", "E"]).
   * @returns {string[]} Etiquetas de cuerdas de grave a aguda.
   */
  get stringLabels() {
    return this.noteNames.map((n) => String(n || '').replace(/\d+$/, ''));
  }

  /**
   * Calcula el número MIDI real al pisar un traste en una cuerda dada (0 = cuerda al aire).
   * @param {number} stringIndex Índice de cuerda (0 = más grave).
   * @param {number|null} fret Número de traste (0..24) o null si la cuerda no suena.
   * @returns {number|null} Altura MIDI real o null si está silenciada.
   */
  getMidiAt(stringIndex, fret) {
    if (fret === null || fret === undefined) return null;
    const openMidi = this.strings[stringIndex];
    if (openMidi === undefined) return null;
    const fretNum = Number(fret);
    if (!Number.isFinite(fretNum) || fretNum < 0) return null;
    return openMidi + fretNum;
  }

  /**
   * Devuelve el número tradicional de cuerda (6ª..1ª en guitarra, 4ª..1ª en bajo) para un índice interno.
   * @param {number} stringIndex Índice 0-based desde la cuerda más grave.
   * @returns {number} Número tradicional de cuerda (1 = más aguda).
   */
  getTraditionalStringNumber(stringIndex) {
    return this.stringCount - stringIndex;
  }

  /**
   * Serializa la afinación a objeto plano JSON.
   * @returns {object} Representación JSON.
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      instrument: this.instrument,
      strings: [...this.strings],
      noteNames: [...this.noteNames]
    };
  }

  /**
   * Obtiene una afinación predefinida por su identificador.
   * @param {string} tuningId Clave en PRESET_TUNINGS.
   * @returns {Tuning} Instancia de Tuning.
   */
  static byId(tuningId) {
    const preset = PRESET_TUNINGS[tuningId] || PRESET_TUNINGS['guitar-standard'];
    return new Tuning(preset);
  }

  /**
   * Devuelve la afinación estándar correspondiente a un instrumento de Acordate.
   * @param {string} instrument 'guitarra-clasica', 'guitarra', 'guitar', 'bajo' o 'bass'.
   * @returns {Tuning} Afinación por defecto.
   */
  static defaultForInstrument(instrument = 'guitarra') {
    if (instrument === 'bajo' || instrument === 'bass') {
      return Tuning.byId('bass-4-standard');
    }
    return Tuning.byId('guitar-standard');
  }
}
