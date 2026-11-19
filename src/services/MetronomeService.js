import { parseTimeSignature } from '../core/MusicTheory.js';

/**
 * Intervalo de sondeo del scheduler de anticipación en milisegundos.
 * No marca el pulso musical: solo despierta la rutina para agendar eventos en AudioContext.
 */
const SCHEDULER_POLL_MS = 25;

/**
 * Ventana de anticipación (lookahead) en segundos para agendar sonidos en Web Audio API.
 */
const SCHEDULE_AHEAD_SEC = 0.12;

/**
 * Servicio de metrónomo de alta precisión basado en Web Audio API con scheduler de anticipación.
 * Calcula cada pulso desde un tiempo ancla y un índice entero para evitar cualquier deriva
 * temporal incluso tras sesiones de más de 10 minutos.
 */
export class MetronomeService {
  /**
   * Inicializa el metrónomo con parámetros musicales predeterminados.
   */
  constructor() {
    /** Instancia compartida de AudioContext (creada al primer gesto del usuario). */
    this._audioCtx = null;
    /** Estado booleano de ejecución del metrónomo. */
    this._isRunning = false;
    /** Identificador del temporizador de sondeo del scheduler (setTimeout, nunca pulso). */
    this._schedulerTimer = null;
    /** Identificador del bucle requestAnimationFrame para sincronización visual. */
    this._rafId = null;

    /** Tempo actual en negras por minuto (40-240). */
    this.bpm = 90;
    /** Compás actual (ej. "4/4", "6/8"). */
    this.timeSignature = '4/4';
    /** Subdivisiones por pulso: 1 (negra), 2 (corchea), 3 (tresillo), 4 (semicorchea). */
    this.subdivision = 1;
    /** Acentuar el primer tiempo de cada compás. */
    this.accentFirstBeat = true;
    /** Timbre sintetizado ('woodblock' | 'click' | 'rimshot' | 'beep'). */
    this.soundType = 'woodblock';
    /** Volumen maestro del metrónomo (0 a 1). */
    this.volume = 0.8;

    /** Modo entrenador de velocidad activado. */
    this.speedTrainerEnabled = false;
    /** Incremento de BPM en modo entrenador de velocidad. */
    this.speedTrainerStepBpm = 5;
    /** Cantidad de compases antes de subir el tempo. */
    this.speedTrainerEveryBars = 4;
    /** Tempo objetivo máximo del entrenador de velocidad. */
    this.speedTrainerTargetBpm = 140;

    /** Modo compás silencioso activado para entrenar tiempo interno. */
    this.silentBarEnabled = false;
    /** Compases que suenan antes de silenciar. */
    this.silentPlayBars = 3;
    /** Compases que quedan en silencio en cada ciclo. */
    this.silentMuteBars = 1;

    /** Tiempo de anclaje en audioCtx.currentTime del segmento de tempo actual. */
    this._anchorTime = 0;
    /** Índice entero de subdivisión dentro del segmento de tempo actual (evita deriva acumulada). */
    this._segmentStep = 0;
    /** Índice de pulso actual dentro del compás (0..beats-1). */
    this._currentBeat = 0;
    /** Índice de subdivisión actual dentro del pulso (0..subdivision-1). */
    this._currentSub = 0;
    /** Contador acumulado de compases ejecutados. */
    this._barCounter = 0;

    /** Cola de eventos visuales agendados para disparar exactamente al llegar a currentTime. */
    this._visualQueue = [];
    /** Callback notificado en cada pulso visual: ({ beat, totalBeats, subdivision, isAccent, isMuted, barIndex }). */
    this.onBeat = null;
    /** Callback notificado cuando el entrenador de velocidad actualiza el BPM. */
    this.onBpmChanged = null;
  }

