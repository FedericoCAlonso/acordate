import { getChordVoicingMidi } from '../../core/MusicTheory.js';
import { Observable } from '../../core/Observable.js';

/**
 * Sub-ViewModel de audio y pedal armónico modal (drone) del módulo Escalas y Modos.
 * Gestiona la reproducción de escalas, modos en paralelo, notas puntuales, acordes asociados
 * y el resaltado MIDI en tiempo real sobre el diapasón SVG.
 */
export class ScaleAudioController {
  /**
   * Construye el controlador de audio modal.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({ scaleCatalogService, audioService, getState }) {
    /** Servicio de escalas para generar secuencias MIDI y acordes drone. */
    this._scales = scaleCatalogService;
    /** Sintetizador Web Audio. */
    this._audio = audioService;
    /** Lector del estado actual de escala/raíz/instrumento/patrón/tempo. */
    this._getState = getState;

    /** Indica si el pedal armónico modal (drone) está sonando actualmente. */
    this.droneActive = new Observable(false);
    /** Indica si se está reproduciendo una secuencia de escala o patrón. */
    this.isPlayingSequence = new Observable(false);
    /** Altura MIDI real resaltada actualmente en el diapasón SVG durante reproducción. */
    this.activeHighlightMidi = new Observable(null);
  }

  /** Resuelve el timbre sintetizado coherente con el instrumento de digitación activo. */
  _getTimbre() {
    const inst = this._getState().voicingInstrument;
    if (inst === 'guitarra-clasica') return 'nylon-guitar';
    if (inst === 'bajo' || inst === 'bajo-5') return 'electric-bass';
    return 'acoustic-guitar';
  }

  /** Enciende o apaga el pedal armónico modal sostenido (drone). */
  toggleDrone() {
    if (this.droneActive.value) {
      this._audio.stopDrone();
      this.droneActive.set(false);
    } else {
      this.droneActive.set(true);
      this.refreshDroneIfActive();
    }
  }

  /** Refresca el drone modal con las alturas actuales si está encendido. */
  refreshDroneIfActive() {
    if (!this.droneActive.value) return;
    const st = this._getState();
    const { droneMidis } = this._scales.buildStudySequence({
      root: st.root,
      scaleId: st.scaleId,
      voicingInstrument: st.voicingInstrument,
      pattern: 'asc-desc',
      octaves: 1
    });
    this._audio.startDrone(droneMidis, { volume: 0.25 });
  }

  /** Reproduce la escala o el patrón elegido iluminando cada nota en el diapasón SVG. */
  playCurrentScale(overridePattern = null) {
    const st = this._getState();
    const { midis, droneMidis } = this._scales.buildStudySequence({
      root: st.root,
      scaleId: st.scaleId,
      voicingInstrument: st.voicingInstrument,
      pattern: overridePattern || st.studyPattern,
      octaves: st.octaves,
      classicalMelodicDesc: st.classicalMelodicDesc
    });
    this.isPlayingSequence.set(true);
    this._audio.playScaleSequence(midis, {
      bpm: st.bpm,
      instrument: this._getTimbre(),
      useDrone: !this.droneActive.value,
      droneMidis,
      onStep: (midi) => this.activeHighlightMidi.set(midi),
      onEnd: () => {
        this.isPlayingSequence.set(false);
        this.activeHighlightMidi.set(null);
      }
    });
  }

  /** Escucha cualquier modo paralelo desde la raíz actual con su pedal armónico. */
  playParallelMode(modeId) {
    const st = this._getState();
    const { midis, droneMidis } = this._scales.buildStudySequence({
      root: st.root,
      scaleId: modeId,
      voicingInstrument: st.voicingInstrument,
      pattern: 'asc-desc',
      octaves: 1
    });
    this.isPlayingSequence.set(true);
    this._audio.playScaleSequence(midis, {
      bpm: st.bpm,
      instrument: this._getTimbre(),
      useDrone: true,
      droneMidis,
      onStep: (midi) => this.activeHighlightMidi.set(midi),
      onEnd: () => {
        this.isPlayingSequence.set(false);
        this.activeHighlightMidi.set(null);
      }
    });
  }

  /** Suena una nota puntual al tocar el diapasón SVG. */
  playSingleNote(midi) {
    if (!Number.isFinite(midi)) return;
    this._audio.playVoicing([midi], {
      mode: 'block',
      instrument: this._getTimbre(),
      duration: 1.2,
      volume: 0.9
    });
  }

  /** Reproduce un acorde asociado desde su chip armónico. */
  playAssociatedChord(chordSymbol) {
    const timbre = this._getTimbre();
    const voicing = getChordVoicingMidi(chordSymbol, timbre === 'electric-bass' ? 43 : 52);
    if (!voicing) return;
    this._audio.playVoicing([voicing.bassMidi, ...voicing.chordMidis], {
      mode: timbre === 'electric-bass' ? 'block' : 'strum-down',
      instrument: timbre,
      duration: 1.6,
      volume: 0.85
    });
  }

  /** Detiene toda reproducción de escala y el pedal armónico modal. */
  stopAudio() {
    this._audio.stopScaleSequence();
    this._audio.stopDrone();
    this.droneActive.set(false);
    this.isPlayingSequence.set(false);
    this.activeHighlightMidi.set(null);
  }

  /** Detiene audio y drone al destruir el controlador. */
  dispose() {
    this.stopAudio();
  }
}
