import { formatChordSymbol } from '../core/i18n.js';
import { ComputedObservable, Observable } from '../core/Observable.js';
import { normalizeVoicingInstrument } from '../services/FingeringDesignService.js';
import { createScalePractice } from '../services/PracticeFactoryService.js';
import {
  SCALE_CATALOG,
  SCALE_EAR_LEVELS,
  SCALE_FAMILIES,
  SCALE_STUDY_PATTERNS
} from '../services/ScaleCatalogService.js';
import { ScaleAudioController } from './scales/ScaleAudioController.js';
import { ScaleEarTrainerViewModel } from './scales/ScaleEarTrainerViewModel.js';

/** Orden de los 7 modos griegos del más brillante al más oscuro para comparación en paralelo. */
const GREEK_MODES_BY_BRIGHTNESS = ['lidio', 'mayor', 'mixolidio', 'dorico', 'menor-natural', 'frigio', 'locrio'];

/** Pestañas válidas del módulo Escalas y Modos. */
const VALID_SCALES_TABS = new Set(['explorador', 'modos', 'patrones', 'oido']);

/**
 * ViewModel coordinador del módulo Escalas y Modos (#/escalas).
 * Compone `ScaleAudioController` y `ScaleEarTrainerViewModel` sobre el estado observable
 * de escala, raíz, digitación, modos paralelos y partitura ABC (sin tablatura).
 */
export class ScalesHubViewModel {
  /**
   * Construye el ViewModel inyectando los servicios puros de escalas y audio.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({ appVm, scaleCatalogService, audioService, onOpenChord = null }) {
    /** ViewModel global de la aplicación. */
    this._appVm = appVm;
    /** Servicio musicológico de escalas, digitaciones y patrones ABC. */
    this._scales = scaleCatalogService;
    /** Callback opcional para saltar al módulo Acordes con un símbolo precargado. */
    this._onOpenChord = onOpenChord;

    /** Pestaña activa ('explorador' | 'modos' | 'patrones' | 'oido'). */
    this.activeTab = new Observable('explorador');

    const initialInst = normalizeVoicingInstrument(appVm.settings.value.defaultInstrument || 'guitarra');
    /** Instrumento de digitación activo ('guitarra' | 'guitarra-clasica' | 'bajo' | 'bajo-5'). */
    this.voicingInstrument = new Observable(initialInst);
    /** Raíz seleccionada en notación americana ('C'..'B'). */
    this.selectedRoot = new Observable('C');
    /** Preferencia de enarmonía para la botonera de raíces (true = sostenidos, false = bemoles). */
    this.preferSharps = new Observable(true);
    /** Identificador de la escala o modo activo. */
    this.selectedScaleId = new Observable('mayor');
    /** Sistema de digitación elegido para el instrumento activo. */
    this.fingeringSystemId = new Observable(this._defaultSystemFor(initialInst));
    /** Índice de caja/posición dentro del sistema de digitación actual. */
    this.positionIndex = new Observable(0);

    /** Etiqueta dentro de cada punto del diapasón ('note' | 'degree' | 'finger'). */
    this.labelMode = new Observable('note');
    /** Si true, resalta con borde punteado las notas a evitar. */
    this.showAvoidNotes = new Observable(true);
    /** Orientación para personas zurdas. */
    this.leftHanded = new Observable(false);
    /** En menor melódica, alterna entre modo jazz (fija) y clásico (baja como natural). */
    this.classicalMelodicDesc = new Observable(false);
    /** Combinación de mano derecha en guitarra clásica ('i-m' | 'm-i' | 'm-a'). */
    this.rightHandPattern = new Observable('i-m');

    /** Patrón de estudio activo ('asc-desc' | 'terceras' | 'grupos-3' | 'grupos-4' | 'arpegios'). */
    this.studyPattern = new Observable('asc-desc');
    /** Cantidad de octavas para reproducción y partitura ABC (1 o 2). */
    this.octaves = new Observable(1);
    /** Tempo de reproducción en BPM. */
    this.bpm = new Observable(96);

    /** Sub-ViewModel de reproducción de escalas, notas, acordes y drone modal. */
    this.audio = new ScaleAudioController({
      scaleCatalogService,
      audioService,
      getState: () => {
        const activeRoots = (this.fretboardLayout?.value?.dots || [])
          .filter((d) => d.inPosition && d.isRoot)
          .map((d) => d.midi);
        return {
          root: this.selectedRoot.value,
          scaleId: this.selectedScaleId.value,
          voicingInstrument: this.voicingInstrument.value,
          studyPattern: this.studyPattern.value,
          octaves: this.octaves.value,
          bpm: this.bpm.value,
          classicalMelodicDesc: this.classicalMelodicDesc.value,
          preferredBaseMidi: activeRoots.length > 0 ? Math.min(...activeRoots) : null
        };
      }
    });

