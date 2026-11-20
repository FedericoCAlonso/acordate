import { Observable } from '../../core/Observable.js';

/**
 * Sub-ViewModel de la pestaña Entrenamiento de Oído Armónico (#/acordes/oido).
 * Gestiona dificultad progresiva (niveles 1–4), reproducción de preguntas y puntaje.
 */
export class ChordEarTrainerViewModel {
  /**
   * Construye el entrenador de oído armónico.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({ appVm, harmonyService, audioService }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Servicio puro de generación de preguntas armónicas de oído. */
    this._harmony = harmonyService;
    /** Sintetizador de audio. */
    this._audio = audioService;

    /** Dificultad de oído (1..4). */
    this.earLevel = new Observable(1);
    /** Pregunta actual de entrenamiento de oído. */
    this.earQuestion = new Observable(null);
    /** Respuesta elegida por el usuario (o null si aún no respondió). */
    this.earSelectedId = new Observable(null);
    /** Puntaje acumulado ({ correct, total }). */
    this.earScore = new Observable({ correct: 0, total: 0 });
  }

  /** Genera una nueva pregunta de oído para el nivel actual. */
  nextEarQuestion() {
    this.earSelectedId.set(null);
    this.earQuestion.set(this._harmony.createEarTrainingQuestion(this.earLevel.value), true);
  }

  /** Reproduce el audio de la pregunta actual. */
  playEarQuestion() {
    const q = this.earQuestion.value;
    if (!q) return;
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(q.playbackMidis, {
      stepMs: 780,
      mode: 'strum-down',
      instrument: 'nylon-guitar'
    });
  }

  /**
   * Evalúa la opción elegida por el usuario y actualiza el puntaje.
   * @param {string} optionId Identificador elegido.
   * @returns {boolean} True si fue correcta.
   */
  answerEarQuestion(optionId) {
    const q = this.earQuestion.value;
    if (!q || this.earSelectedId.value !== null) return false;
    this.earSelectedId.set(optionId);
    const isCorrect = optionId === q.correctId;
    const prev = this.earScore.value;
    this.earScore.set({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    });
    if (isCorrect) this._appVm.triggerHaptic(16);
    return isCorrect;
  }

  /** Contrato uniforme de ciclo de vida. */
  dispose() {
    // Sin suscripciones ni timers propios
  }
}
