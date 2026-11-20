import { ComputedObservable, Observable } from '../core/Observable.js';
import { ChordQuality } from '../models/ChordQuality.js';
import { Tuning } from '../models/Tuning.js';
import { ChordLibraryService } from '../services/ChordLibraryService.js';
import { ChordChangesViewModel } from './chords/ChordChangesViewModel.js';
import { ChordEarTrainerViewModel } from './chords/ChordEarTrainerViewModel.js';
import { ChordLibraryViewModel } from './chords/ChordLibraryViewModel.js';
import { HarmonicFieldViewModel } from './chords/HarmonicFieldViewModel.js';

/**
 * ViewModel coordinador del módulo Acordes y Armonía (#/acordes).
 * Mantiene el estado compartido de instrumento, afinación y pestaña activa,
 * y compone 4 sub-ViewModels cohesivos (`ChordLibraryViewModel`, `HarmonicFieldViewModel`,
 * `ChordChangesViewModel`, `ChordEarTrainerViewModel`).
 */
export class ChordsHubViewModel {
  /**
   * Construye el ViewModel inyectando los servicios puros de armonía y audio.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({
    appVm,
    voicingGenerator,
    harmonyService,
    audioService,
    metronomeService,
    chordLibraryService = null,
    onOpenScaleForChord = null
  }) {
    /** ViewModel global de la app. */
    this._appVm = appVm;
    /** Servicio puro de biblioteca, filtrado y recorridos de inversiones (inyectable). */
    const libraryService = chordLibraryService || new ChordLibraryService();

    /** Pestaña activa del módulo ('biblioteca' | 'campo' | 'cambios' | 'oido'). */
    this.activeTab = new Observable('biblioteca');

    const initialInst = appVm.settings.value.defaultInstrument || 'guitarra';
    /** Instrumento activo compartido en todo el módulo ('guitarra' | 'guitarra-clasica' | 'bajo'). */
    this.instrument = new Observable(initialInst);
    /** ID de afinación activa compartida (`Tuning`). */
    this.tuningId = new Observable(initialInst === 'bajo' ? 'bass-4-standard' : 'guitar-standard');
    /** Afinación activa resuelta como objeto `Tuning`. */
    this.activeTuning = new ComputedObservable([this.tuningId], () => Tuning.byId(this.tuningId.value));

    // --- Composición de los 4 sub-ViewModels cohesivos ---
    /** Sub-ViewModel de Biblioteca de Acordes. */
    this.library = new ChordLibraryViewModel({
      appVm,
      instrument: this.instrument,
      activeTuning: this.activeTuning,
      voicingGenerator,
      chordLibraryService: libraryService,
      audioService,
      onOpenScaleForChord
    });

    /** Sub-ViewModel de Explorador de Campo Armónico. */
    this.harmonicField = new HarmonicFieldViewModel({
      appVm,
      instrument: this.instrument,
      activeTuning: this.activeTuning,
      harmonyService,
      voicingGenerator,
      audioService
    });

    /** Sub-ViewModel de Entrenador de Cambios, Conducción de Voces e Inversiones. */
    this.changes = new ChordChangesViewModel({
      appVm,
      instrument: this.instrument,
      activeTuning: this.activeTuning,
      voicingGenerator,
      chordLibraryService: libraryService,
      harmonyService,
      audioService,
      metronomeService,
      playVoicingFn: (v, mode) => this.library.playVoicing(v, mode)
    });

    /** Sub-ViewModel de Entrenamiento de Oído Armónico. */
    this.earTrainer = new ChordEarTrainerViewModel({
      appVm,
      harmonyService,
      audioService
    });

    // Alias observables hacia los sub-ViewModels (estabilidad total de API para ChordsHubView y tests)
    this.selectedRoot = this.library.selectedRoot;
    this.preferSharps = this.library.preferSharps;
    this.selectedQuality = this.library.selectedQuality;
    this.selectedBass = this.library.selectedBass;
    this.voicingTypeFilter = this.library.voicingTypeFilter;
    this.inversionFilter = this.library.inversionFilter;
    this.fretRangeFilter = this.library.fretRangeFilter;
    this.diagramViewMode = this.library.diagramViewMode;
    this.labelMode = this.library.labelMode;
    this.leftHanded = this.library.leftHanded;
    this.playMode = this.library.playMode;
    this.generatedVoicings = this.library.generatedVoicings;
    this.activeVoicingIndex = this.library.activeVoicingIndex;
    this.activeChord = this.library.activeChord;
    this.voicingsList = this.library.voicingsList;

