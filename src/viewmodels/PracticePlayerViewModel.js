import { ComputedObservable, Observable } from '../core/Observable.js';
import { NOTE_TO_PC, pcToNoteName, prefersFlats, transposeAbc, transposeChordSymbol } from '../core/MusicTheory.js';
import { Exercise } from '../models/Exercise.js';

/**
 * ViewModel del reproductor de prácticas.
 * Coordina transposición, modos de notación (Pentagrama / Cifrado / Mixto), síntesis multi-voz,
 * bucle por rango de compases, conteo previo, entrenador de velocidad y registro de progreso.
 */
export class PracticePlayerViewModel {
  /**
   * Inicializa el reproductor inyectando los servicios y el AppViewModel.
   * @param {object} deps Dependencias inyectadas manualmente.
   * @param {import('./AppViewModel.js').AppViewModel} deps.appVm ViewModel raíz.
   * @param {import('../services/AudioSynthService.js').AudioSynthService} deps.audioService Sintetizador offline.
   * @param {import('../services/AbcService.js').AbcService} deps.abcService Servicio de partitura abcjs.
   * @param {import('../services/WakeLockService.js').WakeLockService} deps.wakeLockService Wake Lock API.
   */
  constructor({ appVm, audioService, abcService, wakeLockService }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Servicio de reproducción Web Audio multi-voz. */
    this._audio = audioService;
    /** Servicio de análisis y preparación ABC. */
    this._abc = abcService;
    /** Servicio de bloqueo de pantalla durante el estudio. */
    this._wakeLock = wakeLockService;

    /** Práctica activa cargada actualmente. */
    this.practice = new Observable(null);
    /** Tempo actual en BPM (40-240). */
    this.bpm = new Observable(80);
    /** Desplazamiento de transposición en semitonos (-6 a +6 o -11 a +11). */
    this.transposeSemitones = new Observable(0);
    /** Modo de vista de notación ('pentagrama' | 'cifrado' | 'mixto'). */
    this.viewMode = new Observable('mixto');
    /** Nivel de zoom de la partitura (0.75 a 1.6). */
    this.zoom = new Observable(1.0);

    /** Estado de reproducción en curso. */
    this.isPlaying = new Observable(false);
    /** Estado de pausa a mitad de reproducción. */
    this.isPaused = new Observable(false);
    /** Estado del conteo previo (null o { beat, totalBeats }). */
    this.countInStatus = new Observable(null);
    /** Compás actualmente sonando (1-based, 0 si está detenido). */
    this.activeMeasure = new Observable(0);
    /** Último evento de nota visual para resaltar el SVG correspondiente. */
    this.activeNoteEvent = new Observable(null);

    /** Bucle activado. */
    this.loopEnabled = new Observable(false);
    /** Compás inicial del bucle (1-based). */
    this.loopStartMeasure = new Observable(1);
    /** Compás final del bucle (1-based). */
    this.loopEndMeasure = new Observable(4);
    /** Compases de conteo previo (0, 1 o 2). */
    this.countInMeasures = new Observable(appVm.settings.value.countInMeasures ?? 1);

    /** Instrumento de síntesis seleccionado. */
    this.synthInstrument = new Observable('acoustic-guitar');
    /** Volumen de melodía / voz principal (0-1). */
    this.melodyVolume = new Observable(0.85);
    /** Acompañamiento de acordes activado/desactivado. */
    this.chordsEnabled = new Observable(true);
    /** Volumen del acompañamiento de acordes (0-1). */
    this.chordsVolume = new Observable(0.55);
    /** Volumen independiente de la voz de bajo (0-1). */
    this.bassVolume = new Observable(0.75);
    /** Metrónomo integrado activado durante la reproducción. */
    this.metronomeEnabled = new Observable(true);
    /** Volumen del metrónomo integrado (0-1). */
    this.metronomeVolume = new Observable(0.65);

    /** Mostrar digitaciones anotadas sobre las notas. */
    this.showFingerings = new Observable(appVm.settings.value.showFingerings ?? true);
    /** Mostrar funciones armónicas en bajo (R, 3, 5, 7, Crom). */
    this.showBassFunctions = new Observable(appVm.settings.value.showBassFunctions ?? true);

    /** Modo entrenador de velocidad integrado al bucle del reproductor. */
    this.speedTrainerEnabled = new Observable(false);
    /** Cantidad de vueltas de bucle antes de subir el tempo automáticamente. */
    this.speedTrainerEveryLoops = new Observable(2);

    /** Repeticiones completadas durante la sesión actual. */
    this.sessionRepetitions = new Observable(0);
    /** Cantidad de compases detectados en la práctica activa. */
    this.measureCount = new Observable(4);

    /** Marca de inicio de reproducción actual para contabilizar tiempo de estudio. */
    this._playStartedAtMs = null;
    /** Segundos acumulados sin guardar en la sesión en curso. */
    this._pendingStudySeconds = 0;

    /** ABC resultante luego de aplicar la transposición en semitonos (mantiene cifrado americano). */
    this.transposedAbc = new ComputedObservable(
      [this.practice, this.transposeSemitones],
      () => {
        const pr = this.practice.value;
        if (!pr) return '';
        return transposeAbc(pr.abc, this.transposeSemitones.value);
      }
    );

    /** Tonalidad visible luego de la transposición. */
    this.transposedKey = new ComputedObservable(
      [this.practice, this.transposeSemitones],
      () => {
        const pr = this.practice.value;
        if (!pr) return 'C';
        const semi = this.transposeSemitones.value;
        if (!semi) return pr.key;
        const match = pr.key.match(/^([A-G][#b]?)(.*)$/);
        if (!match || NOTE_TO_PC[match[1]] === undefined) return pr.key;
        const newPc = (NOTE_TO_PC[match[1]] + semi + 120) % 12;
        const flatCand = pcToNoteName(newPc, true) + match[2];
        const useFlats = prefersFlats(flatCand);
        return transposeChordSymbol(pr.key, semi, useFlats);
      }
    );

    /** Modelo Exercise parseado a partir del ABC transpuesto (para la vista de Cifrado y conteo de compases). */
    this.exercise = new ComputedObservable(
      [this.practice, this.transposedAbc],
      () => {
        const pr = this.practice.value;
        if (!pr) return null;
        return new Exercise({
          practiceId: pr.id,
          abc: this.transposedAbc.value,
          key: this.transposedKey.value,
          timeSignature: pr.timeSignature
        });
      }
    );

    /** ABC preparado finalmente para renderizar con abcjs (modo de vista, cifrado latino/americano, digitaciones). */
    this.renderableAbc = new ComputedObservable(
      [
        this.practice,
        this.transposedAbc,
        this.viewMode,
        this.showFingerings,
        this.showBassFunctions,
        this._appVm.settings
      ],
      () => {
        const pr = this.practice.value;
        if (!pr) return '';
        return this._abc.prepareAbcForRender(this.transposedAbc.value, {
          viewMode: this.viewMode.value,
          chordNotation: this._appVm.settings.value.chordNotation,
          showFingerings: this.showFingerings.value,
          fingerings: pr.fingerings,
          showBassFunctions: this.showBassFunctions.value,
          isBass: pr.instruments.includes('bajo')
        });
      }
    );

    /** Estadísticas guardadas de la práctica activa en el progreso global. */
    this.practiceStats = new ComputedObservable(
      [this.practice, this._appVm.progress],
      () => {
        const pr = this.practice.value;
        if (!pr) return null;
        return this._appVm.progress.value.getPracticeStats(pr.id);
      }
    );

    // Vincula eventos del motor de audio
    this._audio.onVisualEvent = (ev) => {
      if (ev.isCountIn) {
        this.countInStatus.set({ beat: ev.countInBeat, totalBeats: ev.totalBeats }, true);
        return;
      }
      this.countInStatus.set(null);
      if (ev.measureIndex) this.activeMeasure.set(ev.measureIndex);
      if (ev.noteEvent) this.activeNoteEvent.set(ev.noteEvent, true);
    };

    this._audio.onPassComplete = () => {
      this._handlePassComplete();
    };

    this._audio.onPlaybackEnd = () => {
      this._flushStudyTime();
      this.isPlaying.set(false);
      this.isPaused.set(false);
      this.countInStatus.set(null);
      this.activeNoteEvent.set(null);
      this._wakeLock.release();
    };

    // Actualiza preferencias por defecto cuando cambian los ajustes globales
    appVm.settings.subscribe((s) => {
      this.showFingerings.set(s.showFingerings);
      this.showBassFunctions.set(s.showBassFunctions);
      this.countInMeasures.set(s.countInMeasures);
    });
  }

  /**
   * Carga una práctica en el reproductor, reiniciando el estado de transporte y adaptando tempo e instrumento.
   * @param {import('../models/Practice.js').Practice|null} practice Práctica a cargar.
   */
  loadPractice(practice) {
    this.stop();
    this.practice.set(practice || null);
    this.transposeSemitones.set(0);
    this.sessionRepetitions.set(0);
    this._pendingStudySeconds = 0;

    if (!practice) return;

    this.bpm.set(practice.tempo.start);
    this.synthInstrument.set(practice.getDefaultSynthInstrument());

    const ex = this.exercise.value;
    const totalMeasures = Math.max(1, ex?.measureCount || 4);
    this.measureCount.set(totalMeasures);
    this.loopEnabled.set(false);
    this.loopStartMeasure.set(1);
    this.loopEndMeasure.set(totalMeasures);

    // Precarga una línea de tiempo base (será enriquecida con elementos SVG al renderizar)
    const fallbackTimeline = this._abc.extractTimeline(null, this.transposedAbc.value, {
      isBass: practice.instruments.includes('bajo'),
      timeSignature: practice.timeSignature
    });
    this._audio.loadTimeline(fallbackTimeline);
    this._syncAudioConfig();
  }

  /**
   * Registra la línea de tiempo extraída luego del renderizado de abcjs (con vínculos a nodos SVG).
   * @param {object} timeline Línea de tiempo devuelta por AbcService.extractTimeline.
   */
  registerVisualTimeline(timeline) {
    if (!timeline) return;
    this.measureCount.set(timeline.measureCount);
    if (this.loopEndMeasure.value > timeline.measureCount) {
      this.loopEndMeasure.set(timeline.measureCount);
    }
    this._audio.loadTimeline(timeline);
  }

  /**
   * Sincroniza la configuración actual del ViewModel hacia el servicio de audio.
   */
  _syncAudioConfig() {
    this._audio.configure({
      bpm: this.bpm.value,
      instrument: this.synthInstrument.value,
      melodyVolume: this.melodyVolume.value,
      chordsEnabled: this.chordsEnabled.value,
      chordsVolume: this.chordsVolume.value,
      bassVolume: this.bassVolume.value,
      metronomeEnabled: this.metronomeEnabled.value,
      metronomeVolume: this.metronomeVolume.value,
      countInMeasures: this.countInMeasures.value,
      loopEnabled: this.loopEnabled.value,
      loopStartMeasure: this.loopStartMeasure.value,
      loopEndMeasure: this.loopEndMeasure.value
    });
  }

  /**
   * Inicia o reanuda la reproducción y activa el bloqueo de pantalla (Wake Lock).
   */
  play() {
    if (!this.practice.value) return;
    this._syncAudioConfig();
    this._audio.play();
    this.isPlaying.set(true);
    this.isPaused.set(false);
    this._playStartedAtMs = Date.now();
    this._wakeLock.request();
  }

  /**
   * Pausa la reproducción acumulando el tiempo practicado hasta el momento.
   */
  pause() {
    if (!this.isPlaying.value) return;
    this._accumulateElapsedTime();
    this._audio.pause();
    this.isPlaying.set(false);
    this.isPaused.set(true);
    this._wakeLock.release();
  }

  /**
   * Detiene la reproducción, guarda el progreso acumulado y limpia el resaltado activo.
   */
  stop() {
    this._accumulateElapsedTime();
    this._flushStudyTime();
    this._audio.stop();
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.countInStatus.set(null);
    this.activeMeasure.set(0);
    this.activeNoteEvent.set(null);
    this._wakeLock.release();
  }

  /**
   * Alterna entre reproducir y pausar.
   */
  togglePlay() {
    if (this.isPlaying.value) this.pause();
    else this.play();
  }

  /**
   * Cambia el tempo de reproducción (40-240 BPM) sin alterar la afinación.
   * @param {number} bpm Nuevo BPM.
   */
  setTempo(bpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(Number(bpm) || 80)));
    this.bpm.set(clamped);
    this._audio.configure({ bpm: clamped });
  }

  /**
   * Sube o baja el tempo actual en un incremento dado.
   * @param {number} delta Incremento en BPM.
   */
  stepTempo(delta) {
    this.setTempo(this.bpm.value + Number(delta));
  }

  /**
   * Transpone melodía y cifrado juntos una cantidad de semitonos respecto a la tonalidad original.
   * @param {number} semitones Cantidad de semitonos (-6 a +6 o -11 a +11).
   */
  transpose(semitones) {
    const wasPlaying = this.isPlaying.value;
    if (wasPlaying) this.stop();
    const clamped = Math.max(-11, Math.min(11, Math.round(Number(semitones) || 0)));
    this.transposeSemitones.set(clamped);
    const pr = this.practice.value;
    if (pr) {
      const tl = this._abc.extractTimeline(null, this.transposedAbc.value, {
        isBass: pr.instruments.includes('bajo'),
        timeSignature: pr.timeSignature
      });
      this._audio.loadTimeline(tl);
    }
  }

  /**
   * Restaura la tonalidad original de la práctica.
   */
  resetTranspose() {
    this.transpose(0);
  }

  /**
   * Cambia la vista de notación (Pentagrama, Cifrado o Mixto).
   * @param {'pentagrama'|'cifrado'|'mixto'} mode Vista seleccionada.
   */
  setViewMode(mode) {
    if (['pentagrama', 'cifrado', 'mixto'].includes(mode)) {
      this.viewMode.set(mode);
    }
  }

  /**
   * Ajusta el nivel de zoom de la partitura.
   * @param {number} nextZoom Factor de zoom (0.75 a 1.6).
   */
  setZoom(nextZoom) {
    const clamped = Math.max(0.75, Math.min(1.6, Math.round(Number(nextZoom) * 100) / 100));
    this.zoom.set(clamped);
  }

  /**
   * Configura el bucle por compás o rango de compases.
   * @param {{ enabled?: boolean, start?: number, end?: number }} cfg Configuración del bucle.
   */
  setLoop(cfg = {}) {
    const maxM = Math.max(1, this.measureCount.value);
    if (cfg.enabled !== undefined) this.loopEnabled.set(Boolean(cfg.enabled));
    if (cfg.start !== undefined) {
      const s = Math.max(1, Math.min(maxM, Number(cfg.start)));
      this.loopStartMeasure.set(s);
      if (this.loopEndMeasure.value < s) this.loopEndMeasure.set(s);
    }
    if (cfg.end !== undefined) {
      const e = Math.max(this.loopStartMeasure.value, Math.min(maxM, Number(cfg.end)));
      this.loopEndMeasure.set(e);
    }
    this._syncAudioConfig();
  }

  /**
   * Configura la cantidad de compases de conteo previo (0, 1 o 2).
   * @param {number} measures Cantidad de compases.
   */
  setCountIn(measures) {
    const safe = Math.max(0, Math.min(2, Number(measures)));
    this.countInMeasures.set(safe);
    this._syncAudioConfig();
  }

  /**
   * Selecciona el instrumento de síntesis (nylon, acústica, bajo eléctrico, bajo acústico).
   * @param {string} instrument Clave del instrumento.
   */
  setSynthInstrument(instrument) {
    this.synthInstrument.set(instrument);
    this._syncAudioConfig();
  }

  /**
   * Ajusta volúmenes independientes de melodía, acordes, bajo y metrónomo.
   * @param {{ melody?: number, chords?: number, bass?: number, metronome?: number }} volumes Mapa parcial de volúmenes.
   */
  setVolumes(volumes = {}) {
    if (volumes.melody !== undefined) this.melodyVolume.set(Number(volumes.melody));
    if (volumes.chords !== undefined) this.chordsVolume.set(Number(volumes.chords));
    if (volumes.bass !== undefined) this.bassVolume.set(Number(volumes.bass));
    if (volumes.metronome !== undefined) this.metronomeVolume.set(Number(volumes.metronome));
    this._syncAudioConfig();
  }

  /**
   * Activa o desactiva el acompañamiento reproducible de acordes.
   * @param {boolean} enabled Nuevo estado.
   */
  setChordsEnabled(enabled) {
    this.chordsEnabled.set(Boolean(enabled));
    this._syncAudioConfig();
  }

  /**
   * Activa o desactiva el metrónomo integrado durante la reproducción.
   * @param {boolean} enabled Nuevo estado.
   */
  setMetronomeEnabled(enabled) {
    this.metronomeEnabled.set(Boolean(enabled));
    this._syncAudioConfig();
  }

  /**
   * Alterna la visualización de digitaciones anotadas sobre la partitura.
   */
  toggleFingerings() {
    this.showFingerings.set(!this.showFingerings.value);
  }

  /**
   * Alterna la visualización de funciones armónicas en bajo (R, 3, 5, 7, Crom).
   */
  toggleBassFunctions() {
    this.showBassFunctions.set(!this.showBassFunctions.value);
  }

  /**
   * Configura el entrenador automático de velocidad integrado al bucle del reproductor.
   * @param {{ enabled?: boolean, everyLoops?: number }} cfg Parámetros.
   */
  setSpeedTrainer(cfg = {}) {
    if (cfg.enabled !== undefined) this.speedTrainerEnabled.set(Boolean(cfg.enabled));
    if (cfg.everyLoops !== undefined) this.speedTrainerEveryLoops.set(Math.max(1, Math.min(16, Number(cfg.everyLoops))));
  }

  /**
   * Registra manualmente el logro del BPM actual en el progreso (útil cuando se practica sin audio).
   * @returns {Promise<void>}
   */
  async logManualRepetition() {
    const pr = this.practice.value;
    if (!pr) return;
    this.sessionRepetitions.update((r) => r + 1);
    await this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: Math.max(15, this._pendingStudySeconds)
    });
    this._pendingStudySeconds = 0;
    const reached = this.bpm.value >= pr.tempo.target;
    this._appVm.showSnackbar(
      reached
        ? `¡Objetivo alcanzado a ${this.bpm.value} BPM! Progreso guardado.`
        : `Repetición registrada a ${this.bpm.value} BPM.`
    );
  }

  /**
   * Duplica una práctica incluida como copia editable del usuario y abre el editor.
   * @returns {Promise<void>}
   */
  async duplicateAndEdit() {
    const pr = this.practice.value;
    if (!pr) return;
    const copy = pr.duplicateAsUser();
    await this._appVm.upsertUserPractice(copy);
    this._appVm.showSnackbar('Copia creada. Ya podés editarla libremente.');
    this._appVm.navigate(`#/editor/${encodeURIComponent(copy.id)}`);
  }

  /**
   * Abre el editor directamente si es práctica de usuario, o duplica y edita si es incluida.
   */
  editCurrent() {
    const pr = this.practice.value;
    if (!pr) return;
    if (pr.isReadOnly) {
      this.duplicateAndEdit();
    } else {
      this._appVm.navigate(`#/editor/${encodeURIComponent(pr.id)}`);
    }
  }

  /**
   * Maneja la finalización de una pasada completa o una vuelta del bucle.
   */
  _handlePassComplete() {
    const pr = this.practice.value;
    if (!pr) return;

    this._accumulateElapsedTime();
    const nextReps = this.sessionRepetitions.value + 1;
    this.sessionRepetitions.set(nextReps);

    const studySecs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;

    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 1,
      studySeconds: studySecs
    });

    // Entrenador de velocidad en bucle: sube tempo.step cada N vueltas hasta tempo.target
    if (
      this.loopEnabled.value &&
      this.speedTrainerEnabled.value &&
      nextReps % this.speedTrainerEveryLoops.value === 0 &&
      this.bpm.value < pr.tempo.target
    ) {
      const nextBpm = Math.min(pr.tempo.target, this.bpm.value + (pr.tempo.step || 5));
      this.setTempo(nextBpm);
      this._appVm.showSnackbar(`Entrenador de velocidad: subiendo a ${nextBpm} BPM`);
    }
  }

  /**
   * Acumula los segundos transcurridos desde que empezó el tramo actual de reproducción.
   */
  _accumulateElapsedTime() {
    if (this._playStartedAtMs !== null) {
      const elapsed = Math.floor((Date.now() - this._playStartedAtMs) / 1000);
      if (elapsed > 0) this._pendingStudySeconds += elapsed;
      this._playStartedAtMs = this.isPlaying.value ? Date.now() : null;
    }
  }

  /**
   * Guarda tiempo de estudio pendiente al detener si hubo al menos 5 segundos de práctica.
   */
  _flushStudyTime() {
    const pr = this.practice.value;
    if (!pr || this._pendingStudySeconds < 5) {
      this._pendingStudySeconds = 0;
      return;
    }
    const secs = this._pendingStudySeconds;
    this._pendingStudySeconds = 0;
    this._appVm.recordPracticeSession({
      practiceId: pr.id,
      bpm: this.bpm.value,
      targetBpm: pr.tempo.target,
      repetitions: 0,
      studySeconds: secs
    });
  }
}
