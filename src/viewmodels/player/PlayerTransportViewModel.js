import { Observable } from '../../core/Observable.js';

/**
 * Sub-ViewModel de transporte, bucle, conteo previo y sincronización visual del Reproductor.
 * Encapsula la interacción directa con `AudioSynthService` y `WakeLockService` sin mezclar
 * digitaciones ni mezcla de volúmenes.
 */
export class PlayerTransportViewModel {
  /**
   * Construye el controlador de transporte del reproductor.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({ appVm, audioService, wakeLockService, sessionTracker, getPractice, onSyncConfig, onPassCompleteHook = null }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Servicio de síntesis Web Audio. */
    this._audio = audioService;
    /** Servicio de bloqueo de pantalla. */
    this._wakeLock = wakeLockService;
    /** Sub-ViewModel de seguimiento de tiempo y repeticiones. */
    this._tracker = sessionTracker;
    /** Lector de la práctica activa. */
    this._getPractice = getPractice;
    /** Callback para empujar la configuración completa hacia `_audio`. */
    this._onSyncConfig = onSyncConfig;
    /** Hook opcional ejecutado al completar cada vuelta/coro (ej. regenerar variación de coro). */
    this._onPassCompleteHook = onPassCompleteHook;

    /** Estado de reproducción en curso. */
    this.isPlaying = new Observable(false);
    /** Estado de pausa a mitad de reproducción. */
    this.isPaused = new Observable(false);
    /** Estado del conteo previo (null o { beat, countDown, totalBeats }). */
    this.countInStatus = new Observable(null);
    /** Compás actualmente sonando (1-based, 0 si está detenido). */
    this.activeMeasure = new Observable(0);
    /** Índice del paso armónico actualmente sonando (-1 si detenido). */
    this.activeChordStepIndex = new Observable(-1);
    /** Último evento de nota visual (primera voz activa). */
    this.activeNoteEvent = new Observable(null);
    /** Lista simultánea de eventos de nota activos en todas las voces del pulso actual. */
    this.activeNoteEvents = new Observable([]);
    /** Evento en vivo del acorde/coloración que está tocando el motor orgánico/vivo (null si detenido o fijo). */
    this.liveCompingEvent = new Observable(null);

    /** Bucle activado. */
    this.loopEnabled = new Observable(false);
    /** Compás inicial del bucle (1-based). */
    this.loopStartMeasure = new Observable(1);
    /** Compás final del bucle (1-based). */
    this.loopEndMeasure = new Observable(4);
    /** Compases de conteo previo (0, 1 o 2). */
    this.countInMeasures = new Observable(appVm.settings.value.countInMeasures ?? 1);
    /** Cantidad de compases detectados en la práctica activa. */
    this.measureCount = new Observable(4);

