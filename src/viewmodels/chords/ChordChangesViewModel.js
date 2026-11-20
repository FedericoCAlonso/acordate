import { ALL_KEYS } from '../../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../../core/Observable.js';
import { Chord } from '../../models/Chord.js';

/**
 * Sub-ViewModel de la pestaña Cambios y Voces (#/acordes/cambios).
 * Coordina el Entrenador de Cambios (con metrónomo y registro CPM sin pisar `MetronomeViewModel`),
 * Conducción de voces editable e Inversiones por el mango (guitarra y bajo 4/5 cuerdas).
 */
export class ChordChangesViewModel {
  /**
   * Construye el sub-ViewModel de cambios, conducción de voces e inversiones.
   * @param {object} deps Dependencias inyectadas.
   */
  constructor({
    appVm,
    instrument,
    activeTuning,
    voicingGenerator,
    chordLibraryService,
    harmonyService,
    audioService,
    metronomeService,
    playVoicingFn
  }) {
    /** Referencia al ViewModel global. */
    this._appVm = appVm;
    /** Observable compartido de instrumento. */
    this._instrument = instrument;
    /** Observable derivado compartido de afinación. */
    this._activeTuning = activeTuning;
    /** Generador de voicings y conducción de voces. */
    this._voicingGen = voicingGenerator;
    /** Servicio de biblioteca e inversiones. */
    this._libraryService = chordLibraryService;
    /** Servicio de secuencias diatónicas aleatorias. */
    this._harmony = harmonyService;
    /** Sintetizador de audio. */
    this._audio = audioService;
    /** Metrónomo Web Audio compartido. */
    this._metronome = metronomeService;
    /** Callback para reproducir un voicing con la configuración de Biblioteca. */
    this._playVoicing = playVoicingFn;

    // --- Entrenador de Cambios (100 % editable) ---
    /** Secuencia editable de acordes del entrenador de cambios. */
    this.trainerChords = new Observable(['G', 'C']);
    /** Índice de variante de voicing elegido por slot ({ [slotIdx]: voicingIdx }). */
    this.trainerVoicingIndices = new Observable({});
    /** BPM del entrenador de cambios. */
    this.trainerBpm = new Observable(60);
    /** Pulsos entre cada cambio de acorde. */
    this.trainerBeatsPerChange = new Observable(4);
    /** Reproducir el acorde de guía en el tiempo 1 de cada cambio. */
    this.trainerAudioCue = new Observable(true);
    /** Estado activo del entrenador de cambios. */
    this.trainerRunning = new Observable(false);
    /** Índice del acorde actual en el entrenador. */
    this.trainerStepIndex = new Observable(0);
    /** Pulso actual dentro del ciclo de cambio (1..trainerBeatsPerChange). */
    this.trainerCurrentBeat = new Observable(0);
    /** Contador de cambios completados en la sesión del entrenador. */
    this.trainerChangesCount = new Observable(0);
    /** Marca de inicio de sesión para calcular CPM. */
    this._trainerStartedAtMs = null;
    /** Referencia al handler `onBeat` propio para liberarlo sin afectar a `MetronomeViewModel`. */
    this._activeBeatHandler = null;

    // --- Conducción de Voces (100 % editable) ---
    /** Secuencia editable de acordes para conducción de voces. */
    this.voiceLeadingChords = new Observable(['Dm7', 'G7', 'Cmaj7', 'A7']);
    /** Zona preferida del diapasón ('libre' | 'abierto' | 'medio' | 'agudo'). */
    this.voiceLeadingZone = new Observable('libre');
    /** Estilo o juego de cuerdas para la conducción. */
    this.voiceLeadingStyle = new Observable('auto');
    /** Resultado calculado de conducción de voces. */
    this.voiceLedSequence = new Observable([]);

    // --- Inversiones por el mango ---
    /** Raíz seleccionada en Inversiones por el mango. */
    this.inversionRoot = new Observable('C');
    /** Calidad seleccionada en Inversiones por el mango. */
    this.inversionQuality = new Observable('');
    /** Juego de cuerdas o estilo de inversiones (adaptado a guitarra o bajo). */
    this.inversionStringSet = new Observable(instrument.value === 'bajo' ? 'bass-triadas' : '432');

    /** Instancia Chord correspondiente a la herramienta de Inversiones por el mango. */
    this.inversionChord = new ComputedObservable(
      [this.inversionRoot, this.inversionQuality],
      () => new Chord({ root: this.inversionRoot.value, quality: this.inversionQuality.value })
    );
  }

