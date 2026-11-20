/**
 * Catálogo completo de cualidades de acordes definidas por sus intervalos en semitonos
 * y etiquetas de grado armónico desde la raíz.
 */
export const CHORD_QUALITY_CATALOG = {
  '': {
    id: '',
    name: 'Mayor',
    shortName: 'Mayor',
    group: 'triada',
    intervals: [0, 4, 7],
    labels: ['R', '3', '5']
  },
  m: {
    id: 'm',
    name: 'Menor',
    shortName: 'Menor',
    group: 'triada',
    intervals: [0, 3, 7],
    labels: ['R', 'b3', '5']
  },
  dim: {
    id: 'dim',
    name: 'Disminuido',
    shortName: 'Disminuido',
    group: 'triada',
    intervals: [0, 3, 6],
    labels: ['R', 'b3', 'b5']
  },
  aug: {
    id: 'aug',
    name: 'Aumentado',
    shortName: 'Aumentado',
    group: 'triada',
    intervals: [0, 4, 8],
    labels: ['R', '3', '#5']
  },
  sus2: {
    id: 'sus2',
    name: 'Suspendido 2',
    shortName: 'sus2',
    group: 'triada',
    intervals: [0, 2, 7],
    labels: ['R', '2', '5']
  },
  sus4: {
    id: 'sus4',
    name: 'Suspendido 4',
    shortName: 'sus4',
    group: 'triada',
    intervals: [0, 5, 7],
    labels: ['R', '4', '5']
  },
  '5': {
    id: '5',
    name: 'Quinta (Power chord)',
    shortName: '5',
    group: 'triada',
    intervals: [0, 7],
    labels: ['R', '5']
  },
  maj7: {
    id: 'maj7',
    name: 'Mayor con séptima mayor',
    shortName: 'maj7',
    group: 'septima',
    intervals: [0, 4, 7, 11],
    labels: ['R', '3', '5', '7']
  },
  '7': {
    id: '7',
    name: 'Dominante 7',
    shortName: '7',
    group: 'septima',
    intervals: [0, 4, 7, 10],
    labels: ['R', '3', '5', 'b7']
  },
  m7: {
    id: 'm7',
    name: 'Menor con séptima menor',
    shortName: 'm7',
    group: 'septima',
    intervals: [0, 3, 7, 10],
    labels: ['R', 'b3', '5', 'b7']
  },
  m7b5: {
    id: 'm7b5',
    name: 'Semidisminuido (m7b5)',
    shortName: 'm7b5',
    group: 'septima',
    intervals: [0, 3, 6, 10],
    labels: ['R', 'b3', 'b5', 'b7']
  },
  dim7: {
    id: 'dim7',
    name: 'Disminuido 7',
    shortName: 'dim7',
    group: 'septima',
    intervals: [0, 3, 6, 9],
    labels: ['R', 'b3', 'b5', 'bb7']
  },
  mMaj7: {
    id: 'mMaj7',
    name: 'Menor con séptima mayor',
    shortName: 'mMaj7',
    group: 'septima',
    intervals: [0, 3, 7, 11],
    labels: ['R', 'b3', '5', '7']
  },
  '6': {
    id: '6',
    name: 'Sexta mayor',
    shortName: '6',
    group: 'extension',
    intervals: [0, 4, 7, 9],
    labels: ['R', '3', '5', '6']
  },
  m6: {
    id: 'm6',
    name: 'Menor sexta',
    shortName: 'm6',
    group: 'extension',
    intervals: [0, 3, 7, 9],
    labels: ['R', 'b3', '5', '6']
  },
  add9: {
    id: 'add9',
    name: 'Mayor con novena añadida',
    shortName: 'add9',
    group: 'extension',
    intervals: [0, 4, 7, 14],
    labels: ['R', '3', '5', '9']
  },
  '9': {
    id: '9',
    name: 'Dominante 9',
    shortName: '9',
    group: 'extension',
    intervals: [0, 4, 7, 10, 14],
    labels: ['R', '3', '5', 'b7', '9']
  },
  m9: {
    id: 'm9',
    name: 'Menor 9',
    shortName: 'm9',
    group: 'extension',
    intervals: [0, 3, 7, 10, 14],
    labels: ['R', 'b3', '5', 'b7', '9']
  },
  maj9: {
    id: 'maj9',
    name: 'Mayor 9',
    shortName: 'maj9',
    group: 'extension',
    intervals: [0, 4, 7, 11, 14],
    labels: ['R', '3', '5', '7', '9']
  },
  '11': {
    id: '11',
    name: 'Dominante 11',
    shortName: '11',
    group: 'extension',
    intervals: [0, 7, 10, 14, 17],
    labels: ['R', '5', 'b7', '9', '11']
  },
  m11: {
    id: 'm11',
    name: 'Menor 11',
    shortName: 'm11',
    group: 'extension',
    intervals: [0, 3, 7, 10, 17],
    labels: ['R', 'b3', '5', 'b7', '11']
  },
  '13': {
    id: '13',
    name: 'Dominante 13',
    shortName: '13',
    group: 'extension',
    intervals: [0, 4, 10, 14, 21],
    labels: ['R', '3', 'b7', '9', '13']
  },
  '7b9': {
    id: '7b9',
    name: 'Dominante 7 b9',
    shortName: '7b9',
    group: 'extension',
    intervals: [0, 4, 7, 10, 13],
    labels: ['R', '3', '5', 'b7', 'b9']
  },
  '7#9': {
    id: '7#9',
    name: 'Dominante 7 #9',
    shortName: '7#9',
    group: 'extension',
    intervals: [0, 4, 7, 10, 15],
    labels: ['R', '3', '5', 'b7', '#9']
  },
  '7#11': {
    id: '7#11',
    name: 'Lidio dominante (7#11)',
    shortName: '7#11',
    group: 'extension',
    intervals: [0, 4, 7, 10, 18],
    labels: ['R', '3', '5', 'b7', '#11']
  },
  '7alt': {
    id: '7alt',
    name: 'Dominante alterado (7alt)',
    shortName: '7alt',
    group: 'extension',
    intervals: [0, 4, 8, 10, 13],
    labels: ['R', '3', '#5', 'b7', 'b9']
  }
};