    this.fieldKey = this.harmonicField.fieldKey;
    this.fieldMode = this.harmonicField.fieldMode;
    this.fieldUseSevenths = this.harmonicField.fieldUseSevenths;
    this.builderChords = this.harmonicField.builderChords;
    this.diatonicField = this.harmonicField.diatonicField;

    this.trainerChords = this.changes.trainerChords;
    this.trainerVoicingIndices = this.changes.trainerVoicingIndices;
    this.trainerBpm = this.changes.trainerBpm;
    this.trainerBeatsPerChange = this.changes.trainerBeatsPerChange;
    this.trainerAudioCue = this.changes.trainerAudioCue;
    this.trainerRunning = this.changes.trainerRunning;
    this.trainerStepIndex = this.changes.trainerStepIndex;
    this.trainerCurrentBeat = this.changes.trainerCurrentBeat;
    this.trainerChangesCount = this.changes.trainerChangesCount;
    this.voiceLeadingChords = this.changes.voiceLeadingChords;
    this.voiceLeadingZone = this.changes.voiceLeadingZone;
    this.voiceLeadingStyle = this.changes.voiceLeadingStyle;
    this.voiceLedSequence = this.changes.voiceLedSequence;
    this.inversionRoot = this.changes.inversionRoot;
    this.inversionQuality = this.changes.inversionQuality;
    this.inversionStringSet = this.changes.inversionStringSet;
    this.inversionChord = this.changes.inversionChord;

    this.earLevel = this.earTrainer.earLevel;
    this.earQuestion = this.earTrainer.earQuestion;
    this.earSelectedId = this.earTrainer.earSelectedId;
    this.earScore = this.earTrainer.earScore;

    /** Desuscripción guardada de `appVm.isReady`. */
    this._unsubReady = appVm.isReady.subscribe((ready) => {
      if (ready && appVm.settings.value.defaultInstrument) {
        this.setInstrument(appVm.settings.value.defaultInstrument);
      }
    });

