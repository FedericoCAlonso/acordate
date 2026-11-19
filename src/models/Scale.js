/**
 * Definiciones de escalas, modos y arpegios con sus intervalos en semitonos desde la raíz.
 */
export const SCALE_DEFINITIONS = {
  mayor: { name: 'Escala mayor (Jónica)', intervals: [0, 2, 4, 5, 7, 9, 11], kind: 'scale' },
  'menor-natural': { name: 'Menor natural (Eólica)', intervals: [0, 2, 3, 5, 7, 8, 10], kind: 'scale' },
  'menor-armonica': { name: 'Menor armónica', intervals: [0, 2, 3, 5, 7, 8, 11], kind: 'scale' },
  'menor-melodica': { name: 'Menor melódica', intervals: [0, 2, 3, 5, 7, 9, 11], kind: 'scale' },
  'pentatonica-mayor': { name: 'Pentatónica mayor', intervals: [0, 2, 4, 7, 9], kind: 'scale' },
  'pentatonica-menor': { name: 'Pentatónica menor', intervals: [0, 3, 5, 7, 10], kind: 'scale' },
  blues: { name: 'Escala de blues', intervals: [0, 3, 5, 6, 7, 10], kind: 'scale' },
  dorico: { name: 'Modo Dórico', intervals: [0, 2, 3, 5, 7, 9, 10], kind: 'mode' },
  frigio: { name: 'Modo Frigio', intervals: [0, 1, 3, 5, 7, 8, 10], kind: 'mode' },
  lidio: { name: 'Modo Lidio', intervals: [0, 2, 4, 6, 7, 9, 11], kind: 'mode' },
  mixolidio: { name: 'Modo Mixolidio', intervals: [0, 2, 4, 5, 7, 9, 10], kind: 'mode' },
  locrio: { name: 'Modo Locrio', intervals: [0, 1, 3, 5, 6, 8, 10], kind: 'mode' },
  'triada-mayor': { name: 'Arpegio tríada mayor', intervals: [0, 4, 7], kind: 'arpeggio' },
  'triada-menor': { name: 'Arpegio tríada menor', intervals: [0, 3, 7], kind: 'arpeggio' },
  'triada-disminuida': { name: 'Arpegio tríada disminuida', intervals: [0, 3, 6], kind: 'arpeggio' },
  'triada-aumentada': { name: 'Arpegio tríada aumentada', intervals: [0, 4, 8], kind: 'arpeggio' },
  maj7: { name: 'Arpegio Maj7', intervals: [0, 4, 7, 11], kind: 'arpeggio' },
  m7: { name: 'Arpegio m7', intervals: [0, 3, 7, 10], kind: 'arpeggio' },
  dom7: { name: 'Arpegio dominante 7', intervals: [0, 4, 7, 10], kind: 'arpeggio' },
  m7b5: { name: 'Arpegio semidisminuido (m7b5)', intervals: [0, 3, 6, 10], kind: 'arpeggio' },
  dim7: { name: 'Arpegio disminuido 7', intervals: [0, 3, 6, 9], kind: 'arpeggio' }
};

/**
 * Modelo de dominio puro que representa una escala o arpegio configurado para estudio.
 */
export class Scale {
  /**
   * Construye una instancia de Scale a partir de su tonalidad y tipo.
   * @param {{ key: string, type: string, octaves?: number, direction?: 'asc'|'desc'|'asc-desc' }} params Parámetros de la escala.
   */
  constructor({ key = 'C', type = 'mayor', octaves = 1, direction = 'asc-desc' }) {
    const definition = SCALE_DEFINITIONS[type] || SCALE_DEFINITIONS.mayor;
    /** Tonalidad raíz de la escala. */
    this.key = key;
    /** Clave de tipo de escala o arpegio. */
    this.type = SCALE_DEFINITIONS[type] ? type : 'mayor';
    /** Nombre legible en español. */
    this.name = definition.name;
    /** Lista de intervalos en semitonos respecto a la tónica. */
    this.intervals = [...definition.intervals];
    /** Tipo estructural: escala, modo o arpegio. */
    this.kind = definition.kind;
    /** Cantidad de octavas (1 o 2). */
    this.octaves = Math.max(1, Math.min(2, Number(octaves) || 1));
    /** Dirección del recorrido: ascendente, descendente o ida y vuelta. */
    this.direction = direction;
  }
}
