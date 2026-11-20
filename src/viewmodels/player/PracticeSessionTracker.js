import { Observable } from '../../core/Observable.js';

/**
 * Sub-ViewModel responsable del seguimiento de sesión dentro del Reproductor:
 * contador de repeticiones, tiempo de estudio acumulado, entrenador de velocidad en bucle,
 * registro manual con acción "Deshacer" y sugerencia de subir BPM tras 3 vueltas limpias.
 */
export class PracticeSessionTracker {
  /**
   * Inicializa el tracker de sesión inyectando callbacks de estado del reproductor.
   * @param {object} deps Dependencias inyectadas.
   * @param {import('../AppViewModel.js').AppViewModel} deps.appVm ViewModel raíz.
   * @param {Function} deps.getPractice Función que retorna la práctica actual.
   * @param {Function} deps.getBpm Función que retorna el BPM actual.
   * @param {Function} deps.isPlayingFn Función que indica si el reproductor está corriendo.
   * @param {Function} deps.isLoopEnabledFn Función que indica si el bucle está activo.
   * @param {Function} deps.onSetTempo Callback para actualizar el tempo desde el entrenador de velocidad.
   */
  constructor({ appVm, getPractice, getBpm, isPlayingFn, isLoopEnabledFn, onSetTempo }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Lector de la práctica activa. */
    this._getPractice = getPractice;
    /** Lector del BPM actual. */
    this._getBpm = getBpm;
    /** Lector de estado de reproducción. */
    this._isPlaying = isPlayingFn;
    /** Lector de estado de bucle. */
    this._isLoopEnabled = isLoopEnabledFn;
    /** Callback para subir el tempo automáticamente o por sugerencia. */
    this._onSetTempo = onSetTempo;

    /** Repeticiones completadas durante la sesión actual. */
    this.sessionRepetitions = new Observable(0);
    /** Modo entrenador de velocidad integrado al bucle del reproductor. */
    this.speedTrainerEnabled = new Observable(false);
    /** Cantidad de vueltas de bucle antes de subir el tempo automáticamente. */
    this.speedTrainerEveryLoops = new Observable(2);

    /** Vueltas limpias consecutivas al BPM actual. */
    this._cleanRepsAtCurrentBpm = 0;
    /** Marca de inicio del tramo de reproducción en curso. */
    this._playStartedAtMs = null;
    /** Segundos acumulados aún no volcados al progreso. */
    this._pendingStudySeconds = 0;
  }

  /**
   * Reinicia los contadores de sesión al cargar una nueva práctica.
   */
  resetForPractice() {
    this.sessionRepetitions.set(0);
    this._cleanRepsAtCurrentBpm = 0;
    this._pendingStudySeconds = 0;
    this._playStartedAtMs = null;
  }

  /**
   * Reinicia el conteo de vueltas limpias cuando cambia el tempo.
   */
  onTempoChanged() {
    this._cleanRepsAtCurrentBpm = 0;
  }

  /**
   * Marca el instante de inicio de reproducción para medir tiempo real de estudio.
   */
  markPlayStarted() {
    this._playStartedAtMs = Date.now();
  }

  /**
   * Configura el entrenador automático de velocidad integrado al bucle.
   * @param {{ enabled?: boolean, everyLoops?: number }} cfg Parámetros.
   */
  setSpeedTrainer(cfg = {}) {
    if (cfg.enabled !== undefined) this.speedTrainerEnabled.set(Boolean(cfg.enabled));
    if (cfg.everyLoops !== undefined) {
      this.speedTrainerEveryLoops.set(Math.max(1, Math.min(16, Number(cfg.everyLoops))));
    }
  }

  /**
   * Acumula los segundos transcurridos desde que comenzó el tramo actual de reproducción.
   */
  accumulateElapsedTime() {
    if (this._playStartedAtMs !== null) {
      const elapsed = Math.floor((Date.now() - this._playStartedAtMs) / 1000);
      if (elapsed > 0) this._pendingStudySeconds += elapsed;
      this._playStartedAtMs = this._isPlaying() ? Date.now() : null;
    }
  }

  /**
   * Persiste el tiempo de estudio pendiente al detener si hubo al menos 5 segundos de práctica.
   */
  flushStudyTime() {
    const pr = this._getPractice();
    if (!pr || this._pendingStudySeconds < 5) {
      this._pendingStudySeconds = 0;
      return;
    }
    const secs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;
    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this._getBpm(),
      targetBpm: pr.tempo.target,
      repetitions: 0,
      studySeconds: secs
    });
  }

  /**
   * Maneja la finalización automática de una pasada o vuelta del bucle.
   */
  handlePassComplete() {
    const pr = this._getPractice();
    if (!pr) return;

    this.accumulateElapsedTime();
    const nextReps = this.sessionRepetitions.value + 1;
    this.sessionRepetitions.set(nextReps);

    const studySecs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;
    const currentBpm = this._getBpm();

    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: currentBpm,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: studySecs
    });

    if (
      this._isLoopEnabled() &&
      this.speedTrainerEnabled.value &&
      nextReps % this.speedTrainerEveryLoops.value === 0 &&
      currentBpm < pr.tempo.target
    ) {
      const nextBpm = Math.min(pr.tempo.target, currentBpm + (pr.tempo.step || 5));
      this._onSetTempo(nextBpm);
      this._appVm.triggerHaptic(16);
      this._appVm.showSnackbar(`Entrenador de velocidad: subiendo a ${nextBpm} BPM`);
    }
  }

  /**
   * Registra una vuelta manual con snackbar, opción "Deshacer", respuesta háptica
   * y sugerencia de subir BPM tras 3 vueltas limpias.
   * @returns {Promise<void>}
   */
  async logManualRepetition() {
    const pr = this._getPractice();
    if (!pr) return;
    const currentBpm = this._getBpm();
    const prevSessionReps = this.sessionRepetitions.value;
    this.sessionRepetitions.set(prevSessionReps + 1);
    this._cleanRepsAtCurrentBpm += 1;

    const prevProgressSnapshot = await this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: currentBpm,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: Math.max(15, this._pendingStudySeconds)
    });
    this._pendingStudySeconds = 0;

    const reached = currentBpm >= pr.tempo.target;
    this._appVm.triggerHaptic(reached ? [20, 40, 30] : 16);

    if (!reached && this._cleanRepsAtCurrentBpm >= 3) {
      const suggestedBpm = Math.min(pr.tempo.target, currentBpm + (pr.tempo.step || 5));
      this._cleanRepsAtCurrentBpm = 0;
      this._appVm.showSnackbar(`¡3 vueltas limpias a ${currentBpm} BPM! ¿Subimos a ${suggestedBpm} BPM?`, {
        actionLabel: `Subir a ${suggestedBpm}`,
        durationMs: 5500,
        onAction: () => this._onSetTempo(suggestedBpm)
      });
      return;
    }

    this._appVm.showSnackbar(
      reached
        ? `¡Objetivo alcanzado a ${currentBpm} BPM!`
        : `Vuelta registrada a ${currentBpm} BPM.`,
      {
        actionLabel: 'Deshacer',
        durationMs: 4800,
        onAction: async () => {
          this.sessionRepetitions.set(prevSessionReps);
          this._cleanRepsAtCurrentBpm = Math.max(0, this._cleanRepsAtCurrentBpm - 1);
          await this._appVm.replaceProgress(prevProgressSnapshot);
          this._appVm.showSnackbar('Registro deshecho.');
        }
      }
    );
  }

  /**
   * Libera estado temporal del tracker.
   */
  dispose() {
    this._playStartedAtMs = null;
    this._pendingStudySeconds = 0;
  }
}
