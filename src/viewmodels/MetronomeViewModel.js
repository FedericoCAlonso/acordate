import { Observable } from '../core/Observable.js';
import { parseTimeSignature } from '../core/MusicTheory.js';

/**
 * Compases sugeridos de acceso rápido en la interfaz del metrónomo.
 */
export const METRONOME_TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];

/**
 * ViewModel del metrónomo independiente.
 * Expone observables de tempo, compás, subdivisiones, tap tempo, entrenador de velocidad,
 * modo compás silencioso y pulso visual sincronizado.
 */
export class MetronomeViewModel {
  /**
   * Inicializa el ViewModel inyectando el servicio de metrónomo y opcionalmente el AppViewModel.
   * @param {import('../services/MetronomeService.js').MetronomeService} metronomeService Servicio Web Audio.
   * @param {import('./AppViewModel.js').AppViewModel} [appVm] ViewModel global para leer ajustes por defecto.
   */
  constructor(metronomeService, appVm = null) {
    /** Servicio de audio de metrónomo de precisión. */
    this._metronome = metronomeService;
    /** Referencia opcional al AppViewModel. */
    this._appVm = appVm;

    /** Indica si el metrónomo está sonando. */
    this.isRunning = new Observable(false);
    /** Tempo en BPM (40-240). */
    this.bpm = new Observable(90);
    /** Compás actual (ej. "4/4"). */
    this.timeSignature = new Observable('4/4');
    /** Subdivisiones por pulso (1, 2, 3 o 4). */
    this.subdivision = new Observable(1);
    /** Acentuar el primer pulso del compás. */
    this.accentFirstBeat = new Observable(true);
    /** Timbre de clic seleccionado. */
    this.soundType = new Observable(appVm?.settings?.value?.metronomeSound || 'woodblock');
    /** Volumen del metrónomo (0 a 1). */
    this.volume = new Observable(0.8);

    /** Pulso visual actualmente iluminado (1..totalBeats, 0 cuando está detenido). */
    this.currentBeat = new Observable(0);
    /** Cantidad total de pulsos del compás activo. */
    this.totalBeats = new Observable(4);
    /** Indica si el pulso actual es el acento principal. */
    this.isAccentBeat = new Observable(false);
    /** Indica si el compás actual está silenciado por el modo tiempo interno. */
    this.isMutedBar = new Observable(false);
    /** Contador de compases transcurridos desde el inicio. */
    this.barCounter = new Observable(0);

    /** Modo entrenador de velocidad activo. */
    this.speedTrainerEnabled = new Observable(false);
    /** Aumento de BPM por ciclo del entrenador. */
    this.speedTrainerStepBpm = new Observable(5);
    /** Cada cuántos compases aumenta el BPM. */
    this.speedTrainerEveryBars = new Observable(4);
    /** Tempo objetivo máximo del entrenador. */
    this.speedTrainerTargetBpm = new Observable(140);

    /** Modo compás silencioso activo. */
    this.silentBarEnabled = new Observable(false);
    /** Compases audibles por ciclo. */
    this.silentPlayBars = new Observable(3);
    /** Compases silenciosos por ciclo. */
    this.silentMuteBars = new Observable(1);

    /** Registro de marcas temporales para el cálculo de Tap Tempo. */
    this._tapTimestamps = [];
    /** Mensaje informativo de tap tempo. */
    this.tapHint = new Observable('Tocá varias veces al ritmo deseado');

    // Handlers ligados a esta instancia para re-vincular en start() y limpiar solo los propios en dispose()
    /** Handler propio de pulso principal del metrónomo. */
    this._onBeatHandler = (ev) => {
      if (ev.isMainBeat) {
        this.currentBeat.set(ev.beat, true);
        this.totalBeats.set(ev.totalBeats);
        this.isAccentBeat.set(ev.isAccent);
        this.isMutedBar.set(ev.isMuted);
        this.barCounter.set(ev.barIndex);
      }
    };
    /** Handler propio de cambio de BPM del entrenador de velocidad. */
    this._onBpmChangedHandler = (nextBpm) => {
      this.bpm.set(nextBpm);
    };
    this._bindMetronomeCallbacks();

    /** Desuscripción guardada de `appVm.settings`. */
    this._unsubSettings = appVm?.settings
      ? appVm.settings.subscribe((s) => {
          if (s?.metronomeSound) {
            this.setSoundType(s.metronomeSound);
          }
        })
      : null;

    this._syncService();
  }

