import { Observable } from '../../core/Observable.js';
import { normalizeCompingFeel } from '../../services/CompingEngineService.js';

/**
 * Sub-ViewModel del mezclador de audio del Reproductor.
 * Gestiona volúmenes independientes, mutes (acordes, bajo, metrónomo), modo de voces polifónicas,
 * timbre sintetizado, patrón de acompañamiento (comping) y persistencia de mezcla por práctica.
 */
export class PlayerMixerViewModel {
  /**
   * Inicializa el mezclador inyectando el AppViewModel (acceso al MixStore y notificaciones)
   * y callbacks de coordinación hacia el reproductor padre.
   * @param {object} deps Dependencias del mezclador.
   * @param {import('../AppViewModel.js').AppViewModel} deps.appVm ViewModel raíz.
   * @param {Function} deps.getPractice Función que devuelve la práctica activa actual.
   * @param {Function} deps.onConfigChanged Callback para sincronizar `AudioSynthService`.
   */
  constructor({ appVm, getPractice, onConfigChanged }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Proveedor de la práctica activa. */
    this._getPractice = getPractice;
    /** Callback para empujar cambios al sintetizador. */
    this._onConfigChanged = onConfigChanged;

    /** Instrumento de síntesis seleccionado. */
    this.synthInstrument = new Observable('acoustic-guitar');
    /** Patrón rítmico de acompañamiento (comping) editable en vivo. */
    this.compingPattern = new Observable('negras-abajo');
    /** Nivel de variación orgánica del acompañamiento ('fijo' | 'organico' | 'vivo'). */
    this.compingFeel = new Observable('organico');
    /** Volumen de melodía / voz principal (1.0 = 100 % por defecto). */
    this.melodyVolume = new Observable(1.0);
    /** Acompañamiento de acordes activado/desactivado. */
    this.chordsEnabled = new Observable(true);
    /** Volumen del acompañamiento de acordes (0-1). */
    this.chordsVolume = new Observable(0.55);
    /** Pista de bajo activada/desactivada (play-along). */
    this.bassEnabled = new Observable(true);
    /** Volumen independiente de la voz de bajo (0-1). */
    this.bassVolume = new Observable(0.75);
    /** Modo de voces en piezas polifónicas clásicas ('both' | 'v1' | 'v2'). */
    this.voiceMode = new Observable('both');
    /** Metrónomo integrado activado durante la reproducción. */
    this.metronomeEnabled = new Observable(true);
    /** Volumen del metrónomo integrado (0-1). */
    this.metronomeVolume = new Observable(0.65);
  }

  /**
   * Restaura timbre, comping y mezcla guardada (o voz principal al 100 %) al cargar una práctica.
   * @param {import('../../models/Practice.js').Practice|null} practice Práctica cargada.
   */
  loadForPractice(practice) {
    this.bassEnabled.set(true);
    this.voiceMode.set('both');
    if (!practice) return;

    const activeDefault = this._appVm.settings.value.defaultInstrument;
    const defaultSynth =
      activeDefault === 'piano' && practice.instruments.includes('piano')
        ? 'acoustic-piano'
        : practice.getDefaultSynthInstrument();
    this.synthInstrument.set(defaultSynth);
    const rawComping = practice.comping;
    const resolvedComping =
      typeof rawComping === 'object' && rawComping !== null ? rawComping.pattern : rawComping;
    this.compingPattern.set(resolvedComping || 'negras-abajo');
    const isPlayAlongStyle = Boolean(
      practice.type === 'harmony' ||
      ['jazz', 'blues', 'bossa', 'tango'].includes(practice.style) ||
      ['swing-negras', 'shuffle', 'blues-shuffle', 'bossa', 'tango-marcato'].includes(resolvedComping)
    );
    this.compingFeel.set(isPlayAlongStyle ? 'organico' : 'fijo');

    const mix = this._appVm.getPracticeMix(practice);
    this.melodyVolume.set(mix.melody);
    this.chordsVolume.set(mix.chords);
    this.bassVolume.set(mix.bass);
    this.metronomeVolume.set(mix.metronome);
    this.chordsEnabled.set(mix.chordsEnabled);
    this.metronomeEnabled.set(mix.metronomeEnabled);
  }

  /**
   * Devuelve el bloque de configuración listo para `AudioSynthService.configure(...)`.
   * @returns {object} Configuración de mezcla y timbre.
   */
  getAudioConfigPatch() {
    return {
      instrument: this.synthInstrument.value,
      melodyVolume: this.melodyVolume.value,
      chordsEnabled: this.chordsEnabled.value,
      chordsVolume: this.chordsVolume.value,
      bassEnabled: this.bassEnabled.value,
      bassVolume: this.bassVolume.value,
      voiceMode: this.voiceMode.value,
      metronomeEnabled: this.metronomeEnabled.value,
      metronomeVolume: this.metronomeVolume.value,
      comping: this.compingPattern.value,
      compingFeel: this.compingFeel.value
    };
  }