    /** Callbacks ligados a esta instancia para re-vincular y limpiar de forma segura. */
    this._onVisual = (ev) => this._handleVisualEvent(ev);
    this._onPass = () => {
      this._tracker.handlePassComplete();
      if (typeof this._onPassCompleteHook === 'function') this._onPassCompleteHook();
    };
    this._onEnd = () => this._handlePlaybackEnd();
    this.bindAudioCallbacks();
  }

  /** Registra los callbacks de esta instancia en `AudioSynthService`. */
  bindAudioCallbacks() {
    this._audio.onVisualEvent = this._onVisual;
    this._audio.onPassComplete = this._onPass;
    this._audio.onPlaybackEnd = this._onEnd;
  }

  /** Devuelve el bloque de configuración de bucle y conteo para `AudioSynthService.configure`. */
  getAudioConfigPatch() {
    return {
      countInMeasures: this.countInMeasures.value,
      loopEnabled: this.loopEnabled.value,
      loopStartMeasure: this.loopStartMeasure.value,
      loopEndMeasure: this.loopEndMeasure.value
    };
  }

  /** Restablece el rango de compases y desactiva el bucle al cargar una práctica. */
  resetForMeasures(totalMeasures) {
    const safe = Math.max(1, Number(totalMeasures) || 4);
    this.measureCount.set(safe);
    this.loopEnabled.set(false);
    this.loopStartMeasure.set(1);
    this.loopEndMeasure.set(safe);
    this.activeChordStepIndex.set(-1);
    this.liveCompingEvent.set(null);
  }

  /** Inicia o reanuda la reproducción solicitando Wake Lock. */
  play() {
    if (!this._getPractice()) return;
    this.bindAudioCallbacks();
    this._onSyncConfig();
    this._audio.play();
    this.isPlaying.set(true);
    this.isPaused.set(false);
    this._tracker.markPlayStarted();
    this._wakeLock.request();
  }

  /** Pausa la reproducción acumulando tiempo practicado. */
  pause() {
    if (!this.isPlaying.value) return;
    this._tracker.accumulateElapsedTime();
    this._audio.pause();
    this.isPlaying.set(false);
    this.isPaused.set(true);
    this._wakeLock.release();
  }

  /** Detiene la reproducción, guarda tiempo pendiente y limpia el estado visual. */
  stop() {
    this._tracker.accumulateElapsedTime();
    this._tracker.flushStudyTime();
    this._audio.stop();
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.countInStatus.set(null);
    this.activeMeasure.set(0);
    this.activeChordStepIndex.set(-1);
    this.activeNoteEvent.set(null);
    this.activeNoteEvents.set([]);
    this.liveCompingEvent.set(null);
    this._wakeLock.release();
  }

  /** Alterna entre reproducir y pausar. */
  togglePlay() {
    if (this.isPlaying.value) this.pause();
    else this.play();
  }

  /** Configura el bucle por rango de compases. */
  setLoop(cfg = {}) {
    const maxM = Math.max(1, this.measureCount.value);
    if (cfg.enabled !== undefined) this.loopEnabled.set(Boolean(cfg.enabled));
    if (cfg.start !== undefined) {
      const s = Math.max(1, Math.min(maxM, Number(cfg.start) || 1));
      this.loopStartMeasure.set(s);
      if (this.loopEndMeasure.value < s) this.loopEndMeasure.set(s);
    }
    if (cfg.end !== undefined) {
      const e = Math.max(this.loopStartMeasure.value, Math.min(maxM, Number(cfg.end) || maxM));
      this.loopEndMeasure.set(e);
    }
    this._onSyncConfig();
  }

  /** Configura compases de conteo previo (0, 1 o 2). */
  setCountIn(measures) {
    this.countInMeasures.set(Math.max(0, Math.min(2, Number(measures) || 0)));
    this._onSyncConfig();
  }

  /** Procesa eventos visuales de conteo, compás, acorde y notas simultáneas. */
  _handleVisualEvent(ev) {
    if (ev.isCountIn) {
      this.countInStatus.set(
        { beat: ev.countInBeat, countDown: ev.countDown ?? ev.countInBeat, totalBeats: ev.totalBeats },
        true
      );
      return;
    }
    this.countInStatus.set(null);
    if (ev.measureIndex) this.activeMeasure.set(ev.measureIndex);
    if (ev.chordStepIndex !== undefined) this.activeChordStepIndex.set(ev.chordStepIndex);
    if (ev.isCompingHit && ev.liveComping) {
      this.liveCompingEvent.set({ ...ev.liveComping, seq: Date.now() }, true);
      return;
    }
    if (Array.isArray(ev.activeNotes)) {
      this.activeNoteEvents.set(ev.activeNotes, true);
      this.activeNoteEvent.set(ev.activeNotes[0] || null, true);
    } else if (ev.noteEvent) {
      this.activeNoteEvents.set([ev.noteEvent], true);
      this.activeNoteEvent.set(ev.noteEvent, true);
    }
  }

  /** Cierra limpiamente el estado visual y libera WakeLock al finalizar la reproducción. */
  _handlePlaybackEnd() {
    this._tracker.flushStudyTime();
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.countInStatus.set(null);
    this.activeNoteEvent.set(null);
    this.activeNoteEvents.set([]);
    this.liveCompingEvent.set(null);
    this._wakeLock.release();
  }

  /** Detiene transporte, libera callbacks propios sobre `_audio` y suelta WakeLock. */
  dispose() {
    this.stop();
    if (this._audio.onVisualEvent === this._onVisual) this._audio.onVisualEvent = null;
    if (this._audio.onPassComplete === this._onPass) this._audio.onPassComplete = null;
    if (this._audio.onPlaybackEnd === this._onEnd) this._audio.onPlaybackEnd = null;
    this._wakeLock.release();
  }
}