  /**
   * Ajusta estilos por defecto y recalcula conducción al cambiar instrumento o afinación.
   * @param {{ switchedFamily?: boolean, isBass?: boolean }} [opts={}] Opciones de cambio.
   */
  syncForInstrumentChange({ switchedFamily = false, isBass = false } = {}) {
    if (switchedFamily) {
      this.voiceLeadingStyle.set('auto');
      this.inversionStringSet.set(isBass ? 'bass-triadas' : '432');
    }
    this.trainerVoicingIndices.set({});
    this.recomputeVoiceLeading();
  }

  // --- Entrenador de Cambios ---

  /** Devuelve los voicings disponibles para un acorde del entrenador. */
  getTrainerSlotVoicings(chordSymbol) {
    return this._libraryService.getTrainerSlotVoicings({
      chordSymbol,
      tuning: this._activeTuning.value,
      voicingGenerator: this._voicingGen
    });
  }

  /** Devuelve el voicing activo para un slot puntual del entrenador. */
  getActiveTrainerVoicing(slotIndex) {
    const sym = this.trainerChords.value[slotIndex];
    if (!sym) return null;
    const list = this.getTrainerSlotVoicings(sym);
    if (list.length === 0) return null;
    return list[(this.trainerVoicingIndices.value[slotIndex] || 0) % list.length];
  }

  /** Rota a la siguiente digitación disponible para un slot y la reproduce. */
  cycleTrainerSlotVoicing(slotIndex) {
    const sym = this.trainerChords.value[slotIndex];
    if (!sym) return;
    const list = this.getTrainerSlotVoicings(sym);
    if (list.length <= 1) return;
    const map = { ...this.trainerVoicingIndices.value };
    map[slotIndex] = ((map[slotIndex] || 0) + 1) % list.length;
    this.trainerVoicingIndices.set(map, true);
    this._playVoicing(list[map[slotIndex]]);
  }

  /** Agrega un acorde a la secuencia del Entrenador de Cambios. */
  addTrainerChord(chordSymbol) {
    if (!chordSymbol || this.trainerChords.value.length >= 12) return;
    this.stopChangeTrainer();
    this.trainerChords.set([...this.trainerChords.value, chordSymbol]);
  }

  /** Reordena o elimina un acorde del Entrenador (mínimo 2). */
  editTrainerChord(index, action) {
    const list = [...this.trainerChords.value];
    if (action === 'remove' && list.length > 2) {
      this.stopChangeTrainer();
      list.splice(index, 1);
      this.trainerVoicingIndices.set({});
      this.trainerStepIndex.set(0);
    } else if (action === 'left' && index > 0) {
      this.stopChangeTrainer();
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
      this.trainerVoicingIndices.set({});
    } else if (action === 'right' && index < list.length - 1) {
      this.stopChangeTrainer();
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
      this.trainerVoicingIndices.set({});
    }
    this.trainerChords.set(list);
  }

  /** Genera una secuencia diatónica aleatoria para el Entrenador. */
  randomizeTrainerChords(opts = {}) {
    this.stopChangeTrainer();
    const key = opts.key || ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const mode = opts.mode || (Math.random() > 0.35 ? 'major' : 'minor');
    const useSevenths = opts.useSevenths !== undefined ? opts.useSevenths : Math.random() > 0.5;
    const length = opts.length || 3;
    const seq = this._harmony.generateRandomDiatonicSequence({ key, mode, useSevenths, length });
    this.trainerChords.set(seq);
    this.trainerVoicingIndices.set({});
    this.trainerStepIndex.set(0);
    this._appVm.showSnackbar(`Nueva secuencia aleatoria en ${key}: ${seq.join(' – ')}`);
  }