  /**
   * Registra los callbacks de esta instancia en `MetronomeService` (evita quedar roto si otro módulo usó el metrónomo).
   */
  _bindMetronomeCallbacks() {
    this._metronome.onBeat = this._onBeatHandler;
    this._metronome.onBpmChanged = this._onBpmChangedHandler;
  }

  /**
   * Empuja todos los valores observables actuales hacia el servicio de metrónomo.
   */
  _syncService() {
    this._metronome.configure({
      bpm: this.bpm.value,
      timeSignature: this.timeSignature.value,
      subdivision: this.subdivision.value,
      accentFirstBeat: this.accentFirstBeat.value,
      soundType: this.soundType.value,
      volume: this.volume.value,
      speedTrainerEnabled: this.speedTrainerEnabled.value,
      speedTrainerStepBpm: this.speedTrainerStepBpm.value,
      speedTrainerEveryBars: this.speedTrainerEveryBars.value,
      speedTrainerTargetBpm: this.speedTrainerTargetBpm.value,
      silentBarEnabled: this.silentBarEnabled.value,
      silentPlayBars: this.silentPlayBars.value,
      silentMuteBars: this.silentMuteBars.value
    });
  }

  /**
   * Inicia el metrónomo independiente re-vinculando sus callbacks visuales.
   */
  start() {
    this._bindMetronomeCallbacks();
    this._syncService();
    this._metronome.start();
    this.isRunning.set(true);
  }

  /**
   * Detiene el metrónomo y resetea el indicador visual.
   */
  stop() {
    this._metronome.stop();
    this.isRunning.set(false);
    this.currentBeat.set(0);
    this.isMutedBar.set(false);
  }

  /**
   * Alterna entre iniciar y detener el metrónomo.
   */
  toggle() {
    if (this.isRunning.value) this.stop();
    else this.start();
  }

