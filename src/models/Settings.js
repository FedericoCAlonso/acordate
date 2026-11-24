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
  defaultInstrument: 'guitarra',
  listeningRegister: 'real',
  wakeLockEnabled: true,
  showFingerings: true,
  showLeftHand: true,
  showRightHand: true,
  showChordsOnScore: true,
  showOtherAnnotations: true,
  showBassFunctions: true,
  metronomeSound: 'woodblock',
  countInMeasures: 1,
  audioVisualOffsetMs: 0
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
    /** Instrumento seleccionado en la ruta de prácticas (recordado entre sesiones). */
    this.defaultInstrument = ['guitarra-clasica', 'guitarra', 'bajo', 'piano'].includes(data.defaultInstrument)
      ? data.defaultInstrument
      : DEFAULT_SETTINGS.defaultInstrument;
    /** Registro de escucha del sintetizador: 'real' (por defecto) o '+1oct' (útil para parlantes chicos en bajo). */
    this.listeningRegister = ['real', '+1oct'].includes(data.listeningRegister)
      ? data.listeningRegister
      : DEFAULT_SETTINGS.listeningRegister;
    /** Indica si se intenta mantener la pantalla encendida durante la práctica (Wake Lock). */
    this.wakeLockEnabled = data.wakeLockEnabled !== undefined ? Boolean(data.wakeLockEnabled) : DEFAULT_SETTINGS.wakeLockEnabled;
    /** Mostrar digitaciones anotadas (compatibilidad global izquierda + derecha). */
    const baseFingerings = data.showFingerings !== undefined ? Boolean(data.showFingerings) : DEFAULT_SETTINGS.showFingerings;
    /** Mostrar referencias de mano izquierda (dedos 0–4, cuerdas ①–⑥, posiciones romanas). */
    this.showLeftHand = data.showLeftHand !== undefined ? Boolean(data.showLeftHand) : baseFingerings;
    /** Mostrar referencias de mano derecha (p, i, m, a, c, rasgueo). */
    this.showRightHand = data.showRightHand !== undefined ? Boolean(data.showRightHand) : baseFingerings;
    /** Indicador combinado de digitaciones (true si al menos una mano está visible). */
    this.showFingerings = data.showFingerings !== undefined && data.showLeftHand === undefined && data.showRightHand === undefined
      ? baseFingerings
      : (this.showLeftHand || this.showRightHand);
    /** Mostrar cifrado de acordes sobre el pentagrama. */
    this.showChordsOnScore = data.showChordsOnScore !== undefined ? Boolean(data.showChordsOnScore) : DEFAULT_SETTINGS.showChordsOnScore;
    /** Mostrar otras anotaciones en partitura (grados romanos, indicaciones de texto). */
    this.showOtherAnnotations = data.showOtherAnnotations !== undefined ? Boolean(data.showOtherAnnotations) : DEFAULT_SETTINGS.showOtherAnnotations;
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
    /** Calibración manual de sincronización audio/visual en ms (-250 a +250; positivo retrasa el resaltado visual). */
    const rawOffset = Number(data.audioVisualOffsetMs);
    this.audioVisualOffsetMs = Number.isFinite(rawOffset)
      ? Math.max(-250, Math.min(250, Math.round(rawOffset)))
      : DEFAULT_SETTINGS.audioVisualOffsetMs;
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
      listeningRegister: this.listeningRegister,
      wakeLockEnabled: this.wakeLockEnabled,
      showFingerings: this.showFingerings,
      showLeftHand: this.showLeftHand,
      showRightHand: this.showRightHand,
      showChordsOnScore: this.showChordsOnScore,
      showOtherAnnotations: this.showOtherAnnotations,
      showBassFunctions: this.showBassFunctions,
      metronomeSound: this.metronomeSound,
      countInMeasures: this.countInMeasures,
      audioVisualOffsetMs: this.audioVisualOffsetMs
    };
  }
}