    this.changes.recomputeVoiceLeading();
    this.earTrainer.nextEarQuestion();
  }

  /** Cambia la pestaña activa deteniendo el entrenador de cambios si estaba corriendo. */
  setActiveTab(tab) {
    if (['biblioteca', 'campo', 'cambios', 'oido'].includes(tab)) {
      if (this.changes.trainerRunning.value && tab !== 'cambios') {
        this.changes.stopChangeTrainer();
      }
      this.activeTab.set(tab);
    }
  }

  /** Selecciona el instrumento compartido y sincroniza afinación y sub-ViewModels. */
  setInstrument(inst) {
    const prevWasBass = this.instrument.value === 'bajo';
    const nextIsBass = inst === 'bajo';
    this.instrument.set(inst);

    const switchedFamily = prevWasBass !== nextIsBass;
    if (nextIsBass) {
      if (!this.tuningId.value.startsWith('bass-')) this.tuningId.set('bass-4-standard');
    } else if (this.tuningId.value.startsWith('bass-')) {
      this.tuningId.set('guitar-standard');
    }

    this.library.resetForInstrumentChange({
      resetFilters: switchedFamily,
      defaultPlayMode: switchedFamily
        ? (nextIsBass ? 'block' : inst === 'guitarra-clasica' ? 'arpeggio-pima' : 'strum-down')
        : null
    });
    this.changes.syncForInstrumentChange({ switchedFamily, isBass: nextIsBass });
  }

  /** Cambia la afinación activa y actualiza Biblioteca y Conducción de voces. */
  setTuning(tuningId) {
    this.tuningId.set(tuningId);
    this.library.resetForInstrumentChange();
    this.changes.syncForInstrumentChange();
  }

  // --- Delegación Biblioteca ---
  selectChord(patch) { this.library.selectChord(patch); }
  selectChordBySymbol(sym) {
    this.library.selectChordBySymbol(sym);
    this.activeTab.set('biblioteca');
  }
  openCompatibleScale() { this.library.openCompatibleScale(); }
  generateSuggestedVoicings() { this.library.generateSuggestedVoicings(); }
  getRootChoices() { return this.library.getRootChoices(); }
  setPreferSharps(v) { this.library.setPreferSharps(v); }
  getGroupedVoicings() { return this.library.getGroupedVoicings(); }
  playVoicing(v, mode) { this.library.playVoicing(v, mode); }
  playChordArpeggio(sym) { this.library.playChordArpeggio(sym); }
  toggleFavoriteActiveChord() { return this.library.toggleFavoriteActiveChord(); }
  practiceActiveChord(v) { return this.library.practiceActiveChord(v); }

  // --- Delegación Campo Armónico ---
  addChordToBuilder(sym) { this.harmonicField.addChordToBuilder(sym); }
  editBuilderChord(idx, act) { this.harmonicField.editBuilderChord(idx, act); }
  applyFieldShortcut(id) { this.harmonicField.applyFieldShortcut(id); }
  loadBuilderIntoVoiceLeading() {
    this.changes.setVoiceLeadingChords([...this.harmonicField.builderChords.value]);
    this.setActiveTab('cambios');
  }
  loadBuilderIntoTrainer() {
    this.changes.stopChangeTrainer();
    const list = this.harmonicField.builderChords.value.length >= 2
      ? [...this.harmonicField.builderChords.value]
      : ['C', 'G'];
    this.changes.trainerChords.set(list);
    this.changes.trainerVoicingIndices.set({});
    this.changes.trainerStepIndex.set(0);
    this.setActiveTab('cambios');
  }
  playBuilderProgression(useVoiceLed = false) {
    this.harmonicField.playBuilderProgression(this.changes.voiceLedSequence.value, useVoiceLed);
  }
  saveBuilderAsPractice(opts) { return this.harmonicField.saveBuilderAsPractice(opts); }

  // --- Delegación Cambios, Conducción e Inversiones ---
  getTrainerSlotVoicings(sym) { return this.changes.getTrainerSlotVoicings(sym); }
  getActiveTrainerVoicing(idx) { return this.changes.getActiveTrainerVoicing(idx); }
  cycleTrainerSlotVoicing(idx) { this.changes.cycleTrainerSlotVoicing(idx); }
  addTrainerChord(sym) { this.changes.addTrainerChord(sym); }
  editTrainerChord(idx, act) { this.changes.editTrainerChord(idx, act); }
  randomizeTrainerChords(opts) { this.changes.randomizeTrainerChords(opts); }
  loadFavoritesIntoTrainer() { this.changes.loadFavoritesIntoTrainer(); }
  recomputeVoiceLeading() { this.changes.recomputeVoiceLeading(); }
  addVoiceLeadingChord(sym) { this.changes.addVoiceLeadingChord(sym); }
  editVoiceLeadingChord(idx, act) { this.changes.editVoiceLeadingChord(idx, act); }
  setVoiceLeadingChords(chords) { this.changes.setVoiceLeadingChords(chords); }
  randomizeVoiceLeadingChords() { this.changes.randomizeVoiceLeadingChords(); }
  setVoiceLeadingZone(z) { this.changes.setVoiceLeadingZone(z); }
  setVoiceLeadingStyle(s) { this.changes.setVoiceLeadingStyle(s); }
  selectInversionChord(p) { this.changes.selectInversionChord(p); }
  randomizeInversionChord() { this.changes.randomizeInversionChord(); }
  getInversionWalkVoicings() { return this.changes.getInversionWalkVoicings(); }
  playInversionWalk() { this.changes.playInversionWalk(); }
  startChangeTrainer() { this.changes.startChangeTrainer(); }
  stopChangeTrainer() { return this.changes.stopChangeTrainer(); }

  // --- Delegación Oído ---
  nextEarQuestion() { this.earTrainer.nextEarQuestion(); }
  playEarQuestion() { this.earTrainer.playEarQuestion(); }
  answerEarQuestion(id) { return this.earTrainer.answerEarQuestion(id); }

  /** Lista todas las calidades de acorde disponibles. */
  getAvailableQualities() { return ChordQuality.listAll(); }

  /**
   * Libera la suscripción a `appVm.isReady`, los sub-ViewModels y todos los `ComputedObservable`.
   */
  dispose() {
    if (this._unsubReady) {
      this._unsubReady();
      this._unsubReady = null;
    }
    this.changes.dispose();
    this.harmonicField.dispose();
    this.library.dispose();
    this.earTrainer.dispose();
    this.activeTuning.dispose();
  }
}