  /** Carga los acordes favoritos del usuario en el Entrenador. */
  loadFavoritesIntoTrainer() {
    const favs = this._appVm.progress.value.favoriteChords || [];
    if (favs.length < 2) {
      this._appVm.showSnackbar('Marcá al menos 2 acordes como favoritos en la Biblioteca para practicarlos acá.');
      return;
    }
    this.stopChangeTrainer();
    this.trainerChords.set(favs.slice(0, 8));
    this.trainerVoicingIndices.set({});
    this.trainerStepIndex.set(0);
  }

  /**
   * Inicia el Entrenador de Cambios sincronizado con el metrónomo Web Audio.
   */
  startChangeTrainer() {
    if (this.trainerRunning.value) return;
    if (this.trainerChords.value.length < 2) return;

    this.trainerStepIndex.set(0);
    this.trainerCurrentBeat.set(0);
    this.trainerChangesCount.set(0);
    this._trainerStartedAtMs = Date.now();
    this.trainerRunning.set(true);

    let beatCount = 0;
    const beatsPer = this.trainerBeatsPerChange.value;
    this._metronome.configure({
      bpm: this.trainerBpm.value,
      timeSignature: `${beatsPer}/4`,
      subdivision: 1,
      accentFirstBeat: true,
      speedTrainerEnabled: false,
      silentBarEnabled: false
    });
    this._activeBeatHandler = (ev) => {
      if (!ev.isMainBeat) return;
      beatCount += 1;
      const pos = ((beatCount - 1) % beatsPer) + 1;
      this.trainerCurrentBeat.set(pos, true);
      if (pos === 1 && beatCount > 1) {
        this.trainerStepIndex.update((i) => (i + 1) % this.trainerChords.value.length);
        this.trainerChangesCount.update((c) => c + 1);
      }
      if (pos === 1 && this.trainerAudioCue.value) {
        const curV = this.getActiveTrainerVoicing(this.trainerStepIndex.value % this.trainerChords.value.length);
        if (curV) this._playVoicing(curV);
      }
    };
    this._metronome.onBeat = this._activeBeatHandler;
    this._metronome.start();
  }

  /**
   * Detiene el Entrenador de Cambios, libera su callback en `_metronome` y guarda la marca CPM en `ProgressStore`.
   * @returns {Promise<number>} CPM alcanzado.
   */
  async stopChangeTrainer() {
    if (!this.trainerRunning.value) return 0;
    this._metronome.stop();
    if (this._activeBeatHandler && this._metronome.onBeat === this._activeBeatHandler) {
      this._metronome.onBeat = null;
    }
    this._activeBeatHandler = null;
    this.trainerRunning.set(false);
    this.trainerCurrentBeat.set(0);

    const changes = this.trainerChangesCount.value;
    const elapsedSec = this._trainerStartedAtMs ? Math.max(5, (Date.now() - this._trainerStartedAtMs) / 1000) : 0;
    this._trainerStartedAtMs = null;

    if (changes >= 2 && elapsedSec >= 5) {
      const cpm = Math.round((changes / elapsedSec) * 60);
      const seqKey = this.trainerChords.value.join(' – ');
      const best = await this._appVm.recordChangeTrainerCpm(seqKey, cpm);
      this._appVm.triggerHaptic(18);
      this._appVm.showSnackbar(`Entrenador: ${cpm} CPM (${changes} cambios). Mejor marca en ${seqKey}: ${best} CPM.`);
      return cpm;
    }
    return 0;
  }

  // --- Conducción de voces ---

  /** Recalcula la secuencia óptima de conducción de voces. */
  recomputeVoiceLeading() {
    const tuning = this._activeTuning.value;
    const result = this._voicingGen.findVoiceLedProgression(
      this.voiceLeadingChords.value,
      tuning,
      tuning.instrument,
      {
        fretZone: this.voiceLeadingZone.value,
        style: this.voiceLeadingStyle.value
      }
    );
    this.voiceLedSequence.set(result, true);
  }

  /** Agrega un acorde a Conducción de voces. */
  addVoiceLeadingChord(chordSymbol) {
    if (!chordSymbol || this.voiceLeadingChords.value.length >= 12) return;
    this.voiceLeadingChords.set([...this.voiceLeadingChords.value, chordSymbol]);
    this.recomputeVoiceLeading();
  }