    /** Sub-ViewModel del Entrenador de Oído Modal en paralelo. */
    this.earTrainer = new ScaleEarTrainerViewModel({
      appVm,
      scaleCatalogService,
      audioService,
      selectedRoot: this.selectedRoot,
      isPlayingSequence: this.audio.isPlayingSequence
    });

    // Alias observables hacia sub-ViewModels (compatibilidad estable para ScalesHubView y tests)
    this.droneActive = this.audio.droneActive;
    this.isPlayingSequence = this.audio.isPlayingSequence;
    this.activeHighlightMidi = this.audio.activeHighlightMidi;
    this.earLevel = this.earTrainer.earLevel;
    this.earQuestion = this.earTrainer.earQuestion;
    this.earSelectedId = this.earTrainer.earSelectedId;
    this.earScore = this.earTrainer.earScore;

    // --- Observables derivados en orden topológico estricto ---
    this.activeScale = new ComputedObservable([this.selectedScaleId], () =>
      this._scales.getScaleById(this.selectedScaleId.value)
    );
    this.availableSystems = new ComputedObservable([this.voicingInstrument], () =>
      this._scales.getFingeringSystems(this.voicingInstrument.value)
    );
    this.fretboardLayout = new ComputedObservable(
      [this.selectedRoot, this.selectedScaleId, this.voicingInstrument, this.fingeringSystemId, this.positionIndex],
      () =>
        this._scales.computeFretboardLayout({
          root: this.selectedRoot.value,
          scaleId: this.selectedScaleId.value,
          voicingInstrument: this.voicingInstrument.value,
          systemId: this.fingeringSystemId.value,
          positionIndex: this.positionIndex.value
        })
    );
    this.associatedChords = new ComputedObservable([this.selectedRoot, this.selectedScaleId], () =>
      this._scales.getAssociatedChords(this.selectedRoot.value, this.selectedScaleId.value)
    );
    this.relativeParentLabel = new ComputedObservable(
      [this.selectedRoot, this.selectedScaleId, this._appVm.settings],
      () => this._scales.getRelativeParentLabel(this.selectedRoot.value, this.selectedScaleId.value, this._appVm.settings.value.chordNotation)
    );
    this.linkedRepertoirePractices = new ComputedObservable([this.activeScale, this._appVm.allPractices], () =>
      (this.activeScale.value?.repertoireIds || []).map((id) => this._appVm.findPracticeById(id)).filter(Boolean)
    );
    this.previewAbc = new ComputedObservable(
      [this.selectedRoot, this.selectedScaleId, this.voicingInstrument, this.studyPattern, this.octaves, this.classicalMelodicDesc, this.rightHandPattern],
      () =>
        this._scales.buildScalePracticeAbc({
          root: this.selectedRoot.value,
          scaleId: this.selectedScaleId.value,
          voicingInstrument: this.voicingInstrument.value,
          pattern: this.studyPattern.value,
          octaves: this.octaves.value,
          classicalMelodicDesc: this.classicalMelodicDesc.value,
          rightHandPattern: this.rightHandPattern.value
        })
    );
    this.parallelModesComparison = new ComputedObservable([this.selectedRoot], () =>
      GREEK_MODES_BY_BRIGHTNESS.map((modeId) => {
        const scale = this._scales.getScaleById(modeId);
        const notes = this._scales.spellScaleNotes(this.selectedRoot.value, modeId);
        const chords = this._scales.getAssociatedChords(this.selectedRoot.value, modeId);
        return {
          scale,
          notes,
          characteristicNotes: notes.filter((n) => n.isCharacteristic),
          avoidNotes: notes.filter((n) => n.isAvoid),
          tonicChord: chords[0]?.symbol || `${this.selectedRoot.value}${scale.droneChordQuality || ''}`
        };
      })
    );
  }

  /** Devuelve metadatos estáticos del catálogo para selectores de la vista. */
  getCatalogMeta() {
    return { scales: SCALE_CATALOG, families: SCALE_FAMILIES, patterns: SCALE_STUDY_PATTERNS, earLevels: SCALE_EAR_LEVELS };
  }

  _defaultSystemFor(inst) {
    if (inst === 'guitarra-clasica') return 'primera-posicion';
    if (inst === 'bajo' || inst === 'bajo-5') return 'caja-1oct';
    return 'caged';
  }

  setActiveTab(tab) {
    const safe = VALID_SCALES_TABS.has(tab) ? tab : 'explorador';
    if (this.activeTab.value !== safe) this.activeTab.set(safe);
    if (safe === 'oido' && !this.earTrainer.earQuestion.value) this.earTrainer.nextEarQuestion();
  }

  setVoicingInstrument(inst) {
    const norm = normalizeVoicingInstrument(inst);
    this.voicingInstrument.set(norm);
    const systems = this._scales.getFingeringSystems(norm);
    if (!systems.some((s) => s.id === this.fingeringSystemId.value)) {
      this.fingeringSystemId.set(this._defaultSystemFor(norm));
    }
    this.positionIndex.set(0);
    this.audio.refreshDroneIfActive();
  }

  selectRoot(root) { this.selectedRoot.set(root); this.positionIndex.set(0); this.audio.refreshDroneIfActive(); }
  setPreferSharps(v) { this.preferSharps.set(Boolean(v)); }
  selectScale(id) { this.selectedScaleId.set(id); this.positionIndex.set(0); this.audio.refreshDroneIfActive(); }
  setFingeringSystem(id) { this.fingeringSystemId.set(id); this.positionIndex.set(0); }
  setPositionIndex(idx) {
    const maxIdx = Math.max(0, (this.fretboardLayout.value?.positions?.length || 1) - 1);
    this.positionIndex.set(Math.max(0, Math.min(maxIdx, Number(idx) || 0)));
  }

  /** Navega al módulo Acordes precargando el acorde seleccionado. */
  openChordInHub(chordSymbol) {
    this.audio.stopAudio();
    if (typeof this._onOpenChord === 'function') this._onOpenChord(chordSymbol);
    else this._appVm.navigate('#/acordes/biblioteca');
  }

  /** Abre una obra del catálogo de Repertorio directamente en el Reproductor. */
  openRepertoirePractice(practiceId) {
    if (!practiceId) return;
    this.audio.stopAudio();
    this._appVm.activePracticeId.set(practiceId);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
  }

  /** Recibe un acorde desde Acordes, selecciona la escala compatible y navega al Explorador. */
  openForChord(chordSymbol) {
    const suggestion = this._scales.suggestScaleForChord(chordSymbol);
    this.selectedRoot.set(suggestion.root);
    this.selectedScaleId.set(suggestion.scaleId);
    this.positionIndex.set(0);
    this.activeTab.set('explorador');
    this._appVm.navigate('#/escalas/explorador');
    const notation = this._appVm.settings.value.chordNotation;
    const scale = this._scales.getScaleById(suggestion.scaleId);
    this._appVm.showSnackbar(
      `Escala sugerida para ${formatChordSymbol(chordSymbol, notation)}: ${formatChordSymbol(suggestion.root, notation)} ${scale.name}`
    );
  }

  /** Crea una práctica v3 delegando en `PracticeFactoryService` y opcionalmente la abre en el Reproductor. */
  async practiceCurrentScale(openImmediately = true) {
    const patternMeta = SCALE_STUDY_PATTERNS.find((p) => p.id === this.studyPattern.value) || SCALE_STUDY_PATTERNS[0];
    const practice = createScalePractice({
      scale: this.activeScale.value,
      root: this.selectedRoot.value,
      notation: this._appVm.settings.value.chordNotation,
      patternMeta,
      voicingInstrument: this.voicingInstrument.value,
      layout: this.fretboardLayout.value,
      octaves: this.octaves.value,
      bpm: this.bpm.value,
      abc: this.previewAbc.value,
      studyPattern: this.studyPattern.value
    });
    await this._appVm.upsertUserPractice(practice);
    if (openImmediately) {
      this.audio.stopAudio();
      this._appVm.navigate(`#/practica/${encodeURIComponent(practice.id)}`);
      this._appVm.showSnackbar('Estudio de escala abierto en el Reproductor.');
    } else {
      this._appVm.showSnackbar('Estudio de escala guardado en tus Prácticas.');
    }
    return practice;
  }

  // --- Delegación limpia hacia sub-ViewModels ---
  toggleDrone() { this.audio.toggleDrone(); }
  playCurrentScale(p = null) { this.audio.playCurrentScale(p); }
  playParallelMode(id) { this.audio.playParallelMode(id); }
  playSingleNote(m) { this.audio.playSingleNote(m); }
  playAssociatedChord(s) { this.audio.playAssociatedChord(s); }
  stopAudio() { this.audio.stopAudio(); }

  setEarLevel(lv) { this.earTrainer.setEarLevel(lv); }
  nextEarQuestion() { this.earTrainer.nextEarQuestion(); }
  playEarQuestion() { this.earTrainer.playEarQuestion(); }
  answerEarQuestion(id) { this.earTrainer.answerEarQuestion(id); }

  /** Detiene audio/drone y libera todos los `ComputedObservable` y sub-ViewModels. */
  dispose() {
    this.audio.dispose();
    this.earTrainer.dispose();
    this.parallelModesComparison.dispose();
    this.previewAbc.dispose();
    this.linkedRepertoirePractices.dispose();
    this.relativeParentLabel.dispose();
    this.associatedChords.dispose();
    this.fretboardLayout.dispose();
    this.availableSystems.dispose();
    this.activeScale.dispose();
  }
}