  /**
   * Devuelve o crea el AudioContext del navegador, reanudándolo si estaba suspendido.
   * @returns {AudioContext|null} Contexto de audio activo.
   */
  ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this._audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this._audioCtx = new AudioCtx();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    return this._audioCtx;
  }

  /**
   * Indica si el metrónomo está sonando actualmente.
   * @returns {boolean} True si está en marcha.
   */
  get isRunning() {
    return this._isRunning;
  }

  /**
   * Calcula la duración exacta en segundos de una subdivisión para el BPM y compás actuales.
   * @returns {number} Duración de cada paso en segundos.
   */
  getStepDurationSeconds() {
    const { beatUnit } = parseTimeSignature(this.timeSignature);
    // Para compases con denominador 8 (6/8, 7/8), cada pulso numerado dura media negra
    const beatScale = beatUnit === 8 ? 0.5 : 1;
    const secondsPerBeat = (60 / this.bpm) * beatScale;
    return secondsPerBeat / Math.max(1, this.subdivision);
  }

  /**
   * Actualiza la configuración del metrónomo y re-ancla el reloj sin saltos si está sonando.
   * @param {object} patch Propiedades a actualizar.
   */
  configure(patch = {}) {
    const tempoChanged =
      (patch.bpm !== undefined && Number(patch.bpm) !== this.bpm) ||
      (patch.subdivision !== undefined && Number(patch.subdivision) !== this.subdivision) ||
      (patch.timeSignature !== undefined && patch.timeSignature !== this.timeSignature);

    if (tempoChanged && this._isRunning && this._audioCtx) {
      // Calcula el instante del próximo paso antes de cambiar la duración para re-anclar sin salto
      const nextTime = this._anchorTime + this._segmentStep * this.getStepDurationSeconds();
      this._anchorTime = nextTime;
      this._segmentStep = 0;
    }

    if (patch.bpm !== undefined) this.bpm = Math.max(40, Math.min(240, Math.round(Number(patch.bpm))));
    if (patch.timeSignature !== undefined) this.timeSignature = patch.timeSignature;
    if (patch.subdivision !== undefined) this.subdivision = Math.max(1, Math.min(4, Number(patch.subdivision)));
    if (patch.accentFirstBeat !== undefined) this.accentFirstBeat = Boolean(patch.accentFirstBeat);
    if (patch.soundType !== undefined) this.soundType = patch.soundType;
    if (patch.volume !== undefined) this.volume = Math.max(0, Math.min(1, Number(patch.volume)));

    if (patch.speedTrainerEnabled !== undefined) this.speedTrainerEnabled = Boolean(patch.speedTrainerEnabled);
    if (patch.speedTrainerStepBpm !== undefined) this.speedTrainerStepBpm = Math.max(1, Math.min(30, Number(patch.speedTrainerStepBpm)));
    if (patch.speedTrainerEveryBars !== undefined) this.speedTrainerEveryBars = Math.max(1, Math.min(32, Number(patch.speedTrainerEveryBars)));
    if (patch.speedTrainerTargetBpm !== undefined) this.speedTrainerTargetBpm = Math.max(40, Math.min(240, Number(patch.speedTrainerTargetBpm)));

    if (patch.silentBarEnabled !== undefined) this.silentBarEnabled = Boolean(patch.silentBarEnabled);
    if (patch.silentPlayBars !== undefined) this.silentPlayBars = Math.max(1, Math.min(16, Number(patch.silentPlayBars)));
    if (patch.silentMuteBars !== undefined) this.silentMuteBars = Math.max(1, Math.min(8, Number(patch.silentMuteBars)));
  }

  /**
   * Inicia el metrónomo con el scheduler de anticipación de Web Audio API.
   */
  start() {
    if (this._isRunning) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    this._isRunning = true;
    this._currentBeat = 0;
    this._currentSub = 0;
    this._barCounter = 0;
    this._visualQueue = [];
    this._anchorTime = ctx.currentTime + 0.05;
    this._segmentStep = 0;

    this._scheduleLoop();
    this._visualLoop();
  }

  /**
   * Detiene el metrónomo y limpia temporizadores pendientes.
   */
  stop() {
    this._isRunning = false;
    if (this._schedulerTimer !== null) {
      clearTimeout(this._schedulerTimer);
      this._schedulerTimer = null;
    }
    if (this._rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._visualQueue = [];
  }

  /**
   * Bucle de anticipación: agenda todos los pulsos que caigan dentro de los próximos SCHEDULE_AHEAD_SEC segundos.
   */
  _scheduleLoop() {
    if (!this._isRunning || !this._audioCtx) return;
    const ctx = this._audioCtx;

    while (true) {
      const stepDuration = this.getStepDurationSeconds();
      const eventTime = this._anchorTime + this._segmentStep * stepDuration;
      if (eventTime >= ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        break;
      }
      this._scheduleSingleStep(eventTime);
      this._advanceStep(eventTime);
    }

    this._schedulerTimer = setTimeout(() => this._scheduleLoop(), SCHEDULER_POLL_MS);
  }

  /**
   * Agenda el audio y el evento visual correspondiente a la subdivisión actual.
   * @param {number} time Instante exacto en el reloj del AudioContext.
   */
  _scheduleSingleStep(time) {
    const { beats } = parseTimeSignature(this.timeSignature);
    const isMainBeat = this._currentSub === 0;
    const isAccent = isMainBeat && this._currentBeat === 0 && this.accentFirstBeat;

    // Determina si el compás actual pertenece al tramo silencioso del modo tiempo interno
    let isMuted = false;
    if (this.silentBarEnabled) {
      const cycleLen = this.silentPlayBars + this.silentMuteBars;
      const posInCycle = this._barCounter % cycleLen;
      isMuted = posInCycle >= this.silentPlayBars;
    }

    if (!isMuted) {
      const kind = isAccent ? 'accent' : isMainBeat ? 'beat' : 'sub';
      this.playClickAt(time, kind, this.soundType, this.volume);
    }

    this._visualQueue.push({
      time,
      beat: this._currentBeat + 1,
      totalBeats: beats,
      subdivision: this._currentSub + 1,
      isMainBeat,
      isAccent,
      isMuted,
      barIndex: this._barCounter + 1
    });
  }

  /**
   * Avanza los contadores de subdivisión, pulso y compás, aplicando el entrenador de velocidad al cerrar compases.
   * @param {number} scheduledTime Instante agendado del paso actual.
   */
  _advanceStep(scheduledTime) {
    const { beats } = parseTimeSignature(this.timeSignature);
    const prevStepDur = this.getStepDurationSeconds();

    this._segmentStep += 1;
    this._currentSub += 1;

    if (this._currentSub >= this.subdivision) {
      this._currentSub = 0;
      this._currentBeat += 1;
      if (this._currentBeat >= beats) {
        this._currentBeat = 0;
        this._barCounter += 1;

        // Entrenador de velocidad: incrementa BPM cada N compases sin superar el objetivo
        if (
          this.speedTrainerEnabled &&
          this._barCounter > 0 &&
          this._barCounter % this.speedTrainerEveryBars === 0 &&
          this.bpm < this.speedTrainerTargetBpm
        ) {
          const nextBpm = Math.min(this.speedTrainerTargetBpm, this.bpm + this.speedTrainerStepBpm);
          if (nextBpm !== this.bpm) {
            this._anchorTime = scheduledTime + prevStepDur;
            this._segmentStep = 0;
            this.bpm = nextBpm;
            if (typeof this.onBpmChanged === 'function') {
              this.onBpmChanged(this.bpm);
            }
          }
        }
      }
    }
  }

  /**
   * Sincroniza la notificación visual de cada pulso con el reloj de audio usando requestAnimationFrame.
   */
  _visualLoop() {
    if (!this._isRunning || !this._audioCtx) return;
    const now = this._audioCtx.currentTime;

    while (this._visualQueue.length > 0 && this._visualQueue[0].time <= now + 0.01) {
      const ev = this._visualQueue.shift();
      if (typeof this.onBeat === 'function') {
        this.onBeat(ev);
      }
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(() => this._visualLoop());
    }
  }

  /**
   * Sintetiza un clic de metrónomo en el instante exacto de Web Audio API.
   * Reutilizado también por AudioSynthService para el conteo previo y el clic integrado.
   * @param {number} time Instante exacto en audioCtx.currentTime.
   * @param {'accent'|'beat'|'sub'} [kind='beat'] Jerarquía métrica del clic.
   * @param {'woodblock'|'click'|'rimshot'|'beep'} [soundType='woodblock'] Timbre del clic.
   * @param {number} [volume=0.8] Volumen entre 0 y 1.
   */
  playClickAt(time, kind = 'beat', soundType = this.soundType, volume = this.volume) {
    const ctx = this.ensureAudioContext();
    if (!ctx || volume <= 0.001) return;

    const safeTime = Math.max(ctx.currentTime, time);
    const gainLevel = (kind === 'accent' ? 0.85 : kind === 'beat' ? 0.58 : 0.3) * volume;

    if (soundType === 'rimshot') {
      // Síntesis percusiva con ruido filtrado + cuerpo corto
      const bufferSize = Math.floor(ctx.sampleRate * 0.035);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = kind === 'accent' ? 2400 : kind === 'beat' ? 1600 : 1100;
      filter.Q.value = 3.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainLevel, safeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.035);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(safeTime);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (soundType === 'woodblock') {
      osc.type = 'triangle';
      const baseFreq = kind === 'accent' ? 1180 : kind === 'beat' ? 840 : 620;
      osc.frequency.setValueAtTime(baseFreq, safeTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, safeTime + 0.045);
      gain.gain.setValueAtTime(gainLevel, safeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(safeTime);
      osc.stop(safeTime + 0.055);
    } else if (soundType === 'click') {
      osc.type = 'square';
      const freq = kind === 'accent' ? 1800 : kind === 'beat' ? 1200 : 880;
      osc.frequency.setValueAtTime(freq, safeTime);
      gain.gain.setValueAtTime(gainLevel * 0.65, safeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.022);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(safeTime);
      osc.stop(safeTime + 0.028);
    } else {
      // 'beep' suave sinusoidal
      osc.type = 'sine';
      const freq = kind === 'accent' ? 987.77 : kind === 'beat' ? 659.25 : 493.88;
      osc.frequency.setValueAtTime(freq, safeTime);
      gain.gain.setValueAtTime(gainLevel * 0.7, safeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(safeTime);
      osc.stop(safeTime + 0.075);
    }
  }
}
