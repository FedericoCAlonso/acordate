import { Observable } from '../../core/Observable.js';

/**
 * Sub-ViewModel del Entrenador de Oído Modal en enfoque paralelo (#/escalas/oido).
 * Gestiona niveles 1–4, generación de preguntas sobre la raíz compartida, reproducción con drone y puntaje.
 */
export class ScaleEarTrainerViewModel {
  /**
   * Construye el entrenador de oído modal.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({ appVm, scaleCatalogService, audioService, selectedRoot, isPlayingSequence }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Servicio puro del catálogo de escalas. */
    this._scales = scaleCatalogService;
    /** Sintetizador Web Audio. */
    this._audio = audioService;
    /** Observable compartido de raíz activa. */
    this._selectedRoot = selectedRoot;
    /** Observable compartido de estado de reproducción de secuencias. */
    this._isPlayingSequence = isPlayingSequence;

    /** Nivel de dificultad de oído modal (1..4). */
    this.earLevel = new Observable(1);
    /** Pregunta activa del entrenador de oído modal. */
    this.earQuestion = new Observable(null);
    /** ID de escala elegida por el usuario en la pregunta actual (o null). */
    this.earSelectedId = new Observable(null);
    /** Puntaje acumulado de la sesión de oído modal. */
    this.earScore = new Observable({ correct: 0, total: 0 });
  }

  /** Cambia el nivel del entrenador de oído modal y genera una pregunta nueva. */
  setEarLevel(level) {
    this.earLevel.set(Math.max(1, Math.min(4, Number(level) || 1)));
    this.nextEarQuestion();
  }

  /** Genera una nueva pregunta de oído modal en paralelo sobre la raíz seleccionada. */
  nextEarQuestion() {
    const q = this._scales.generateScaleEarQuestion(this.earLevel.value, this._selectedRoot.value);
    this.earQuestion.set(q);
    this.earSelectedId.set(null);
  }

  /** Reproduce la pregunta actual de oído modal con su pedal armónico. */
  playEarQuestion() {
    const q = this.earQuestion.value;
    if (!q) return;
    this._isPlayingSequence.set(true);
    this._audio.playScaleSequence(q.midis, {
      bpm: 100,
      instrument: 'nylon-guitar',
      useDrone: true,
      droneMidis: q.droneMidis,
      onEnd: () => this._isPlayingSequence.set(false)
    });
  }

  /** Evalúa la respuesta elegida por el estudiante y actualiza el puntaje. */
  answerEarQuestion(scaleId) {
    const q = this.earQuestion.value;
    if (!q || this.earSelectedId.value) return;
    this.earSelectedId.set(scaleId);
    const isCorrect = scaleId === q.answerScale.id;
    const prev = this.earScore.value;
    this.earScore.set({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    });
    this._appVm.triggerHaptic(isCorrect ? 15 : [20, 40, 20]);
  }

  /** Contrato uniforme de ciclo de vida. */
  dispose() {
    // Sin suscripciones ni timers propios
  }
}