/**
 * Alias comunes en cifrado americano normalizados hacia la clave canónica de CHORD_QUALITY_CATALOG.
 */
const QUALITY_ALIASES = {
  maj: '',
  M: '',
  min: 'm',
  '-': 'm',
  o: 'dim',
  '°': 'dim',
  '+': 'aug',
  M7: 'maj7',
  'Δ7': 'maj7',
  min7: 'm7',
  '-7': 'm7',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  '°7': 'dim7',
  o7: 'dim7',
  sus: 'sus4'
};

/**
 * Modelo de dominio puro que describe la calidad armónica de un acorde a partir de sus intervalos.
 */
export class ChordQuality {
  /**
   * Crea una instancia de ChordQuality desde una definición.
   * @param {{ id: string, name: string, shortName: string, group: string, intervals: number[], labels: string[] }} def Definición.
   */
  constructor(def) {
    /** Clave canónica de sufijo (ej. "", "m", "maj7", "m7b5"). */
    this.id = def.id;
    /** Nombre completo en español. */
    this.name = def.name;
    /** Etiqueta breve para selectores y chips. */
    this.shortName = def.shortName;
    /** Familia: 'triada', 'septima' o 'extension'. */
    this.group = def.group;
    /** Intervalos en semitonos respecto a la fundamental. */
    this.intervals = [...def.intervals];
    /** Etiquetas de función correspondientes a cada intervalo. */
    this.labels = [...def.labels];
  }

  /**
   * Resuelve un sufijo de acorde (o alias como "ø7", "M7", "-") a su ChordQuality canónica.
   * @param {string} [rawSuffix=''] Sufijo en cifrado americano.
   * @returns {ChordQuality} Instancia de ChordQuality.
   */
  static fromSymbol(rawSuffix = '') {
    const clean = String(rawSuffix || '').trim();
    const canonical = QUALITY_ALIASES[clean] !== undefined ? QUALITY_ALIASES[clean] : clean;
    const def = CHORD_QUALITY_CATALOG[canonical] || CHORD_QUALITY_CATALOG[''];
    return new ChordQuality(def);
  }

  /**
   * Devuelve todas las calidades disponibles ordenadas para la biblioteca de acordes.
   * @returns {ChordQuality[]} Lista completa de calidades.
   */
  static listAll() {
    return Object.values(CHORD_QUALITY_CATALOG).map((d) => new ChordQuality(d));
  }
}
