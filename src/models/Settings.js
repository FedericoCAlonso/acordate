/**
 * Paleta sugerida de colores semilla para Material 3 Dynamic Color.
 */
export const SEED_COLOR_PRESETS = [
  { name: 'Índigo musical', hex: '#3F51B5' },
  { name: 'Terracota madera', hex: '#B5533C' },
  { name: 'Verde pino', hex: '#2E6F5E' },
  { name: 'Azul océano', hex: '#1B6B93' },
  { name: 'Violeta jazz', hex: '#6F42C1' },
  { name: 'Ámbar acústico', hex: '#A46418' }
];

/**
 * Valores por defecto de los ajustes de la aplicación.
 */
export const DEFAULT_SETTINGS = {
  theme: 'auto',
  seedColor: '#3F51B5',
  chordNotation: 'americano',
  defaultInstrument: 'todos',
  wakeLockEnabled: true,
  showFingerings: true,
  showBassFunctions: true,
  metronomeSound: 'woodblock',
  countInMeasures: 1
};

/**
 * Modelo de dominio puro que representa las preferencias persistentes del usuario.
 */
export class Settings {
  /**
   * Crea una instancia de ajustes validando y aplicando valores por defecto.
   * @param {object} [data={}] Ajustes cargados desde almacenamiento.
   */
  constructor(data = {}) {
    /** Modo de tema visual: 'auto', 'light' o 'dark'. */
    this.theme = ['auto', 'light', 'dark'].includes(data.theme) ? data.theme : DEFAULT_SETTINGS.theme;
    /** Color semilla hexadecimal para generar la paleta Material 3. */
    this.seedColor = /^#[0-9A-Fa-f]{6}$/.test(data.seedColor || '') ? data.seedColor : DEFAULT_SETTINGS.seedColor;
    /** Sistema de cifrado de acordes: 'americano' (C, Dm7) o 'latino' (Do, Rem7). */
    this.chordNotation = ['americano', 'latino'].includes(data.chordNotation)
      ? data.chordNotation
      : DEFAULT_SETTINGS.chordNotation;
    /** Filtro de instrumento inicial preferido en la lista de prácticas. */
    this.defaultInstrument = ['todos', 'guitarra-clasica', 'guitarra', 'bajo'].includes(data.defaultInstrument)
      ? data.defaultInstrument
      : DEFAULT_SETTINGS.defaultInstrument;
    /** Indica si se intenta mantener la pantalla encendida durante la práctica (Wake Lock). */
    this.wakeLockEnabled = data.wakeLockEnabled !== undefined ? Boolean(data.wakeLockEnabled) : DEFAULT_SETTINGS.wakeLockEnabled;
    /** Mostrar digitaciones anotadas sobre las notas. */
    this.showFingerings = data.showFingerings !== undefined ? Boolean(data.showFingerings) : DEFAULT_SETTINGS.showFingerings;
    /** Mostrar funciones armónicas (R, 3, 5, 7, Crom) en prácticas de bajo. */
    this.showBassFunctions = data.showBassFunctions !== undefined ? Boolean(data.showBassFunctions) : DEFAULT_SETTINGS.showBassFunctions;
    /** Sonido predeterminado del metrónomo. */
    this.metronomeSound = ['woodblock', 'click', 'rimshot', 'beep'].includes(data.metronomeSound)
      ? data.metronomeSound
      : DEFAULT_SETTINGS.metronomeSound;
    /** Cantidad de compases de conteo previo por defecto (0, 1 o 2). */
    this.countInMeasures = [0, 1, 2].includes(Number(data.countInMeasures))
      ? Number(data.countInMeasures)
      : DEFAULT_SETTINGS.countInMeasures;
  }

  /**
   * Devuelve una copia nueva con los campos actualizados sin mutar la instancia actual.
   * @param {Partial<Settings>} patch Campos a modificar.
   * @returns {Settings} Nueva instancia actualizada.
   */
  withPatch(patch) {
    return new Settings({ ...this.toJSON(), ...patch });
  }

  /**
   * Serializa los ajustes a objeto JSON plano.
   * @returns {object} Objeto serializable.
   */
  toJSON() {
    return {
      theme: this.theme,
      seedColor: this.seedColor,
      chordNotation: this.chordNotation,
      defaultInstrument: this.defaultInstrument,
      wakeLockEnabled: this.wakeLockEnabled,
      showFingerings: this.showFingerings,
      showBassFunctions: this.showBassFunctions,
      metronomeSound: this.metronomeSound,
      countInMeasures: this.countInMeasures
    };
  }
}