  /**
   * Ajusta el timbre de síntesis de forma coherente con el instrumento de digitación elegido.
   * @param {'guitarra'|'guitarra-clasica'|'bajo'|'bajo-5'|'piano'} voicingInst Instrumento normalizado.
   */
  applyTimbreForVoicingInstrument(voicingInst) {
    if (voicingInst === 'piano') {
      this.synthInstrument.set('acoustic-piano');
    } else if (voicingInst === 'bajo' || voicingInst === 'bajo-5') {
      this.synthInstrument.set('electric-bass');
    } else if (voicingInst === 'guitarra-clasica') {
      this.synthInstrument.set('nylon-guitar');
    } else {
      this.synthInstrument.set('acoustic-guitar');
    }
  }

  /**
   * Cambia el patrón de acompañamiento (comping) en vivo sin modificar la práctica.
   * @param {string} pattern Clave en COMPING_PATTERNS.
   */
  setCompingPattern(pattern) {
    this.compingPattern.set(pattern);
    this._onConfigChanged({ comping: pattern });
  }

  /**
   * Cambia el modo de interpretación del acompañamiento ('fijo' | 'organico' | 'vivo') en vivo.
   * @param {'fijo'|'organico'|'vivo'} feel Modo elegido.
   */
  setCompingFeel(feel) {
    const safe = normalizeCompingFeel(feel);
    this.compingFeel.set(safe);
    this._onConfigChanged({ compingFeel: safe });
  }

  /**
   * Selecciona el instrumento de síntesis (nylon, acústica, bajo eléctrico o acústico).
   * @param {string} instrument Clave de timbre.
   */
  setSynthInstrument(instrument) {
    this.synthInstrument.set(instrument);
    this._onConfigChanged();
  }

  /**
   * Ajusta volúmenes independientes y persiste la mezcla propia de la práctica activa.
   * @param {{ melody?: number, chords?: number, bass?: number, metronome?: number }} volumes Volúmenes.
   */
  setVolumes(volumes = {}) {
    const safe = (v, prev) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : prev;
    };
    if (volumes.melody !== undefined) this.melodyVolume.set(safe(volumes.melody, this.melodyVolume.value));
    if (volumes.chords !== undefined) this.chordsVolume.set(safe(volumes.chords, this.chordsVolume.value));
    if (volumes.bass !== undefined) this.bassVolume.set(safe(volumes.bass, this.bassVolume.value));
    if (volumes.metronome !== undefined) this.metronomeVolume.set(safe(volumes.metronome, this.metronomeVolume.value));
    this._onConfigChanged();
    this._persistCurrentMix();
  }

  /**
   * Activa o desactiva el acompañamiento reproducible de acordes y persiste en la mezcla.
   * @param {boolean} enabled Nuevo estado.
   */
  setChordsEnabled(enabled) {
    this.chordsEnabled.set(Boolean(enabled));
    this._onConfigChanged();
    this._persistCurrentMix();
  }

  /**
   * Activa o silencia la pista de bajo para estudiar play-along.
   * @param {boolean} enabled True para escuchar el bajo de base.
   */
  setBassEnabled(enabled) {
    this.bassEnabled.set(Boolean(enabled));
    this._onConfigChanged();
  }

  /**
   * Activa o desactiva el metrónomo integrado y persiste en la mezcla.
   * @param {boolean} enabled Nuevo estado.
   */
  setMetronomeEnabled(enabled) {
    this.metronomeEnabled.set(Boolean(enabled));
    this._onConfigChanged();
    this._persistCurrentMix();
  }

  /**
   * Cambia el modo de voces en piezas polifónicas clásicas ('both' | 'v1' | 'v2').
   * @param {'both'|'v1'|'v2'} mode Voces activas.
   */
  setVoiceMode(mode) {
    if (['both', 'v1', 'v2'].includes(mode)) {
      this.voiceMode.set(mode);
      this._onConfigChanged();
    }
  }

  /**
   * Restablece el mezclador de la práctica activa a sus niveles predeterminados (melodía 100 %).
   * @returns {Promise<void>}
   */
  async resetPracticeMix() {
    const pr = this._getPractice();
    if (!pr) return;
    await this._appVm.resetPracticeMix(pr.id);
    const mix = this._appVm.getPracticeMix(pr);
    this.melodyVolume.set(mix.melody);
    this.chordsVolume.set(mix.chords);
    this.bassVolume.set(mix.bass);
    this.metronomeVolume.set(mix.metronome);
    this.chordsEnabled.set(mix.chordsEnabled);
    this.metronomeEnabled.set(mix.metronomeEnabled);
    this._onConfigChanged();
    this._appVm.showSnackbar('Mezcla restablecida (voz principal al 100 %).');
  }

  /**
   * Persiste la mezcla actual en el MixStore para la práctica activa.
   */
  _persistCurrentMix() {
    const pr = this._getPractice();
    if (!pr) return;
    this._appVm.savePracticeMix(pr.id, {
      melody: this.melodyVolume.value,
      chords: this.chordsVolume.value,
      bass: this.bassVolume.value,
      metronome: this.metronomeVolume.value,
      chordsEnabled: this.chordsEnabled.value,
      metronomeEnabled: this.metronomeEnabled.value
    });
  }

  /**
   * Libera recursos del mezclador.
   */
  dispose() {
    // Sin suscripciones ni timers propios; contrato uniforme de ciclo de vida
  }
}