  /** Reordena o elimina un acorde de Conducción de voces. */
  editVoiceLeadingChord(index, action) {
    const list = [...this.voiceLeadingChords.value];
    if (action === 'remove' && list.length > 2) list.splice(index, 1);
    else if (action === 'left' && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
    else if (action === 'right' && index < list.length - 1) [list[index], list[index + 1]] = [list[index + 1], list[index]];
    this.voiceLeadingChords.set(list);
    this.recomputeVoiceLeading();
  }

  /** Reemplaza la progresión de Conducción de voces y recalcula. */
  setVoiceLeadingChords(chords) {
    if (!Array.isArray(chords) || chords.length < 2) return;
    this.voiceLeadingChords.set([...chords]);
    this.recomputeVoiceLeading();
  }

  /** Genera una progresión diatónica aleatoria para Conducción de voces. */
  randomizeVoiceLeadingChords() {
    const key = ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const modes = ['major', 'minor', 'harmonic-minor'];
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const seq = this._harmony.generateRandomDiatonicSequence({ key, mode, useSevenths: Math.random() > 0.4, length: 4 });
    this.setVoiceLeadingChords(seq);
    this._appVm.showSnackbar(`Conducción aleatoria en ${key}: ${seq.join(' – ')}`);
  }

  /** Cambia la zona del mango preferida para Conducción de voces. */
  setVoiceLeadingZone(zone) {
    this.voiceLeadingZone.set(zone);
    this.recomputeVoiceLeading();
  }

  /** Cambia el estilo/juego de cuerdas de Conducción de voces. */
  setVoiceLeadingStyle(style) {
    this.voiceLeadingStyle.set(style);
    this.recomputeVoiceLeading();
  }

  // --- Inversiones por el mango ---

  /** Selecciona el acorde a explorar en Inversiones por el mango. */
  selectInversionChord(patch = {}) {
    if (patch.root !== undefined) this.inversionRoot.set(patch.root);
    if (patch.quality !== undefined) this.inversionQuality.set(patch.quality);
  }

  /** Elige un acorde aleatorio para estudiar inversiones por todo el diapasón. */
  randomizeInversionChord() {
    const root = ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
    const qualities = ['', 'm', 'maj7', '7', 'm7', 'dim'];
    this.selectInversionChord({ root, quality: qualities[Math.floor(Math.random() * qualities.length)] });
  }

  /** Devuelve hasta 6 inversiones ordenadas ascendiendo por el diapasón. */
  getInversionWalkVoicings() {
    return this._libraryService.computeInversionWalkVoicings({
      symbol: this.inversionChord.value.americanSymbol,
      tuning: this._activeTuning.value,
      mode: this.inversionStringSet.value,
      voicingGenerator: this._voicingGen
    });
  }

  /** Reproduce en secuencia ascendente todas las inversiones visibles por el mango. */
  playInversionWalk() {
    const tuning = this._activeTuning.value;
    const isBass = tuning.instrument === 'bass';
    const synthInst = isBass
      ? 'electric-bass'
      : this._instrument.value === 'guitarra-clasica'
        ? 'nylon-guitar'
        : 'acoustic-guitar';
    const list = this.getInversionWalkVoicings();
    if (list.length === 0) return;
    this._audio.configure({ listeningRegister: this._appVm.settings.value.listeningRegister || 'real' });
    this._audio.playChordSequence(
      list.map((v) => v.getMidiNotes(tuning)),
      { stepMs: 950, mode: isBass ? 'block' : 'strum-down', instrument: synthInst }
    );
  }

  /**
   * Detiene el entrenador, limpia el callback del metrónomo y libera `inversionChord`.
   */
  dispose() {
    if (this.trainerRunning.value) {
      this._metronome.stop();
      this.trainerRunning.set(false);
    }
    if (this._activeBeatHandler && this._metronome.onBeat === this._activeBeatHandler) {
      this._metronome.onBeat = null;
    }
    this._activeBeatHandler = null;
    this.inversionChord.dispose();
  }
}