  /**
   * Establece el tempo en BPM acotado al rango [40, 240].
   * @param {number} bpm Nuevo tempo.
   */
  setBpm(bpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(Number(bpm) || 90)));
    this.bpm.set(clamped);
    this._metronome.configure({ bpm: clamped });
  }

  /**
   * Incrementa o reduce el BPM actual en un delta determinado.
   * @param {number} delta Cambio en BPM (puede ser negativo).
   */
  stepBpm(delta) {
    this.setBpm(this.bpm.value + Number(delta));
  }

  /**
   * Calcula el tempo promedio a partir de toques consecutivos (Tap Tempo).
   * @param {number} [nowMs=Date.now()] Marca temporal del toque en milisegundos.
   * @returns {number|null} BPM calculado o null si solo hubo un toque.
   */
  tapTempo(nowMs = Date.now()) {
    const last = this._tapTimestamps[this._tapTimestamps.length - 1];
    // Si pasó más de 2.2 segundos desde el último toque, reinicia la serie
    if (last && nowMs - last > 2200) {
      this._tapTimestamps = [];
    }
    this._tapTimestamps.push(nowMs);
    if (this._tapTimestamps.length > 6) {
      this._tapTimestamps.shift();
    }

    if (this._tapTimestamps.length < 2) {
      this.tapHint.set('Seguí marcando el pulso…');
      return null;
    }

    let totalDiff = 0;
    for (let i = 1; i < this._tapTimestamps.length; i++) {
      totalDiff += this._tapTimestamps[i] - this._tapTimestamps[i - 1];
    }
    const avgMs = totalDiff / (this._tapTimestamps.length - 1);
    const computedBpm = Math.max(40, Math.min(240, Math.round(60000 / avgMs)));
    this.setBpm(computedBpm);
    this.tapHint.set(`Detectado: ${computedBpm} BPM (${this._tapTimestamps.length} toques)`);
    return computedBpm;
  }

  /**
   * Cambia el compás del metrónomo y actualiza la cantidad de indicadores visuales.
   * @param {string} ts Compás (ej. "6/8").
   */
  setTimeSignature(ts) {
    const { beats } = parseTimeSignature(ts);
    this.timeSignature.set(ts);
    this.totalBeats.set(beats);
    this._metronome.configure({ timeSignature: ts });
  }

  /**
   * Cambia la subdivisión por pulso (1 = negra, 2 = corchea, 3 = tresillo, 4 = semicorchea).
   * @param {number} sub Subdivisión.
   */
  setSubdivision(sub) {
    const safe = Math.max(1, Math.min(4, Number(sub) || 1));
    this.subdivision.set(safe);
    this._metronome.configure({ subdivision: safe });
  }

  /**
   * Activa o desactiva el acento en el primer tiempo.
   * @param {boolean} enabled Nuevo valor.
   */
  setAccentFirstBeat(enabled) {
    this.accentFirstBeat.set(Boolean(enabled));
    this._metronome.configure({ accentFirstBeat: Boolean(enabled) });
  }

  /**
   * Cambia el sonido sintetizado del clic.
   * @param {'woodblock'|'click'|'rimshot'|'beep'} sound Timbre elegido.
   */
  setSoundType(sound) {
    this.soundType.set(sound);
    this._metronome.configure({ soundType: sound });
  }

  /**
   * Ajusta el volumen del metrónomo (0 a 1).
   * @param {number} vol Volumen.
   */
  setVolume(vol) {
    const safe = Math.max(0, Math.min(1, Number(vol)));
    this.volume.set(safe);
    this._metronome.configure({ volume: safe });
  }

  /**
   * Actualiza los parámetros del modo entrenador de velocidad.
   * @param {{ enabled?: boolean, stepBpm?: number, everyBars?: number, targetBpm?: number }} cfg Configuración.
   */
  setSpeedTrainer(cfg = {}) {
    if (cfg.enabled !== undefined) this.speedTrainerEnabled.set(Boolean(cfg.enabled));
    if (cfg.stepBpm !== undefined) this.speedTrainerStepBpm.set(Math.max(1, Math.min(30, Number(cfg.stepBpm))));
    if (cfg.everyBars !== undefined) this.speedTrainerEveryBars.set(Math.max(1, Math.min(32, Number(cfg.everyBars))));
    if (cfg.targetBpm !== undefined) this.speedTrainerTargetBpm.set(Math.max(40, Math.min(240, Number(cfg.targetBpm))));
    this._syncService();
  }

  /**
   * Actualiza los parámetros del modo compás silencioso para entrenar el tiempo interno.
   * @param {{ enabled?: boolean, playBars?: number, muteBars?: number }} cfg Configuración.
   */
  setSilentBars(cfg = {}) {
    if (cfg.enabled !== undefined) this.silentBarEnabled.set(Boolean(cfg.enabled));
    if (cfg.playBars !== undefined) this.silentPlayBars.set(Math.max(1, Math.min(16, Number(cfg.playBars))));
    if (cfg.muteBars !== undefined) this.silentMuteBars.set(Math.max(1, Math.min(8, Number(cfg.muteBars))));
    this._syncService();
  }

  /**
   * Detiene el metrónomo y libera suscripciones y callbacks propios del servicio singleton.
   */
  dispose() {
    this.stop();
    if (this._unsubSettings) {
      this._unsubSettings();
      this._unsubSettings = null;
    }
    if (this._metronome.onBeat === this._onBeatHandler) this._metronome.onBeat = null;
    if (this._metronome.onBpmChanged === this._onBpmChangedHandler) this._metronome.onBpmChanged = null;
  }
}
