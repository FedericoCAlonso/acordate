import { getChordVoicingMidi, midiToFrequency } from '../core/MusicTheory.js';

/**
 * Intervalo de sondeo del scheduler de reproducción en milisegundos.
 */
const PLAYBACK_POLL_MS = 25;

/**
 * Ventana de anticipación en segundos para agendar notas y acompañamiento en Web Audio API.
 */
const PLAYBACK_LOOKAHEAD_SEC = 0.14;

/**
 * Servicio de síntesis musical 100% offline sobre Web Audio API con voces separadas
 * (melodía, acordes y bajo), cuatro timbres instrumentales, bucle por rango de compases,
 * conteo previo, metrónomo integrado y sincronización precisa para resaltado de notas.
 */
export class AudioSynthService {
  /**
   * Crea el motor de síntesis inyectando el servicio de metrónomo para compartir AudioContext y clics.
   * @param {import('./MetronomeService.js').MetronomeService} metronomeService Servicio de metrónomo compartido.
   */
  constructor(metronomeService) {
    /** Referencia al servicio de metrónomo para compartir reloj y sonidos de clic. */
    this._metronome = metronomeService;
    /** Línea de tiempo musical actual (notas, acordes, compases). */
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
    /** Volumen independiente de la melodía / voz principal (0-1). */
    this.melodyVolume = 0.85;
    /** Activar/desactivar acompañamiento armónico de acordes. */
    this.chordsEnabled = true;
    /** Volumen independiente del acompañamiento de acordes (0-1). */
    this.chordsVolume = 0.55;
    /** Volumen independiente de la voz de bajo (0-1). */
    this.bassVolume = 0.75;
    /** Activar/desactivar clic de metrónomo integrado durante la reproducción. */
    this.metronomeEnabled = true;
    /** Volumen del metrónomo integrado (0-1). */
    this.metronomeVolume = 0.65;
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
   * @param {object} timeline Línea de tiempo con notes, chords, beatsPerMeasure, totalBeats y measureCount.
   */
  loadTimeline(timeline) {
    this._timeline = timeline;
    if (timeline && timeline.measureCount > 0) {
      this.loopStartMeasure = Math.max(1, Math.min(this.loopStartMeasure, timeline.measureCount));
      this.loopEndMeasure = Math.max(this.loopStartMeasure, Math.min(this.loopEndMeasure, timeline.measureCount));
    }
  }

  /**
   * Actualiza parámetros de reproducción (BPM, volúmenes, bucle, instrumento, conteo).
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

    if (patch.bpm !== undefined) this.bpm = Math.max(40, Math.min(240, Math.round(Number(patch.bpm))));
    if (patch.instrument !== undefined) this.instrument = patch.instrument;
    if (patch.melodyVolume !== undefined) this.melodyVolume = Number(patch.melodyVolume);
    if (patch.chordsEnabled !== undefined) this.chordsEnabled = Boolean(patch.chordsEnabled);
    if (patch.chordsVolume !== undefined) this.chordsVolume = Number(patch.chordsVolume);
    if (patch.bassVolume !== undefined) this.bassVolume = Number(patch.bassVolume);
    if (patch.metronomeEnabled !== undefined) this.metronomeEnabled = Boolean(patch.metronomeEnabled);
    if (patch.metronomeVolume !== undefined) this.metronomeVolume = Number(patch.metronomeVolume);
    if (patch.countInMeasures !== undefined) this.countInMeasures = Math.max(0, Math.min(2, Number(patch.countInMeasures)));
    if (patch.loopEnabled !== undefined) this.loopEnabled = Boolean(patch.loopEnabled);
    if (patch.loopStartMeasure !== undefined) this.loopStartMeasure = Math.max(1, Number(patch.loopStartMeasure));
    if (patch.loopEndMeasure !== undefined) this.loopEndMeasure = Math.max(this.loopStartMeasure, Number(patch.loopEndMeasure));

    if (this._timeline && this._isPlaying) {
      this._recomputeRangeBeats();
    }
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

    // 1) Agenda eventos del conteo previo (pulsos negativos respecto a _rangeStartBeat)
    if (this._scheduledUntilBeat < this._rangeStartBeat) {
      const countStart = this._rangeStartBeat - this._countInTotalBeats;
      for (let b = countStart; b < this._rangeStartBeat - 0.0001; b += clickStep) {
        if (b > this._scheduledUntilBeat && b <= horizonBeat) {
          const t = this._beatToAudioTime(b);
          const relIndex = Math.round((b - countStart) / clickStep);
          const beatsInBar = Math.round(beatsPerMeasure / clickStep);
          const beatInBar = (relIndex % beatsInBar) + 1;
          this._metronome.playClickAt(t, beatInBar === 1 ? 'accent' : 'beat', this._metronome.soundType, Math.max(0.65, this.metronomeVolume));
          this._visualQueue.push({
            time: t,
            isCountIn: true,
            countInBeat: beatInBar,
            totalBeats: beatsInBar
          });
        }
      }
    }

    // 2) Agenda música dentro del tramo [_rangeStartBeat, _rangeEndBeat)
    const scheduleWindowStart = Math.max(this._scheduledUntilBeat, this._rangeStartBeat - 0.0001);
    const scheduleWindowEnd = Math.min(horizonBeat, this._rangeEndBeat);

    if (scheduleWindowEnd > scheduleWindowStart) {
      // Clic de metrónomo integrado
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

      // Notas de la partitura (melodía / bajo principal)
      for (const noteEv of tl.notes) {
        if (noteEv.beat > scheduleWindowStart && noteEv.beat <= scheduleWindowEnd && noteEv.beat < this._rangeEndBeat) {
          const t = this._beatToAudioTime(noteEv.beat);
          const durSec = Math.max(0.06, noteEv.durationBeats * secPerBeat);

          if (!noteEv.isRest && noteEv.midis.length > 0) {
            // Determina si la voz suena por canal de bajo o de melodía
            const isBassVoice = noteEv.isBassVoice || tl.isBassPiece;
            const vol = isBassVoice ? this.bassVolume : this.melodyVolume;
            const voiceInst = isBassVoice
              ? (this.instrument.includes('bass') ? this.instrument : 'acoustic-bass')
              : this.instrument;

            for (const midi of noteEv.midis) {
              this._playPluckedNote(ctx, midi, t, durSec, voiceInst, vol);
            }
          }

          this._visualQueue.push({
            time: t,
            isCountIn: false,
            noteEvent: noteEv,
            measureIndex: noteEv.measureIndex
          });
        }
      }

      // Acompañamiento de acordes cifrados (rasgueo cálido + bajo de acompañamiento si no es pieza de bajo)
      if (this.chordsEnabled && tl.chords.length > 0) {
        for (const chordEv of tl.chords) {
          if (chordEv.beat > scheduleWindowStart && chordEv.beat <= scheduleWindowEnd && chordEv.beat < this._rangeEndBeat) {
            const t = this._beatToAudioTime(chordEv.beat);
            const durSec = Math.max(0.25, chordEv.durationBeats * secPerBeat);
            this._playChordAccompaniment(ctx, chordEv.symbol, t, durSec, tl.isBassPiece);
          }
        }
      }
    }

    this._scheduledUntilBeat = Math.min(horizonBeat, this._rangeEndBeat);

    // 3) Comprueba fin de rango: bucle o finalización limpia
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
   * Bucle visual sincronizado con audioCtx.currentTime para resaltar la nota activa y eventos de fin.
   */
  _visualLoop() {
    if (!this._isPlaying) return;
    const ctx = this._metronome.ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    while (this._visualQueue.length > 0 && this._visualQueue[0].time <= now + 0.015) {
      const ev = this._visualQueue.shift();
      if (ev.isPassComplete) {
        if (typeof this.onPassComplete === 'function') this.onPassComplete();
        continue;
      }
      if (ev.isPlaybackEnd) {
        if (typeof this.onPassComplete === 'function') this.onPassComplete();
        this.stop();
        if (typeof this.onPlaybackEnd === 'function') this.onPlaybackEnd();
        return;
      }
      if (typeof this.onVisualEvent === 'function') {
        this.onVisualEvent(ev);
      }
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(() => this._visualLoop());
    }
  }

  /**
   * Sintetiza una nota pulsada en Web Audio API modelada según el instrumento elegido.
   * Funciona completamente offline sin requerir descarga de soundfonts externos.
   * @param {AudioContext} ctx Contexto Web Audio activo.
   * @param {number} midi Nota MIDI (ajustada a octava real del instrumento).
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
      osc2Gain.gain.setValueAtTime(0.16, safeStart);
      filter.frequency.setValueAtTime(Math.min(1400, freq * 4.5), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.8), safeStart + totalDur);
      masterGain.gain.setValueAtTime(0.001, safeStart);
      masterGain.gain.linearRampToValueAtTime(0.38 * volume, safeStart + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.001, safeStart + totalDur);
    } else {
      // acoustic-bass (contrabajo / bajo acústico pizzicato cálido)
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, safeStart);
      osc2Gain.gain.setValueAtTime(0.22, safeStart);
      filter.frequency.setValueAtTime(Math.min(950, freq * 3.4), safeStart);
      filter.frequency.exponentialRampToValueAtTime(Math.max(160, freq * 1.4), safeStart + totalDur * 0.85);
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
   * Reproduce un rasgueo suave de acompañamiento para el acorde cifrado y su nota de bajo si corresponde.
   * @param {AudioContext} ctx Contexto Web Audio.
   * @param {string} chordSymbol Símbolo del acorde americano.
   * @param {number} startTime Instante de inicio.
   * @param {number} duration Duración del acorde en segundos.
   * @param {boolean} isBassPiece Si true, evita duplicar el bajo para no tapar la línea de bajo principal.
   */
  _playChordAccompaniment(ctx, chordSymbol, startTime, duration, isBassPiece) {
    const voicing = getChordVoicingMidi(chordSymbol, 52);
    if (!voicing) return;

    if (this.chordsVolume > 0.01) {
      const strumSpread = 0.018;
      voicing.chordMidis.forEach((midi, idx) => {
        this._playPluckedNote(
          ctx,
          midi,
          startTime + idx * strumSpread,
          Math.min(duration, 1.8),
          'nylon-guitar',
          this.chordsVolume * 0.42
        );
      });
    }

    // Si la práctica es de guitarra y el canal de bajo tiene volumen, aporta la raíz grave de acompañamiento
    if (!isBassPiece && this.bassVolume > 0.01) {
      this._playPluckedNote(
        ctx,
        voicing.bassMidi - 12,
        startTime,
        Math.min(duration, 1.8),
        'acoustic-bass',
        this.bassVolume * 0.48
      );
    }
  }
}
