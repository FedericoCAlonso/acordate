/**
 * Modelo de dominio puro que representa un nivel de dificultad del plan de estudio.
 */
export class Level {
  /**
   * Crea una instancia de nivel con sus metadatos pedagógicos y rango de BPM objetivo.
   * @param {object} data Datos del nivel.
   */
  constructor({ number, name, subtitle, targetBpmMin, targetBpmMax, description, minKeyPracticesToUnlock = 2 }) {
    /** Número identificador del nivel (1 a 5). */
    this.number = number;
    /** Nombre del nivel (ej. "Primeros pasos"). */
    this.name = name;
    /** Subtítulo con referencia de BPM objetivo. */
    this.subtitle = subtitle;
    /** BPM mínimo sugerido del nivel. */
    this.targetBpmMin = targetBpmMin;
    /** BPM máximo de referencia del nivel. */
    this.targetBpmMax = targetBpmMax;
    /** Descripción breve de los contenidos del nivel. */
    this.description = description;
    /** Cantidad mínima de prácticas clave al BPM objetivo para desbloquear el siguiente nivel. */
    this.minKeyPracticesToUnlock = minKeyPracticesToUnlock;
  }

  /**
   * Devuelve una etiqueta formateada del rango de BPM objetivo.
   * @returns {string} Texto con el rango de BPM.
   */
  get bpmRangeLabel() {
    return this.targetBpmMax ? `${this.targetBpmMin}–${this.targetBpmMax} BPM` : `${this.targetBpmMin}+ BPM`;
  }
}

/**
 * Catálogo oficial de los 5 niveles de dificultad ascendente.
 */
export const LEVELS = [
  new Level({
    number: 1,
    name: 'Primeros pasos',
    subtitle: 'Objetivo 60–80 BPM',
    targetBpmMin: 60,
    targetBpmMax: 80,
    description: 'Cuerdas al aire, primera posición, pulso estable, acordes abiertos básicos y raíces en bajo.',
    minKeyPracticesToUnlock: 2
  }),
  new Level({
    number: 2,
    name: 'Fundamentos',
    subtitle: 'Objetivo 80–100 BPM',
    targetBpmMin: 80,
    targetBpmMax: 100,
    description: 'Escalas mayores de una octava, pentatónica menor, corcheas, ligaduras, I–IV–V y raíz-quinta.',
    minKeyPracticesToUnlock: 2
  }),
  new Level({
    number: 3,
    name: 'Desarrollo',
    subtitle: 'Objetivo 100–120 BPM',
    targetBpmMin: 100,
    targetBpmMax: 120,
    description: 'Escalas en dos octavas, modos básicos, arpegios, cejilla, ii–V–I y estudios a dos voces.',
    minKeyPracticesToUnlock: 2
  }),
  new Level({
    number: 4,
    name: 'Intermedio / Jazz',
    subtitle: 'Objetivo 120–160 BPM',
    targetBpmMin: 120,
    targetBpmMax: 160,
    description: 'Walking bass sobre blues y ii–V–I, lead sheets con extensiones y arpegios p-i-m-a.',
    minKeyPracticesToUnlock: 2
  }),
  new Level({
    number: 5,
    name: 'Avanzado',
    subtitle: 'Objetivo 160+ BPM',
    targetBpmMin: 160,
    targetBpmMax: null,
    description: 'Rhythm changes, lectura a primera vista en distintas tonalidades y piezas polifónicas.',
    minKeyPracticesToUnlock: 2
  })
];

/**
 * Busca la definición de un nivel por su número.
 * @param {number} levelNumber Número del nivel (1 a 5).
 * @returns {Level} Instancia del nivel correspondiente.
 */
export function getLevelByNumber(levelNumber) {
  return LEVELS.find((lvl) => lvl.number === Number(levelNumber)) || LEVELS[0];
}
