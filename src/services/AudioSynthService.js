import { getChordVoicingMidi, midiToFrequency } from '../core/MusicTheory.js';
import { applyListeningRegister } from '../core/PitchPolicy.js';

/**
 * Intervalo de sondeo del scheduler de reproducción en milisegundos.
 */
const PLAYBACK_POLL_MS = 25;

/**
 * Ventana de anticipación en segundos para agendar notas y acompañamiento en Web Audio API.
 */
const PLAYBACK_LOOKAHEAD_SEC = 0.14;

/**
 * Acota un valor numérico de volumen al rango seguro [0, 1], devolviendo el respaldo si no es numérico.
 * @param {*} value Valor candidato.
 * @param {number} fallback Valor por defecto si value es NaN o no numérico.
 * @returns {number} Volumen normalizado en [0, 1].
 */
function sanitizeVolume(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

/**
 * Servicio de síntesis musical 100% offline sobre Web Audio API con voces separadas
 * (melodía, acordes y bajo), cuatro timbres instrumentales, registro de escucha configurable
 * (real / +1 octava según PitchPolicy), referencia de afinación, bucle por compases y resaltado sincronizado.
 */
export class AudioSynthService {
  /**
   * Crea el motor de síntesis inyectando el servicio de metrónomo para compartir AudioContext y clics.
   * @param {import('./MetronomeService.js').MetronomeService} metronomeService Servicio de metrónomo compartido.
   */
  constructor(metronomeService) {
    /** Referencia al servicio de metrónomo para compartir reloj y sonidos de clic. */
    this._metronome = metronomeService;
    /** Línea de tiempo musical actual (notas con alturas MIDI reales, acordes, compases). */
    this._timeline = null;
    /** Indica si la reproducción está activa. */
    this._isPlaying = false;
    /** Indica si la reproducción está pausada a mitad de camino. */
    this._isPaused = false;
    /** ID del temporizador del scheduler de anticipación. */
    this._schedulerTimer = null;
    /** ID del bucle requestAnimationFrame para resaltado visual. */
    this._rafId = null;

    /** Tempo actual en BPM (40-240). */
    this.bpm = 90;
    /** Instrumento de síntesis activo para la voz principal. */
    this.instrument = 'acoustic-guitar';
    /** Registro de escucha configurado en Ajustes ('real' | '+1oct'). */
    this.listeningRegister = 'real';
    /** Volumen independiente de la melodía / voz principal (por defecto 100%). */
    this.melodyVolume = 1.0;
    /** Activar/desactivar acompañamiento armónico de acordes. */
    this.chordsEnabled = true;
    /** Volumen independiente del acompañamiento de acordes (0-1). */
    this.chordsVolume = 0.55;
    /** Activar/desactivar la pista de bajo (permite al bajista silenciar el bajo en modo play-along). */
    this.bassEnabled = true;
    /** Volumen independiente de la voz de bajo (0-1). */
    this.bassVolume = 0.75;
    /** Modo de voces en piezas polifónicas clásicas ('both' | 'v1' | 'v2'). */
    this.voiceMode = 'both';
    /** Activar/desactivar clic de metrónomo integrado durante la reproducción. */
    this.metronomeEnabled = true;
    /** Volumen del metrónomo integrado (0-1). */
    this.metronomeVolume = 0.65;
    /** Patrón rítmico de acompañamiento armónico (comping) para prácticas de armonía/mixtas. */
    this.comping = 'negras-abajo';
    /** Cantidad de compases de conteo previo (0, 1 o 2). */
    this.countInMeasures = 1;

    /** Activar/desactivar bucle de compases. */
    this.loopEnabled = false;
    /** Compás inicial del bucle (1-based). */
    this.loopStartMeasure = 1;
    /** Compás final del bucle (1-based). */
    this.loopEndMeasure = 4;

    /** Tiempo ancla en AudioContext para convertir pulsos a segundos sin deriva. */
    this._anchorAudioTime = 0;
    /** Pulso musical (en tiempos de negra) correspondiente al tiempo ancla. */
    this._anchorBeat = 0;
    /** Último pulso musical ya agendado (cursor del scheduler). */
    this._scheduledUntilBeat = 0;
    /** Pulso de inicio del tramo activo (considerando bucle o inicio). */
    this._rangeStartBeat = 0;
    /** Pulso de fin del tramo activo. */
    this._rangeEndBeat = 0;
    /** Cantidad de pulsos restantes de conteo previo. */
    this._countInTotalBeats = 0;
    /** Cursor de pausa para reanudar desde el mismo punto. */
    this._pausedAtBeat = 0;

    /** Nodos de audio activos para silenciar inmediatamente al detener. */
    this._activeNodes = new Set();
    /** Cola de eventos visuales pendientes para sincronizar resaltado de notas. */
    this._visualQueue = [];
    /** Mapa voiceIndex -> nota activa actualmente sonando para resaltar múltiples voces a la vez. */
    this._activeVisualByVoice = new Map();
    /** Última firma de notas resaltadas para evitar emisiones visuales duplicadas. */
    this._lastVisualFingerprint = '';

    /** Callback disparado cuando suena una nota o compás ({ noteEvent, measureIndex, isCountIn, countInBeat }). */
    this.onVisualEvent = null;
    /** Callback disparado al completar una pasada o vuelta del bucle. */
    this.onPassComplete = null;
    /** Callback disparado cuando termina la reproducción (sin bucle). */
    this.onPlaybackEnd = null;
  }

  /**
   * Indica si el reproductor está activo actualmente.
   * @returns {boolean} True si está reproduciendo.
   */
  get isPlaying() {
    return this._isPlaying;
  }

  /**
   * Carga la línea de tiempo extraída por AbcService lista para reproducirse.
   * Si el reproductor ya estaba reproduciendo (por ejemplo tras un redibujo al rotar la pantalla),
   * actualiza suavemente las referencias SVG sin cortar el audio ni perder la posición.
   * @param {object} timeline Línea de tiempo con notes, chords, beatsPerMeasure, totalBeats y measureCount.
   */
  loadTimeline(timeline) {
    this._timeline = timeline;
    if (timeline && timeline.measureCount > 0) {
      this.loopStartMeasure = Math.max(1, Math.min(this.loopStartMeasure, timeline.measureCount));
      this.loopEndMeasure = Math.max(this.loopStartMeasure, Math.min(this.loopEndMeasure, timeline.measureCount));
      if (this._isPlaying) {
        this._recomputeRangeBeats();
      }
    }
  }

  /**
   * Actualiza parámetros de reproducción (BPM, volúmenes, bucle, instrumento, conteo y registro de escucha).
   * Si cambia el BPM en vivo, re-ancla suavemente sin saltos ni cambio de tono.
   * @param {object} patch Propiedades a modificar.
   */
  configure(patch = {}) {
    const ctx = this._metronome?.ensureAudioContext();
    if (patch.bpm !== undefined && this._isPlaying && ctx) {
      const currentBeat = this._audioTimeToBeat(ctx.currentTime);
      this._anchorAudioTime = ctx.currentTime;
      this._anchorBeat = currentBeat;
    }

    if (patch.bpm !== undefined) this.bpm = Math.max(40, Math.min(240, Math.round(Number(patch.bpm) || 90)));
    if (patch.instrument !== undefined) this.instrument = patch.instrument;
    if (patch.listeningRegister !== undefined) {
      this.listeningRegister = patch.listeningRegister === '+1oct' ? '+1oct' : 'real';
    }
    if (patch.melodyVolume !== undefined) this.melodyVolume = sanitizeVolume(patch.melodyVolume, 1.0);
    if (patch.chordsEnabled !== undefined) this.chordsEnabled = Boolean(patch.chordsEnabled);
    if (patch.chordsVolume !== undefined) this.chordsVolume = sanitizeVolume(patch.chordsVolume, 0.55);
    if (patch.bassEnabled !== undefined) this.bassEnabled = Boolean(patch.bassEnabled);
    if (patch.bassVolume !== undefined) this.bassVolume = sanitizeVolume(patch.bassVolume, 0.75);
    if (patch.voiceMode !== undefined && ['both', 'v1', 'v2'].includes(patch.voiceMode)) {
      this.voiceMode = patch.voiceMode;
    }
    if (patch.metronomeEnabled !== undefined) this.metronomeEnabled = Boolean(patch.metronomeEnabled);
    if (patch.metronomeVolume !== undefined) this.metronomeVolume = sanitizeVolume(patch.metronomeVolume, 0.65);
    if (patch.comping !== undefined) this.comping = patch.comping || 'negras-abajo';
    if (patch.countInMeasures !== undefined) this.countInMeasures = Math.max(0, Math.min(2, Number(patch.countInMeasures) || 0));
    if (patch.loopEnabled !== undefined) this.loopEnabled = Boolean(patch.loopEnabled);
    if (patch.loopStartMeasure !== undefined) this.loopStartMeasure = Math.max(1, Number(patch.loopStartMeasure) || 1);
    if (patch.loopEndMeasure !== undefined) this.loopEndMeasure = Math.max(this.loopStartMeasure, Number(patch.loopEndMeasure) || this.loopStartMeasure);

    if (this._timeline && this._isPlaying) {
      this._recomputeRangeBeats();
    }
  }

  /**
   * Reproduce una nota sostenida de referencia de afinación (cuerdas al aire de guitarra o bajo)
   * aplicando el registro de escucha actual mediante PitchPolicy.
   * @param {number} soundingMidi Altura MIDI real de la cuerda al aire (ej. 40 = E2 guitarra, 28 = E1 bajo).
   * @param {'nylon-guitar'|'acoustic-guitar'|'electric-bass'|'acoustic-bass'} [instrument='acoustic-guitar'] Timbre.
   */
  playReferenceTone(soundingMidi, instrument = 'acoustic-guitar') {
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;
    const finalMidi = applyListeningRegister(soundingMidi, this.listeningRegister);
    this._playPluckedNote(ctx, finalMidi, ctx.currentTime + 0.02, 2.2, instrument, 0.95);
  }

  /**
   * Reproduce exactamente las alturas MIDI de un Voicing (Tuning + frets) en bloque, arpegio
   * (ascendente, descendente, p-i-m-a) o rasgueado (abajo/arriba con desfase de 10-30 ms).
   * Respeta la política de registro única sin desplazamientos de octava duplicados.
   * @param {number[]|{ getMidiNotes: Function }} voicingOrMidis Voicing o arreglo de números MIDI reales.
   * @param {object} [options={}] Configuración de ejecución.
   * @param {'block'|'strum-down'|'strum-up'|'arpeggio-asc'|'arpeggio-desc'|'arpeggio-pima'} [options.mode='strum-down'] Modo de ejecución.
   * @param {'nylon-guitar'|'acoustic-guitar'|'electric-bass'|'acoustic-bass'} [options.instrument] Timbre.
   * @param {import('../models/Tuning.js').Tuning} [options.tuning] Afinación si se pasó un Voicing.
   * @param {number} [options.strumMs=22] Desfase entre cuerdas en milisegundos (10-30 ms para rasgueo).
   * @param {number} [options.duration=1.6] Duración en segundos.
   * @param {number} [options.volume=0.88] Volumen (0 a 1).
   */
  playVoicing(voicingOrMidis, options = {}) {
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;
    const rawMidis = Array.isArray(voicingOrMidis)
      ? voicingOrMidis
      : typeof voicingOrMidis?.getMidiNotes === 'function'
        ? voicingOrMidis.getMidiNotes(options.tuning)
        : [];
    if (rawMidis.length === 0) return;

    const mode = options.mode || 'strum-down';
    const inst = options.instrument || this.instrument || 'acoustic-guitar';
    const duration = Number(options.duration) || 1.6;
    const vol = sanitizeVolume(options.volume, 0.88);
    const startBase = options.startTime ?? ctx.currentTime + 0.02;
    this._scheduleVoicingAt(ctx, rawMidis, startBase, duration, mode, inst, vol, options.strumMs ?? 22);
  }

  /**
   * Reproduce una secuencia de bloques MIDI consecutivos (usado en Campo Armónico y Entrenamiento de Oído).
   * @param {number[][]} chordsMidis Arreglo de conjuntos MIDI a sonar en secuencia.
   * @param {object} [options={}] Opciones de intervalo, modo e instrumento.
   */
  playChordSequence(chordsMidis, options = {}) {
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx || !Array.isArray(chordsMidis)) return;
    const stepSec = (Number(options.stepMs) || 850) / 1000;
    const start0 = ctx.currentTime + 0.04;
    chordsMidis.forEach((midis, idx) => {
      this._scheduleVoicingAt(
        ctx,
        midis,
        start0 + idx * stepSec,
        Math.max(0.5, stepSec * 0.92),
        options.mode || 'strum-down',
        options.instrument || 'nylon-guitar',
        0.85,
        18
      );
    });
  }

  /**
   * Agenda en Web Audio API la ejecución de un conjunto exacto de notas MIDI según el modo rítmico.
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {number[]} rawMidis Alturas MIDI reales (baja a alta).
   * @param {number} startTime Instante exacto en audioCtx.currentTime.
   * @param {number} duration Duración en segundos.
   * @param {string} mode Modo: block, strum-down, strum-up, arpeggio-asc, arpeggio-desc, arpeggio-pima.
   * @param {string} instrument Timbre sintetizado.
   * @param {number} volume Volumen base (0..1).
   * @param {number} [strumMs=20] Desfase entre cuerdas para rasgueo (10-30 ms).
   */
  _scheduleVoicingAt(ctx, rawMidis, startTime, duration, mode, instrument, volume, strumMs = 20) {
    const midis = [...rawMidis].sort((a, b) => a - b);
    if (midis.length === 0) return;

    if (mode === 'block') {
      midis.forEach((m) => {
        const finalM = applyListeningRegister(m, this.listeningRegister);
        this._playPluckedNote(ctx, finalM, startTime, duration, instrument, volume * 0.55);
      });
      return;
    }

    if (mode === 'strum-down' || mode === 'strum-up') {
      const spreadSec = Math.max(0.01, Math.min(0.03, strumMs / 1000));
      const ordered = mode === 'strum-up' ? [...midis].reverse() : midis;
      ordered.forEach((m, idx) => {
        const accent = idx === 0 ? 1.0 : 0.88;
        const finalM = applyListeningRegister(m, this.listeningRegister);
        this._playPluckedNote(ctx, finalM, startTime + idx * spreadSec, duration, instrument, volume * 0.56 * accent);
      });
      return;
    }

    if (mode === 'arpeggio-pima') {
      const bass = midis[0];
      const upper = midis.length >= 4 ? midis.slice(-3) : midis.slice(1);
      const seq = [bass, ...(upper.length > 0 ? upper : [bass])];
      const step = Math.min(0.24, Math.max(0.08, duration / Math.max(4, seq.length)));
      seq.forEach((m, idx) => {
        const finalM = applyListeningRegister(m, this.listeningRegister);
        this._playPluckedNote(ctx, finalM, startTime + idx * step, Math.max(0.35, duration - idx * step * 0.5), instrument, volume * (idx === 0 ? 0.72 : 0.6));
      });
      return;
    }

    // arpeggio-asc / arpeggio-desc
    const ordered = mode === 'arpeggio-desc' ? [...midis].reverse() : midis;
    const step = Math.min(0.22, Math.max(0.075, duration / Math.max(4, ordered.length)));
    ordered.forEach((m, idx) => {
      const finalM = applyListeningRegister(m, this.listeningRegister);
      this._playPluckedNote(ctx, finalM, startTime + idx * step, Math.max(0.3, duration - idx * step * 0.4), instrument, volume * 0.64);
    });
  }

  /**
   * Inicia o reanuda la reproducción de la práctica cargada.
   */
  play() {
    if (!this._timeline || this._timeline.totalBeats <= 0) return;
    if (this._isPlaying) return;

    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;

    this._recomputeRangeBeats();
    this._visualQueue = [];
    this._activeVisualByVoice.clear();
    this._lastVisualFingerprint = '';

    const beatsPerMeasure = this._timeline.beatsPerMeasure || 4;
    const startingFresh = !this._isPaused;
    this._countInTotalBeats = startingFresh ? this.countInMeasures * beatsPerMeasure : 0;

    const startBeat = startingFresh
      ? this._rangeStartBeat - this._countInTotalBeats
      : Math.max(this._rangeStartBeat, Math.min(this._pausedAtBeat, this._rangeEndBeat - 0.1));

    this._anchorAudioTime = ctx.currentTime + 0.06;
    this._anchorBeat = startBeat;
    this._scheduledUntilBeat = startBeat - 0.0001;
    this._isPlaying = true;
    this._isPaused = false;

    this._schedulerLoop();
    this._visualLoop();
  }

  /**
   * Pausa la reproducción recordando el pulso musical exacto para reanudar luego.
   */
  pause() {
    if (!this._isPlaying) return;
    const ctx = this._metronome?.ensureAudioContext();
    if (ctx) {
      this._pausedAtBeat = Math.max(this._rangeStartBeat, this._audioTimeToBeat(ctx.currentTime));
    }
    this._isPlaying = false;
    this._isPaused = true;
    this._stopTimersAndNodes();
  }

  /**
   * Detiene completamente la reproducción y reinicia el cursor al principio.
   */
  stop() {
    this._isPlaying = false;
    this._isPaused = false;
    this._pausedAtBeat = 0;
    this._stopTimersAndNodes();
  }

  /**
   * Cancela temporizadores activos y silencia todos los osciladores sonando.
   */
  _stopTimersAndNodes() {
    if (this._schedulerTimer !== null) {
      clearTimeout(this._schedulerTimer);
      this._schedulerTimer = null;
    }
    if (this._rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    for (const stopFn of this._activeNodes) {
      try {
        stopFn();
      } catch {
        // Ignora nodos ya finalizados
      }
    }
    this._activeNodes.clear();
    this._visualQueue = [];
    this._activeVisualByVoice.clear();
    this._lastVisualFingerprint = '';
  }

  /**
   * Calcula los límites en pulsos (en negras) del rango de reproducción o bucle actual.
   */
  _recomputeRangeBeats() {
    const tl = this._timeline;
    if (!tl) return;
    const bpmMeasure = tl.beatsPerMeasure || 4;
    if (this.loopEnabled && tl.measureCount > 0) {
      const startM = Math.max(1, Math.min(this.loopStartMeasure, tl.measureCount));
      const endM = Math.max(startM, Math.min(this.loopEndMeasure, tl.measureCount));
      this._rangeStartBeat = (startM - 1) * bpmMeasure;
      this._rangeEndBeat = Math.min(tl.totalBeats, endM * bpmMeasure);
      if (this._rangeEndBeat <= this._rangeStartBeat) {
        this._rangeEndBeat = this._rangeStartBeat + bpmMeasure;
      }
    } else {
      this._rangeStartBeat = 0;
      this._rangeEndBeat = tl.totalBeats;
    }
  }

  /**
   * Convierte un pulso musical a segundos en el reloj del AudioContext.
   * @param {number} beat Posición en negras.
   * @returns {number} Instante en audioCtx.currentTime.
   */
  _beatToAudioTime(beat) {
    return this._anchorAudioTime + (beat - this._anchorBeat) * (60 / this.bpm);
  }

  /**
   * Convierte un instante del AudioContext al pulso musical actual.
   * @param {number} audioTime Instante en segundos.
   * @returns {number} Posición en negras.
   */
  _audioTimeToBeat(audioTime) {
    return this._anchorBeat + (audioTime - this._anchorAudioTime) * (this.bpm / 60);
  }

  /**
   * Bucle de anticipación que agenda notas, acordes, bajo y clic dentro de la ventana lookahead.
   */
  _schedulerLoop() {
    if (!this._isPlaying || !this._timeline) return;
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;

    const horizonBeat = this._audioTimeToBeat(ctx.currentTime + PLAYBACK_LOOKAHEAD_SEC);
    const tl = this._timeline;
    const secPerBeat = 60 / this.bpm;
    const beatsPerMeasure = tl.beatsPerMeasure || 4;
    const clickStep = tl.beatUnit === 8 ? 0.5 : 1;

    // 1) Agenda conteo previo
    if (this._scheduledUntilBeat < this._rangeStartBeat) {
      const countStart = this._rangeStartBeat - this._countInTotalBeats;
      for (let b = countStart; b < this._rangeStartBeat - 0.0001; b += clickStep) {
        if (b > this._scheduledUntilBeat && b <= horizonBeat) {
          const t = this._beatToAudioTime(b);
          const relIndex = Math.round((b - countStart) / clickStep);
          const beatsInBar = Math.round(beatsPerMeasure / clickStep);
          const beatInBar = (relIndex % beatsInBar) + 1;
          const remaining = Math.max(1, Math.round((this._rangeStartBeat - b) / clickStep));
          this._metronome.playClickAt(t, beatInBar === 1 ? 'accent' : 'beat', this._metronome.soundType, Math.max(0.65, this.metronomeVolume));
          this._visualQueue.push({
            time: t,
            isCountIn: true,
            countInBeat: beatInBar,
            countDown: remaining,
            totalBeats: beatsInBar
          });
        }
      }
    }

    // 2) Agenda música dentro del tramo activo
    const scheduleWindowStart = Math.max(this._scheduledUntilBeat, this._rangeStartBeat - 0.0001);
    const scheduleWindowEnd = Math.min(horizonBeat, this._rangeEndBeat);

    if (scheduleWindowEnd > scheduleWindowStart) {
      if (this.metronomeEnabled) {
        const firstClickIdx = Math.ceil((Math.max(this._rangeStartBeat, scheduleWindowStart) + 0.00001) / clickStep);
        for (let idx = firstClickIdx; idx * clickStep < scheduleWindowEnd; idx++) {
          const b = idx * clickStep;
          if (b < this._rangeStartBeat) continue;
          const t = this._beatToAudioTime(b);
          const beatsInBar = Math.round(beatsPerMeasure / clickStep);
          const isDownbeat = idx % beatsInBar === 0;
          this._metronome.playClickAt(t, isDownbeat ? 'accent' : 'beat', this._metronome.soundType, this.metronomeVolume);
        }
      }

      for (const noteEv of tl.notes) {
        if (noteEv.beat > scheduleWindowStart && noteEv.beat <= scheduleWindowEnd && noteEv.beat < this._rangeEndBeat) {
          const t = this._beatToAudioTime(noteEv.beat);
          const durSec = Math.max(0.06, noteEv.durationBeats * secPerBeat);

          // Respeta el modo de voces en piezas polifónicas ('both' | 'v1' melodía | 'v2' voces inferiores)
          const vIdx = noteEv.voiceIndex ?? 0;
          const isLowerVoice = vIdx > 0;
          const skipForVoiceMode =
            (this.voiceMode === 'v1' && isLowerVoice) ||
            (this.voiceMode === 'v2' && !isLowerVoice);

          if (!skipForVoiceMode) {
            if (!noteEv.isRest && noteEv.midis.length > 0) {
              // En partituras polifónicas de guitarra/clásica todas las voces escritas (V:1, V:2, V:3...)
              // suenan con el instrumento principal; solo pentagramas en clave de fa usan timbre de bajo.
              const usesBassTimbre = Boolean(tl.isBassPiece || noteEv.isBassStaff);
              const effectiveBassVol = this.bassEnabled ? this.bassVolume : 0;
              const vol = tl.isBassPiece
                ? (this.bassEnabled ? Math.max(this.melodyVolume, effectiveBassVol) : 0)
                : noteEv.isBassStaff
                  ? effectiveBassVol
                  : this.melodyVolume * (vIdx === 0 ? 1.0 : 0.92);
              const voiceInst = usesBassTimbre
                ? (this.instrument.includes('bass') ? this.instrument : 'electric-bass')
                : this.instrument;

              for (const midi of noteEv.midis) {
                const playbackMidi = applyListeningRegister(midi, this.listeningRegister);
                this._playPluckedNote(ctx, playbackMidi, t, durSec, voiceInst, vol);
              }
            }

            this._visualQueue.push({
              time: t,
              endTime: t + durSec,
              isCountIn: false,
              noteEvent: noteEv,
              measureIndex: noteEv.measureIndex
            });
          }
        }
      }

      if ((this.chordsEnabled || tl.isHarmonyOnly) && tl.chords.length > 0) {
        for (const chordEv of tl.chords) {
          if (chordEv.beat > scheduleWindowStart && chordEv.beat <= scheduleWindowEnd && chordEv.beat < this._rangeEndBeat) {
            const t = this._beatToAudioTime(chordEv.beat);
            const durSec = Math.max(0.25, chordEv.durationBeats * secPerBeat);
            this._playChordEvent(ctx, chordEv, t, durSec, secPerBeat, tl);
            if (tl.isHarmonyOnly) {
              this._visualQueue.push({
                time: t,
                isCountIn: false,
                measureIndex: chordEv.measureIndex,
                chordStepIndex: chordEv.stepIndex
              });
            }
          }
        }
      }
    }

    this._scheduledUntilBeat = Math.min(horizonBeat, this._rangeEndBeat);

    // 3) Fin de tramo: bucle o finalización
    if (horizonBeat >= this._rangeEndBeat) {
      if (this.loopEnabled) {
        const endAudioTime = this._beatToAudioTime(this._rangeEndBeat);
        this._anchorAudioTime = endAudioTime;
        this._anchorBeat = this._rangeStartBeat;
        this._scheduledUntilBeat = this._rangeStartBeat - 0.0001;
        this._visualQueue.push({ time: endAudioTime, isPassComplete: true });
      } else {
        const endAudioTime = this._beatToAudioTime(this._rangeEndBeat);
        this._visualQueue.push({ time: endAudioTime, isPlaybackEnd: true });
        this._schedulerTimer = null;
        return;
      }
    }

    this._schedulerTimer = setTimeout(() => this._schedulerLoop(), PLAYBACK_POLL_MS);
  }

  /**
   * Bucle visual sincronizado con audioCtx.currentTime para resaltar simultáneamente
   * todas las notas activas de todas las voces en el pulso correspondiente.
   */
  _visualLoop() {
    if (!this._isPlaying) return;
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this._processVisualFrame(now);

    if (this._isPlaying && typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(() => this._visualLoop());
    }
  }

  /**
   * Procesa un instante de tiempo de audio para actualizar el conjunto de voces/notas resaltadas
   * y despachar eventos de conteo previo, compás y paso armónico.
   * @param {number} now Instante actual en audioCtx.currentTime.
   */
  _processVisualFrame(now) {
    if (this._visualQueue.length > 1) {
      this._visualQueue.sort((a, b) => a.time - b.time);
    }

    let latestMeasure = 0;
    let hadNoteUpdate = false;

    while (this._visualQueue.length > 0 && this._visualQueue[0].time <= now + 0.015) {
      const ev = this._visualQueue.shift();
      if (ev.isPassComplete) {
        this._activeVisualByVoice.clear();
        this._lastVisualFingerprint = '';
        if (typeof this.onPassComplete === 'function') this.onPassComplete();
        continue;
      }
      if (ev.isPlaybackEnd) {
        if (typeof this.onPassComplete === 'function') this.onPassComplete();
        this.stop();
        if (typeof this.onPlaybackEnd === 'function') this.onPlaybackEnd();
        return;
      }
      if (ev.isCountIn || ev.chordStepIndex !== undefined) {
        if (typeof this.onVisualEvent === 'function') {
          this.onVisualEvent(ev);
        }
        continue;
      }
      if (ev.noteEvent) {
        const vIdx = ev.noteEvent.voiceIndex ?? 0;
        if (ev.measureIndex) latestMeasure = Math.max(latestMeasure, ev.measureIndex);
        if (ev.noteEvent.isRest) {
          this._activeVisualByVoice.delete(vIdx);
        } else {
          this._activeVisualByVoice.set(vIdx, {
            noteEvent: ev.noteEvent,
            endTime: ev.endTime ?? (ev.time + 0.25),
            measureIndex: ev.measureIndex || 0
          });
        }
        hadNoteUpdate = true;
      }
    }

    // Expira notas de cualquier voz que ya terminaron de sonar antes de este instante
    for (const [vIdx, entry] of this._activeVisualByVoice.entries()) {
      if (entry.endTime <= now + 0.005) {
        this._activeVisualByVoice.delete(vIdx);
        hadNoteUpdate = true;
      } else if (entry.measureIndex) {
        latestMeasure = Math.max(latestMeasure, entry.measureIndex);
      }
    }

    if (hadNoteUpdate) {
      const activeNotes = [...this._activeVisualByVoice.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, entry]) => entry.noteEvent);
      const fingerprint = activeNotes
        .map((n) => n.noteId || `${n.voiceIndex ?? 0}:${n.beat}`)
        .join('|');
      if (fingerprint !== this._lastVisualFingerprint) {
        this._lastVisualFingerprint = fingerprint;
        if (typeof this.onVisualEvent === 'function') {
          this.onVisualEvent({
            isCountIn: false,
            measureIndex: latestMeasure,
            activeNotes,
            noteEvent: activeNotes[0] || null
          });
        }
      }
    }
  }

  /**
   * Sintetiza una nota pulsada en Web Audio API modelada según el instrumento elegido.
   * No realiza desplazamientos de octava propios: reproduce exactamente la altura MIDI recibida.
   * @param {AudioContext} ctx Contexto Web Audio activo.
   * @param {number} midi Nota MIDI exacta a sintetizar.
   * @param {number} startTime Instante exacto de ataque.
   * @param {number} duration Duración en segundos.
   * @param {'nylon-guitar'|'acoustic-guitar'|'electric-bass'|'acoustic-bass'} instrument Timbre.
   * @param {number} volume Volumen del canal (0 a 1).
   */
  _playPluckedNote(ctx, midi, startTime, duration, instrument, volume) {
    if (volume <= 0.005) return;
    const safeStart = Math.max(ctx.currentTime, startTime);
    const freq = midiToFrequency(midi);
    const release = instrument.includes('bass') ? 0.14 : 0.22;
    const totalDur = Math.min(3.2, Math.max(0.14, duration + release));

    const masterGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc2Gain = ctx.createGain();

    if (instrument === 'nylon-guitar') {
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, safeStart);
      osc2Gain.gain.setValueAtTime(0.24, safeStart);
      filter.frequency.setValueAtTime(Math.min(3400, freq * 5.2), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(520, freq * 1.6), safeStart + totalDur);
      masterGain.gain.setValueAtTime(0.001, safeStart);
      masterGain.gain.linearRampToValueAtTime(0.28 * volume, safeStart + 0.012);
      masterGain.gain.exponentialRampToValueAtTime(0.001, safeStart + totalDur);
    } else if (instrument === 'acoustic-guitar') {
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, safeStart);
      osc2Gain.gain.setValueAtTime(0.32, safeStart);
      filter.frequency.setValueAtTime(Math.min(5200, freq * 7.5), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(680, freq * 1.9), safeStart + totalDur);
      masterGain.gain.setValueAtTime(0.001, safeStart);
      masterGain.gain.linearRampToValueAtTime(0.2 * volume, safeStart + 0.006);
      masterGain.gain.exponentialRampToValueAtTime(0.001, safeStart + totalDur);
    } else if (instrument === 'electric-bass') {
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 2, safeStart);
      osc2Gain.gain.setValueAtTime(0.22, safeStart);
      filter.frequency.setValueAtTime(Math.min(1600, freq * 5.2), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(240, freq * 2.0), safeStart + totalDur);
      masterGain.gain.setValueAtTime(0.001, safeStart);
      masterGain.gain.linearRampToValueAtTime(0.38 * volume, safeStart + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.001, safeStart + totalDur);
    } else {
      // acoustic-bass
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, safeStart);
      osc2Gain.gain.setValueAtTime(0.26, safeStart);
      filter.frequency.setValueAtTime(Math.min(1050, freq * 3.8), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.5), safeStart + totalDur * 0.85);
      masterGain.gain.setValueAtTime(0.001, safeStart);
      masterGain.gain.linearRampToValueAtTime(0.42 * volume, safeStart + 0.018);
      masterGain.gain.exponentialRampToValueAtTime(0.001, safeStart + totalDur * 0.85);
    }

    osc1.frequency.setValueAtTime(freq, safeStart);
    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    osc1.start(safeStart);
    osc2.start(safeStart);
    osc1.stop(safeStart + totalDur + 0.03);
    osc2.stop(safeStart + totalDur + 0.03);

    const stopFn = () => {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(0.0001, now, 0.015);
      osc1.stop(now + 0.05);
      osc2.stop(now + 0.05);
    };
    this._activeNodes.add(stopFn);
    osc1.onended = () => this._activeNodes.delete(stopFn);
  }

  /**
   * Reproduce un evento de acorde de la línea de tiempo: si posee voicingMidis exactos
   * (práctica de armonía o mixta con digitación) suena esa digitación exacta con el patrón de comping;
   * si no, usa el voicing armónico genérico para acompañamiento ABC.
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {object} chordEv Evento de acorde ({ symbol, voicingMidis, durationBeats, rhythm }).
   * @param {number} startTime Instante de inicio en AudioContext.
   * @param {number} duration Duración total del evento en segundos.
   * @param {number} secPerBeat Segundos por negra al BPM actual.
   * @param {object} tl Línea de tiempo activa.
   */
  _playChordEvent(ctx, chordEv, startTime, duration, secPerBeat, tl) {
    const pattern = chordEv.rhythm || this.comping || 'negras-abajo';
    const hasVoicing = Array.isArray(chordEv.voicingMidis) && chordEv.voicingMidis.length > 0;

    if (tl.isHarmonyOnly) {
      // Modo armonía / play-along: pista de acordes y pista de bajo separadas y silenciables
      if (this.chordsEnabled && this.chordsVolume > 0.01) {
        const chordMidis = hasVoicing
          ? chordEv.voicingMidis
          : (getChordVoicingMidi(chordEv.symbol, 52)?.chordMidis || []);
        if (chordMidis.length > 0) {
          const chordInst = tl.isBassPiece && !this.instrument.includes('guitar')
            ? 'electric-bass'
            : (this.instrument.includes('guitar') ? this.instrument : 'nylon-guitar');
          this._scheduleCompingPattern(
            ctx,
            chordMidis,
            startTime,
            chordEv.durationBeats,
            secPerBeat,
            pattern,
            chordInst,
            this.chordsVolume,
            false
          );
        }
      }

      if (this.bassEnabled && this.bassVolume > 0.01) {
        this._schedulePlayAlongBass(ctx, chordEv.symbol, startTime, chordEv.durationBeats, secPerBeat, pattern);
      }
      return;
    }

    if (hasVoicing && this.chordsEnabled && this.chordsVolume > 0.01) {
      const inst = tl.isBassPiece
        ? (this.instrument.includes('bass') ? this.instrument : 'electric-bass')
        : (this.instrument.includes('guitar') ? this.instrument : 'acoustic-guitar');
      this._scheduleCompingPattern(ctx, chordEv.voicingMidis, startTime, chordEv.durationBeats, secPerBeat, pattern, inst, this.chordsVolume, tl.isBassPiece);
      return;
    }

    this._playChordAccompaniment(ctx, chordEv.symbol, startTime, duration, tl.isBassPiece);
  }

  /**
   * Genera una línea de acompañamiento de bajo en vivo para modo "tocar sobre la base" (play-along)
   * adaptada al feeling del tema (swing, bossa, shuffle, vals, balada, tango o recto).
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {string} chordSymbol Símbolo americano del acorde.
   * @param {number} startTime Instante inicial.
   * @param {number} durationBeats Duración en negras.
   * @param {number} secPerBeat Segundos por negra.
   * @param {string} pattern Clave en COMPING_PATTERNS.
   */
  _schedulePlayAlongBass(ctx, chordSymbol, startTime, durationBeats, secPerBeat, pattern) {
    const voicing = getChordVoicingMidi(chordSymbol, 40);
    if (!voicing) return;
    // Baja al registro real de contrabajo / bajo eléctrico (E1..D#2 = MIDI 28..39)
    let root = voicing.bassMidi;
    while (root >= 40) root -= 12;
    while (root < 28) root += 12;
    const fifth = root + 7;
    const third = voicing.chordMidis.length > 1 ? root + ((voicing.chordMidis[1] - voicing.chordMidis[0] + 12) % 12) : root + 4;
    const bassInst = pattern === 'swing-negras' || pattern === 'balada-lenta' ? 'acoustic-bass' : 'electric-bass';
    const vol = this.bassVolume * 0.65;
    const beats = Math.max(1, Math.round(durationBeats));

    if (pattern === 'bossa') {
      // Bajo en 2 con anticipación clásica de bossa nova
      const hits = [
        { offset: 0, midi: root, dur: secPerBeat * 1.4 },
        { offset: 1.5, midi: fifth, dur: secPerBeat * 0.45 },
        { offset: 2, midi: fifth, dur: secPerBeat * 1.4 },
        { offset: 3.5, midi: root, dur: secPerBeat * 0.45 }
      ];
      for (const h of hits) {
        if (h.offset < durationBeats) {
          this._playPluckedNote(ctx, applyListeningRegister(h.midi, this.listeningRegister), startTime + h.offset * secPerBeat, h.dur, bassInst, vol);
        }
      }
      return;
    }

    if (pattern === 'shuffle') {
      const seq = [root, third, fifth, root + 9];
      for (let b = 0; b < beats; b++) {
        const m = seq[b % seq.length];
        this._playPluckedNote(ctx, applyListeningRegister(m, this.listeningRegister), startTime + b * secPerBeat, secPerBeat * 0.85, bassInst, vol);
      }
      return;
    }

    if (pattern === 'swing-negras') {
      // Walking de 4 negras (R - 3 - 5 - 3/aprox) para base de jazz
      const seq = [root, third, fifth, third];
      for (let b = 0; b < beats; b++) {
        const m = seq[b % seq.length];
        this._playPluckedNote(ctx, applyListeningRegister(m, this.listeningRegister), startTime + b * secPerBeat, secPerBeat * 0.92, bassInst, vol);
      }
      return;
    }

    if (pattern === 'balada-lenta' || pattern === 'bloque') {
      this._playPluckedNote(ctx, applyListeningRegister(root, this.listeningRegister), startTime, durationBeats * secPerBeat * 0.92, bassInst, vol);
      return;
    }

    // Por defecto (recto, vals, tango): raíz en tiempo 1 y quinta en mitad de compás
    this._playPluckedNote(ctx, applyListeningRegister(root, this.listeningRegister), startTime, Math.min(2, durationBeats) * secPerBeat * 0.9, bassInst, vol);
    if (durationBeats >= 3) {
      this._playPluckedNote(ctx, applyListeningRegister(fifth, this.listeningRegister), startTime + 2 * secPerBeat, Math.min(2, durationBeats - 2) * secPerBeat * 0.9, bassInst, vol * 0.88);
    }
  }

  /**
   * Agenda un patrón de ritmo (rasgueo, arpegio p-i-m-a, vals, bossa, swing o bloque)
   * usando exactamente las notas MIDI del voicing seleccionado.
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {number[]} midis Alturas MIDI exactas del voicing.
   * @param {number} startTime Instante inicial.
   * @param {number} durationBeats Duración en negras.
   * @param {number} secPerBeat Segundos por negra.
   * @param {string} pattern Identificador del patrón en COMPING_PATTERNS.
   * @param {string} instrument Timbre.
   * @param {number} volume Volumen del canal.
   * @param {boolean} isBassPiece True si es bajo (ejecuta arpegio de notas del acorde).
   */
  _scheduleCompingPattern(ctx, midis, startTime, durationBeats, secPerBeat, pattern, instrument, volume, isBassPiece) {
    const sorted = [...midis].sort((a, b) => a - b);
    const totalSec = durationBeats * secPerBeat;

    if (isBassPiece) {
      // En bajo reproduce el arpegio del acorde en negras (raíz, 3ª, 5ª, 7ª)
      const beats = Math.max(1, Math.round(durationBeats));
      for (let b = 0; b < beats; b++) {
        const m = sorted[b % sorted.length];
        const finalM = applyListeningRegister(m, this.listeningRegister);
        this._playPluckedNote(ctx, finalM, startTime + b * secPerBeat, secPerBeat * 0.9, instrument, Math.max(volume, this.bassVolume) * 0.85);
      }
      return;
    }

    if (pattern === 'bloque') {
      this._scheduleVoicingAt(ctx, sorted, startTime, totalSec, 'block', instrument, volume, 0);
      return;
    }

    if (pattern === 'arpegio-pima' || pattern === 'arpegio-asc') {
      const mode = pattern === 'arpegio-pima' ? 'arpeggio-pima' : 'arpeggio-asc';
      const chunks = Math.max(1, Math.floor(durationBeats / 2));
      const chunkSec = totalSec / chunks;
      for (let c = 0; c < chunks; c++) {
        this._scheduleVoicingAt(ctx, sorted, startTime + c * chunkSec, chunkSec, mode, instrument, volume, 18);
      }
      return;
    }

    if (pattern === 'vals') {
      const bass = [sorted[0]];
      const upper = sorted.length > 1 ? sorted.slice(1) : sorted;
      const beats = Math.max(1, Math.round(durationBeats));
      for (let b = 0; b < beats; b++) {
        const isOne = b % 3 === 0;
        this._scheduleVoicingAt(
          ctx,
          isOne ? bass : upper,
          startTime + b * secPerBeat,
          secPerBeat * (isOne ? 1.4 : 0.75),
          isOne ? 'block' : 'strum-down',
          instrument,
          volume * (isOne ? 1.0 : 0.72),
          14
        );
      }
      return;
    }

    if (pattern === 'bossa') {
      // Patrón bossa simplificado sobre 4 negras: 1 (bajo+bloque), 2.5 (síncopa), 3 (bajo), 4 (bloque)
      const hits = [
        { offset: 0, notes: sorted, mode: 'block', accent: 1.0 },
        { offset: 1.5, notes: sorted.slice(1).length ? sorted.slice(1) : sorted, mode: 'block', accent: 0.78 },
        { offset: 2, notes: [sorted[0]], mode: 'block', accent: 0.85 },
        { offset: 3, notes: sorted.slice(1).length ? sorted.slice(1) : sorted, mode: 'block', accent: 0.82 }
      ];
      for (const h of hits) {
        if (h.offset < durationBeats) {
          this._scheduleVoicingAt(ctx, h.notes, startTime + h.offset * secPerBeat, secPerBeat * 0.9, h.mode, instrument, volume * h.accent, 14);
        }
      }
      return;
    }

    if (pattern === 'rasgueo-balada') {
      // Negras y contratiempos suaves: Abajo(1), Abajo(2), Arriba(2.5), Arriba(3.5), Abajo(4)
      const strums = [
        { offset: 0, mode: 'strum-down', accent: 1.0 },
        { offset: 1, mode: 'strum-down', accent: 0.85 },
        { offset: 1.5, mode: 'strum-up', accent: 0.65 },
        { offset: 2.5, mode: 'strum-up', accent: 0.7 },
        { offset: 3, mode: 'strum-down', accent: 0.85 },
        { offset: 3.5, mode: 'strum-up', accent: 0.65 }
      ];
      for (const s of strums) {
        if (s.offset < durationBeats) {
          this._scheduleVoicingAt(ctx, sorted, startTime + s.offset * secPerBeat, secPerBeat * 0.85, s.mode, instrument, volume * s.accent, 22);
        }
      }
      return;
    }

    if (pattern === 'shuffle') {
      // Shuffle blues con corchea atresillada (2/3 de pulso)
      const beats = Math.max(1, Math.round(durationBeats));
      for (let b = 0; b < beats; b++) {
        this._scheduleVoicingAt(ctx, sorted, startTime + b * secPerBeat, secPerBeat * 0.55, 'strum-down', instrument, volume * (b % 2 === 0 ? 1.0 : 0.78), 18);
        if (b + 0.67 < durationBeats) {
          this._scheduleVoicingAt(ctx, sorted, startTime + (b + 0.67) * secPerBeat, secPerBeat * 0.28, 'strum-up', instrument, volume * 0.62, 16);
        }
      }
      return;
    }

    if (pattern === 'balada-lenta') {
      const halves = Math.max(1, Math.ceil(durationBeats / 2));
      for (let h = 0; h < halves; h++) {
        const offset = h * 2;
        if (offset < durationBeats) {
          this._scheduleVoicingAt(ctx, sorted, startTime + offset * secPerBeat, Math.min(2, durationBeats - offset) * secPerBeat * 0.95, 'strum-down', instrument, volume * (h === 0 ? 0.92 : 0.72), 26);
        }
      }
      return;
    }

    if (pattern === 'tango-marcato') {
      const beats = Math.max(1, Math.round(durationBeats));
      for (let b = 0; b < beats; b++) {
        const strong = b % 2 === 0;
        this._scheduleVoicingAt(ctx, sorted, startTime + b * secPerBeat, secPerBeat * 0.5, 'block', instrument, volume * (strong ? 1.0 : 0.72), 10);
      }
      return;
    }

    // Por defecto ('negras-abajo' / 'swing-negras'): rasgueo firme en cada negra con acento en 1 y 3 (o 2 y 4 en swing)
    const beats = Math.max(1, Math.round(durationBeats));
    for (let b = 0; b < beats; b++) {
      const isSwing = pattern === 'swing-negras';
      const accent = isSwing ? (b % 2 === 1 ? 1.0 : 0.78) : (b % 4 === 0 ? 1.0 : 0.82);
      const dur = isSwing ? secPerBeat * 0.62 : secPerBeat * 0.92;
      this._scheduleVoicingAt(ctx, sorted, startTime + b * secPerBeat, dur, 'strum-down', instrument, volume * accent, 18);
    }
  }

  /**
   * Reproduce un rasgueo suave de acompañamiento para el acorde cifrado sin aplicar desplazamientos
   * dobles de octava sobre la nota grave.
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {string} chordSymbol Símbolo del acorde americano.
   * @param {number} startTime Instante de inicio.
   * @param {number} duration Duración del acorde en segundos.
   * @param {boolean} isBassPiece Si true, omite el bajo de acompañamiento para no duplicar la línea principal.
   */
  _playChordAccompaniment(ctx, chordSymbol, startTime, duration, isBassPiece) {
    const voicing = getChordVoicingMidi(chordSymbol, 52);
    if (!voicing) return;

    if (this.chordsVolume > 0.01) {
      const strumSpread = 0.018;
      voicing.chordMidis.forEach((midi, idx) => {
        const finalMidi = applyListeningRegister(midi, this.listeningRegister);
        this._playPluckedNote(
          ctx,
          finalMidi,
          startTime + idx * strumSpread,
          Math.min(duration, 1.8),
          'nylon-guitar',
          this.chordsVolume * 0.36
        );
      });
    }

    // Usa voicing.bassMidi en su registro real (40..51, rango de guitarra/bajo medio) sin restar otra octava
    if (!isBassPiece && this.bassVolume > 0.01) {
      const finalBass = applyListeningRegister(voicing.bassMidi, this.listeningRegister);
      this._playPluckedNote(
        ctx,
        finalBass,
        startTime,
        Math.min(duration, 1.8),
        'acoustic-bass',
        this.bassVolume * 0.38
      );
    }
  }
}
