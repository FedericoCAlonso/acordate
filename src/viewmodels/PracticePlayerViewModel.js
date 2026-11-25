import { NOTE_TO_PC, pcToNoteName, prefersFlats, transposeAbc, transposeChordSymbol } from '../core/MusicTheory.js';
import { ComputedObservable, Observable } from '../core/Observable.js';
import { Exercise } from '../models/Exercise.js';
import {
  buildChorusAbcScore,
  planChorusComping
} from '../services/CompingEngineService.js';
import { normalizeVoicingInstrument } from '../services/FingeringDesignService.js';
import {
  buildHarmonyTimeline,
  enrichTimelineWithHarmonyVoicings,
  extractFormSections
} from '../services/HarmonyTimelineService.js';
import {
  createChorusVariationPractice,
  createWalkingBassPractice,
  generateWalkingAbcForPractice
} from '../services/PracticeFactoryService.js';
import { WalkingBassGenerator } from '../services/WalkingBassGenerator.js';
import { FingeringDesignerViewModel } from './player/FingeringDesignerViewModel.js';
import { PlayerMixerViewModel } from './player/PlayerMixerViewModel.js';
import { PlayerTransportViewModel } from './player/PlayerTransportViewModel.js';
import { PracticeSessionTracker } from './player/PracticeSessionTracker.js';

/**
 * ViewModel coordinador liviano del reproductor de prácticas ("Modo Atril").
 * Compone `PlayerTransportViewModel`, `PlayerMixerViewModel`, `FingeringDesignerViewModel`
 * y `PracticeSessionTracker`, manteniendo el orden topológico estricto de sus `ComputedObservable`.
 */
export class PracticePlayerViewModel {
  /**
   * Inicializa el reproductor inyectando todos sus servicios y generadores por constructor.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({
    appVm,
    audioService,
    abcService,
    wakeLockService,
    importExportService = null,
    walkingBassGenerator = null,
    fingeringDesignService = null
  }) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;
    /** Servicio de reproducción Web Audio multi-voz. */
    this._audio = audioService;
    /** Servicio de análisis y preparación ABC. */
    this._abc = abcService;
    /** Servicio opcional de exportación desde el menú superior. */
    this._io = importExportService;
    /** Generador puro de walking bass (inyectable). */
    this._walkingGen = walkingBassGenerator || new WalkingBassGenerator();

    /** Práctica activa cargada actualmente. */
    this.practice = new Observable(null);
    /** Tempo actual en BPM (40-240). */
    this.bpm = new Observable(80);
    /** Desplazamiento de transposición en semitonos (-11 a +11). */
    this.transposeSemitones = new Observable(0);
    /** Modo de vista de notación ('pentagrama' | 'cifrado' | 'diagramas' | 'mixto'). */
    this.viewMode = new Observable('mixto');
    /** Nivel de zoom de la partitura (0.75 a 1.6). */
    this.zoom = new Observable(1.0);
    /** Indica si la partitura activa posee varias voces (V:1 / V:2). */
    this.hasMultipleVoices = new Observable(false);
    /** Mostrar capa opcional de análisis armónico. */
    this.showHarmonicAnalysis = new Observable(false);
    /** Walking bass sugerido generado sobre la progresión activa. */
    this.generatedWalkingAbc = new Observable('');
    /** Plan pre-generado del coro completo para Orgánico/Vivo (sincroniza audio, cifrado, diagramas y partitura). */
    this.chorusPlan = new Observable(null);
    /** Partitura ABC correspondiente al coro pre-generado actualmente. */
    this.chorusScoreAbc = new Observable('');
    /** Indica si el usuario desplegó el panel de partitura del coro generado. */
    this.showChorusScore = new Observable(false);
    /** Si está fijado, mantiene la misma variación al repetir en bucle en lugar de regenerar cada vuelta. */
    this.lockChorusVariation = new Observable(false);
    /** Contador incremental de variaciones de coro generadas en la sesión. */
    this._chorusGenerationCount = 0;
    /** Mostrar digitaciones anotadas sobre las notas (combinado izq + der). */
    this.showFingerings = new Observable(appVm.settings.value.showFingerings ?? true);
    /** Mostrar referencias de mano izquierda (dedos 0–4, cuerdas ①–⑥, posiciones romanas). */
    this.showLeftHand = new Observable(appVm.settings.value.showLeftHand ?? appVm.settings.value.showFingerings ?? true);
    /** Mostrar referencias de mano derecha (p, i, m, a, rasgueo). */
    this.showRightHand = new Observable(appVm.settings.value.showRightHand ?? appVm.settings.value.showFingerings ?? true);
    /** Mostrar cifrado de acordes sobre la partitura. */
    this.showChordsOnScore = new Observable(appVm.settings.value.showChordsOnScore ?? true);
    /** Mostrar otras anotaciones en partitura (análisis armónico / grados / texto). */
    this.showOtherAnnotations = new Observable(appVm.settings.value.showOtherAnnotations ?? true);
    /** Mostrar funciones armónicas en bajo. */
    this.showBassFunctions = new Observable(appVm.settings.value.showBassFunctions ?? true);
    /** Modo pantalla completa ("atril"). */
    this.isAtrilFullscreen = new Observable(false);
    /** Indica si el panel modal de ajustes está abierto. */
    this.isSheetOpen = new Observable(false);
    /** Pestaña activa del sheet de ajustes. */
    this.activeSheetTab = new Observable('mezcla');

    // --- Observables derivados en orden topológico estricto (`transposedKey` antes de `fingeringDesigner` y `exercise`) ---
    /** ABC resultante luego de aplicar la transposición en semitonos. */
    this.transposedAbc = new ComputedObservable([this.practice, this.transposeSemitones], () => {
      const pr = this.practice.value;
      return pr?.abc ? transposeAbc(pr.abc, this.transposeSemitones.value) : '';
    });

    /** Tonalidad visible luego de la transposición. */
    this.transposedKey = new ComputedObservable([this.practice, this.transposeSemitones], () => {
      const pr = this.practice.value;
      if (!pr) return 'C';
      const semi = this.transposeSemitones.value;
      if (!semi) return pr.key;
      const match = pr.key.match(/^([A-G][#b]?)(.*)$/);
      if (!match || NOTE_TO_PC[match[1]] === undefined) return pr.key;
      const newPc = (NOTE_TO_PC[match[1]] + semi + 120) % 12;
      return transposeChordSymbol(pr.key, semi, prefersFlats(pcToNoteName(newPc, true) + match[2]));
    });

    // --- Composición de sub-ViewModels ---
    /** Sub-ViewModel del mezclador de volúmenes, timbre y comping. */
    this.mixer = new PlayerMixerViewModel({
      appVm,
      getPractice: () => this.practice.value,
      onConfigChanged: (patch) => (patch ? this._audio.configure(patch) : this._syncAudioConfig())
    });

    /** Sub-ViewModel de seguimiento de repeticiones, tiempo de estudio y speed trainer. */
    this.sessionTracker = new PracticeSessionTracker({
      appVm,
      getPractice: () => this.practice.value,
      getBpm: () => this.bpm.value,
      isPlayingFn: () => this.transport.isPlaying.value,
      isLoopEnabledFn: () => this.transport.loopEnabled.value,
      onSetTempo: (nextBpm) => this.setTempo(nextBpm)
    });

    /** Sub-ViewModel de transporte, bucle, conteo previo y eventos visuales de audio. */
    this.transport = new PlayerTransportViewModel({
      appVm,
      audioService,
      wakeLockService,
      sessionTracker: this.sessionTracker,
      getPractice: () => this.practice.value,
      onSyncConfig: () => this._syncAudioConfig(),
      onPassCompleteHook: () => {
        if (this.transport.loopEnabled.value && !this.lockChorusVariation.value && this.compingFeel.value !== 'fijo') {
          this.regenerateChorusPlan();
        }
      }
    });

    /** Sub-ViewModel especialista en diseño de digitaciones de acordes. */
    this.fingeringDesigner = new FingeringDesignerViewModel({
      appVm,
      audioService,
      fingeringDesignService,
      practice: this.practice,
      transposeSemitones: this.transposeSemitones,
      transposedKey: this.transposedKey,
      mixer: this.mixer,
      onTimelineChanged: (syncConfig) => {
        this._refreshHarmonyAudioTimeline();
        if (syncConfig) this._syncAudioConfig();
      }
    });

    // Alias reactivos hacia sub-ViewModels (compatibilidad estable para vistas y tests)
    this.isPlaying = this.transport.isPlaying;
    this.isPaused = this.transport.isPaused;
    this.countInStatus = this.transport.countInStatus;
    this.activeMeasure = this.transport.activeMeasure;
    this.activeChordStepIndex = this.transport.activeChordStepIndex;
    this.activeNoteEvent = this.transport.activeNoteEvent;
    this.activeNoteEvents = this.transport.activeNoteEvents;
    this.liveCompingEvent = this.transport.liveCompingEvent;
    this.loopEnabled = this.transport.loopEnabled;
    this.loopStartMeasure = this.transport.loopStartMeasure;
    this.loopEndMeasure = this.transport.loopEndMeasure;
    this.countInMeasures = this.transport.countInMeasures;
    this.measureCount = this.transport.measureCount;

    this.synthInstrument = this.mixer.synthInstrument;
    this.compingPattern = this.mixer.compingPattern;
    this.compingFeel = this.mixer.compingFeel;
    this.melodyVolume = this.mixer.melodyVolume;
    this.chordsEnabled = this.mixer.chordsEnabled;
    this.chordsVolume = this.mixer.chordsVolume;
    this.bassEnabled = this.mixer.bassEnabled;
    this.bassVolume = this.mixer.bassVolume;
    this.voiceMode = this.mixer.voiceMode;
    this.metronomeEnabled = this.mixer.metronomeEnabled;
    this.metronomeVolume = this.mixer.metronomeVolume;

    this.voicingInstrument = this.fingeringDesigner.voicingInstrument;
    this.fingeringDesignId = this.fingeringDesigner.fingeringDesignId;
    this.stepVoicingOverrides = this.fingeringDesigner.stepVoicingOverrides;
    this.fingeringDesignPlan = this.fingeringDesigner.fingeringDesignPlan;
    this.harmonySteps = this.fingeringDesigner.harmonySteps;

    this.sessionRepetitions = this.sessionTracker.sessionRepetitions;
    this.speedTrainerEnabled = this.sessionTracker.speedTrainerEnabled;
    this.speedTrainerEveryLoops = this.sessionTracker.speedTrainerEveryLoops;

    /** Modelo Exercise derivado de ABC y tonalidad transpuestos. */
    this.exercise = new ComputedObservable([this.practice, this.transposedAbc, this.transposedKey], () => {
      const pr = this.practice.value;
      return pr ? new Exercise({ practiceId: pr.id, abc: this.transposedAbc.value, key: this.transposedKey.value, timeSignature: pr.timeSignature }) : null;
    });

    /** ABC preparado finalmente para renderizar con abcjs con capas de anotación independientes. */
    this.renderableAbc = new ComputedObservable(
      [
        this.practice,
        this.transposedAbc,
        this.viewMode,
        this.showFingerings,
        this.showLeftHand,
        this.showRightHand,
        this.showChordsOnScore,
        this.showOtherAnnotations,
        this.showBassFunctions,
        this.showHarmonicAnalysis,
        this._appVm.settings
      ],
      () => {
        const pr = this.practice.value;
        if (!pr) return '';
        const mode = this.viewMode.value;
        const isPiano = pr.instruments.includes('piano') && (pr.instruments.length === 1 || pr.instruments[0] === 'piano');
        return this._abc.prepareAbcForRender(this.transposedAbc.value, {
          viewMode: mode,
          chordNotation: this._appVm.settings.value.chordNotation,
          showFingerings: this.showFingerings.value,
          showLeftHand: this.showLeftHand.value,
          showRightHand: this.showRightHand.value,
          showChords: mode === 'pentagrama' ? false : this.showChordsOnScore.value,
          showOtherAnnotations: this.showOtherAnnotations.value,
          fingerings: pr.fingerings,
          showBassFunctions: this.showBassFunctions.value,
          showHarmonicAnalysis: this.showHarmonicAnalysis.value,
          harmonicAnalysis: pr.harmonicAnalysis || [],
          isBass: !isPiano && pr.instruments.includes('bajo'),
          isPiano,
          stripTitle: true
        });
      }
    );

    /** Estadísticas guardadas de la práctica activa en el progreso global. */
    this.practiceStats = new ComputedObservable([this.practice, this._appVm.progress], () => {
      const pr = this.practice.value;
      return pr ? this._appVm.progress.value.getPracticeStats(pr.id) : null;
    });

    /** Desuscripción guardada de `appVm.settings`. */
    this._unsubSettings = appVm.settings.subscribe((s) => {
      this.showLeftHand.set(s.showLeftHand ?? s.showFingerings ?? true);
      this.showRightHand.set(s.showRightHand ?? s.showFingerings ?? true);
      this.showFingerings.set(s.showFingerings ?? true);
      this.showChordsOnScore.set(s.showChordsOnScore ?? true);
      this.showOtherAnnotations.set(s.showOtherAnnotations ?? true);
      this.showBassFunctions.set(s.showBassFunctions ?? true);
      this.countInMeasures.set(s.countInMeasures);
      this._audio.configure({
        listeningRegister: s.listeningRegister,
        audioVisualOffsetMs: s.audioVisualOffsetMs ?? 0
      });
    });
  }

  /** Carga una práctica restaurando mezcla, diseño de digitaciones y línea de tiempo. */
  loadPractice(practice) {
    this.transport.stop();
    this.transport.bindAudioCallbacks();
    this.practice.set(practice || null);
    this.transposeSemitones.set(0);
    this.generatedWalkingAbc.set('');
    this.showChorusScore.set(false);
    this.lockChorusVariation.set(false);
    this.hasMultipleVoices.set(Boolean(practice?.abc && /^V:\s*2/m.test(practice.abc)));
    this.showHarmonicAnalysis.set(Boolean(practice?.harmonicAnalysis?.length > 0));

    this.sessionTracker.resetForPractice();
    this.mixer.loadForPractice(practice);
    this.fingeringDesigner.loadForPractice(practice);
    if (!practice) {
      this.chorusPlan.set(null);
      this.chorusScoreAbc.set('');
      this._audio.setChorusPlan?.(null);
      return;
    }

    this.bpm.set(practice.tempo.start);
    const activeDefaultInst = this._appVm.settings.value.defaultInstrument;
    const preferPianoHarmony =
      practice.type === 'harmony' &&
      practice.instruments.includes('piano') &&
      (practice.instruments.length === 1 || activeDefaultInst === 'piano');
    if (practice.type === 'harmony') this.viewMode.set(preferPianoHarmony ? 'cifrado' : 'diagramas');
    else if (this.viewMode.value === 'diagramas') this.viewMode.set('mixto');

    if (practice.type === 'harmony') {
      const harmonyTl = this.buildHarmonyTimeline();
      this.transport.resetForMeasures(harmonyTl.measureCount);
      this._audio.loadTimeline(harmonyTl);
    } else {
      this.transport.resetForMeasures(this.exercise.value?.measureCount || 4);
      this._loadMelodicTimeline(practice);
    }
    this._syncAudioConfig();
    this.regenerateChorusPlan();
  }

  /** Extrae y carga en audio la timeline melódica/mixta de la práctica activa. */
  _loadMelodicTimeline(practice) {
    const isPiano = practice.instruments.includes('piano') && (practice.instruments.length === 1 || practice.instruments[0] === 'piano');
    const timeline = this._abc.extractTimeline(null, this.transposedAbc.value, {
      instrument: isPiano ? 'piano' : (practice.instruments[0] || 'guitarra'),
      isBass: !isPiano && practice.instruments.includes('bajo'),
      isPiano,
      timeSignature: practice.timeSignature
    });
    enrichTimelineWithHarmonyVoicings(timeline, {
      timeSignature: practice.timeSignature,
      harmonySteps: this.harmonySteps.value,
      voicingInstrument: this.voicingInstrument.value
    });
    this._audio.loadTimeline(timeline);
  }

  /** Construye la línea de tiempo armónica delegando en `HarmonyTimelineService`. */
  buildHarmonyTimeline() {
    return buildHarmonyTimeline({
      timeSignature: this.practice.value?.timeSignature || '4/4',
      harmonySteps: this.harmonySteps.value,
      voicingInstrument: this.voicingInstrument.value
    });
  }

  /** Refresca la timeline armónica cuando cambia el diseño o instrumento de digitación. */
  _refreshHarmonyAudioTimeline() {
    const pr = this.practice.value;
    if (!pr || this.harmonySteps.value.length === 0) return;
    if (pr.type === 'harmony') {
      const harmonyTl = this.buildHarmonyTimeline();
      this.measureCount.set(harmonyTl.measureCount);
      this._audio.loadTimeline(harmonyTl);
    }
    this.regenerateChorusPlan();
  }

  /** Registra la timeline visual extraída tras renderizar con abcjs. */
  registerVisualTimeline(timeline) {
    if (!timeline) return;
    enrichTimelineWithHarmonyVoicings(timeline, {
      timeSignature: this.practice.value?.timeSignature || '4/4',
      harmonySteps: this.harmonySteps.value,
      voicingInstrument: this.voicingInstrument.value
    });
    this.measureCount.set(timeline.measureCount);
    if (timeline.hasMultipleVoices !== undefined) this.hasMultipleVoices.set(Boolean(timeline.hasMultipleVoices));
    if (this.loopEndMeasure.value > timeline.measureCount) this.loopEndMeasure.set(timeline.measureCount);
    this._audio.loadTimeline(timeline);
  }

  /** Empuja toda la configuración del reproductor hacia `AudioSynthService`. */
  _syncAudioConfig() {
    this._audio.configure({
      bpm: this.bpm.value,
      listeningRegister: this._appVm.settings.value.listeningRegister || 'real',
      audioVisualOffsetMs: this._appVm.settings.value.audioVisualOffsetMs ?? 0,
      ...this.transport.getAudioConfigPatch(),
      ...this.mixer.getAudioConfigPatch()
    });
  }

  /** Cambia el tempo en BPM (40-240). */
  setTempo(bpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(Number(bpm) || 80)));
    if (clamped !== this.bpm.value) this.sessionTracker.onTempoChanged();
    this.bpm.set(clamped);
    this._audio.configure({ bpm: clamped });
  }
  stepTempo(delta) { this.setTempo(this.bpm.value + Number(delta)); }

  /** Transpone melodía y cifrado juntos en semitonos (-11 a +11). */
  transpose(semitones) {
    if (this.isPlaying.value) this.stop();
    this.transposeSemitones.set(Math.max(-11, Math.min(11, Math.round(Number(semitones) || 0))));
    const pr = this.practice.value;
    if (!pr) return;
    if (pr.type === 'harmony') this._audio.loadTimeline(this.buildHarmonyTimeline());
    else this._loadMelodicTimeline(pr);
    this.regenerateChorusPlan();
  }
  resetTranspose() { this.transpose(0); }

  setViewMode(m) { if (['pentagrama', 'cifrado', 'diagramas', 'mixto'].includes(m)) this.viewMode.set(m); }
  setZoom(z) { this.zoom.set(Math.max(0.75, Math.min(1.6, Math.round(Number(z) * 100) / 100))); }
  setListeningRegister(r) { this._appVm.updateSettings({ listeningRegister: r }); }
  setAudioVisualOffsetMs(ms) {
    const safe = Math.max(-250, Math.min(250, Math.round(Number(ms) || 0)));
    this._appVm.updateSettings({ audioVisualOffsetMs: safe });
    this._audio.configure({ audioVisualOffsetMs: safe });
  }
  toggleFingerings() {
    const next = !this.showFingerings.value;
    this.showFingerings.set(next);
    this.showLeftHand.set(next);
    this.showRightHand.set(next);
  }
  toggleLeftHand() {
    const next = !this.showLeftHand.value;
    this.showLeftHand.set(next);
    this.showFingerings.set(next || this.showRightHand.value);
  }
  toggleRightHand() {
    const next = !this.showRightHand.value;
    this.showRightHand.set(next);
    this.showFingerings.set(this.showLeftHand.value || next);
  }
  toggleChordsOnScore() {
    this.showChordsOnScore.set(!this.showChordsOnScore.value);
  }
  toggleOtherAnnotations() {
    const next = !this.showOtherAnnotations.value;
    this.showOtherAnnotations.set(next);
    this.showBassFunctions.set(next);
  }
  toggleBassFunctions() { this.showBassFunctions.set(!this.showBassFunctions.value); }

  /**
   * Encuentra la siguiente práctica lógica dentro del mismo instrumento (priorizando el mismo nivel
   * o el siguiente) para ofrecer continuidad directa desde Modo Atril.
   * @returns {import('../models/Practice.js').Practice|null} Siguiente práctica o null.
   */
  getNextPracticeInContext() {
    const current = this.practice.value;
    if (!current) return null;
    const inst = this._appVm.settings.value.defaultInstrument || current.instruments[0] || 'guitarra';
    const pool = this._appVm.allPractices.value
      .filter((p) => p.instruments.includes(inst) && Boolean(p.isRepertoire) === Boolean(current.isRepertoire))
      .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'es-AR'));
    const idx = pool.findIndex((p) => p.id === current.id);
    if (idx >= 0 && idx + 1 < pool.length) return pool[idx + 1];
    return null;
  }

  /** Navega a la siguiente práctica sugerida del instrumento/nivel actual. */
  openNextPractice() {
    const next = this.getNextPracticeInContext();
    if (!next) return;
    this._appVm.activePracticeId.set(next.id);
    this._appVm.navigate(`#/practica/${encodeURIComponent(next.id)}`);
  }
  setSheetOpen(open, tab) { if (tab) this.activeSheetTab.set(tab); this.isSheetOpen.set(Boolean(open)); }
  toggleAtrilFullscreen() { this.isAtrilFullscreen.set(!this.isAtrilFullscreen.value); }
  getFormSections() { return extractFormSections(this.harmonySteps.value, this.measureCount.value); }
  loopSection(sec) {
    if (!sec) return;
    this.setLoop({ enabled: true, start: sec.startMeasure, end: sec.endMeasure });
    this._appVm.showSnackbar(`Bucle en sección ${sec.label} (compases ${sec.startMeasure}–${sec.endMeasure}).`);
  }

  /** Genera walking bass sobre la progresión actual delegando en el helper de fábrica. */
  generateWalkingForCurrent() {
    const abc = generateWalkingAbcForPractice({
      walkingBassGenerator: this._walkingGen,
      practice: this.practice.value,
      harmonySteps: this.harmonySteps.value,
      transposedKey: this.transposedKey.value
    });
    if (!abc) return '';
    this.generatedWalkingAbc.set(abc);
    this._appVm.showSnackbar('Walking bass generado sobre la progresión. Podés guardarlo como práctica editable.');
    return abc;
  }

  /** Guarda el walking bass generado como práctica editable del usuario. */
  async saveGeneratedWalkingAsPractice() {
    const abc = this.generatedWalkingAbc.value;
    const pr = this.practice.value;
    if (!abc || !pr) return;
    const nextPr = createWalkingBassPractice({ practice: pr, abc, transposedKey: this.transposedKey.value });
    await this._appVm.upsertUserPractice(nextPr);
    this._appVm.navigate(`#/editor/${encodeURIComponent(nextPr.id)}`);
  }

  /** Alterna verificación local delegando en `ProgressStore`. */
  async toggleVerifiedCurrent() {
    const pr = this.practice.value;
    if (!pr) return;
    const nextVerified = await this._appVm.togglePracticeVerified(pr);
    this._appVm.showSnackbar(nextVerified ? 'Transcripción marcada como verificada.' : 'Marcada como "A verificar".');
  }

  async toggleGoal(idx) { const pr = this.practice.value; if (pr) await this._appVm.toggleGoalChecked(pr.id, idx); }
  async duplicateAndEdit() {
    const pr = this.practice.value;
    if (!pr) return;
    const copy = pr.duplicateAsUser();
    await this._appVm.upsertUserPractice(copy);
    this._appVm.showSnackbar('Copia creada. Ya podés editarla libremente.');
    this._appVm.navigate(`#/editor/${encodeURIComponent(copy.id)}`);
  }
  editCurrent() {
    const pr = this.practice.value;
    if (!pr) return;
    if (pr.isReadOnly) this.duplicateAndEdit();
    else this._appVm.navigate(`#/editor/${encodeURIComponent(pr.id)}`);
  }
  exportCurrent(format = 'json') {
    const pr = this.practice.value;
    if (!pr || !this._io) return;
    const isAbc = format === 'abc';
    this._io.triggerBrowserDownload(
      `${pr.id}.${isAbc ? 'abc' : 'json'}`,
      isAbc ? this._io.exportPracticeAbc(pr) : this._io.exportPracticeJson(pr),
      isAbc ? 'text/vnd.abc' : 'application/json'
    );
    this._appVm.showSnackbar(isAbc ? 'Partitura exportada en .abc.' : 'Práctica exportada en JSON.');
  }

  /**
   * Pre-genera el coro completo para los modos Orgánico y Vivo, sincronizando el sintetizador,
   * la grilla de Cifrado (lookahead), los chips de Diagramas y la partitura ABC generada.
   * @param {{ rng?: Function }} [options={}] Opciones opcionales (ej. generador determinista para tests).
   * @returns {object|null} Plan de coro generado o null en modo Fijo / sin armonía.
   */
  regenerateChorusPlan(options = {}) {
    const pr = this.practice.value;
    const feel = this.compingFeel.value;
    if (!pr || feel === 'fijo') {
      this.chorusPlan.set(null);
      this.chorusScoreAbc.set('');
      this._audio.setChorusPlan?.(null);
      return null;
    }

    const steps = this.harmonySteps.value;
    const timeline = steps.length > 0
      ? this.buildHarmonyTimeline()
      : this._audio?._timeline;
    const chords = timeline?.chords || [];
    if (chords.length === 0) {
      this.chorusPlan.set(null);
      this.chorusScoreAbc.set('');
      this._audio.setChorusPlan?.(null);
      return null;
    }

    const vInst = normalizeVoicingInstrument(this.voicingInstrument.value);
    const isPiano = vInst === 'piano' || String(this.synthInstrument.value || '').includes('piano');
    const plan = planChorusComping({
      chords,
      beatsPerMeasure: timeline?.beatsPerMeasure || 4,
      pattern: this.compingPattern.value,
      compingFeel: feel,
      isPiano,
      chorusIndex: this._chorusGenerationCount++,
      rng: options.rng
    });

    const abc = buildChorusAbcScore(plan, {
      title: `${pr.title} (${feel === 'vivo' ? 'Vivo' : 'Orgánico'})`,
      key: this.transposedKey.value || pr.key || 'C',
      timeSignature: pr.timeSignature || '4/4',
      voicingInstrument: vInst
    });

    this._audio.setChorusPlan?.(plan);
    this.chorusPlan.set(plan, true);
    this.chorusScoreAbc.set(abc);
    return plan;
  }

  /** Muestra u oculta la partitura ABC generada del coro activo. */
  toggleShowChorusScore() {
    const next = !this.showChorusScore.value;
    if (next && !this.chorusPlan.value && this.compingFeel.value !== 'fijo') {
      this.regenerateChorusPlan();
    }
    this.showChorusScore.set(next);
  }

  /** Fija o libera la variación actual para conservarla entre repeticiones del bucle. */
  toggleLockChorusVariation() {
    this.lockChorusVariation.set(!this.lockChorusVariation.value);
  }

  /** Reproduce un conjunto exacto de alturas MIDI de una variación al tocar su chip en Diagramas. */
  playPreviewMidis(midis) {
    if (!Array.isArray(midis) || midis.length === 0) return;
    const vInst = normalizeVoicingInstrument(this.voicingInstrument.value);
    const isPiano = vInst === 'piano';
    const inst = isPiano
      ? (this.synthInstrument.value.includes('piano') ? this.synthInstrument.value : 'acoustic-piano')
      : vInst === 'bajo' || vInst === 'bajo-5'
        ? 'electric-bass'
        : (this.synthInstrument.value.includes('guitar') ? this.synthInstrument.value : 'acoustic-guitar');
    this._audio.playVoicing(midis, {
      mode: isPiano ? 'block' : 'strum-down',
      instrument: inst,
      duration: 1.5
    });
  }

  /** Guarda la partitura generada del coro activo como práctica editable en el Editor. */
  async saveChorusAsPractice() {
    const pr = this.practice.value;
    if (!pr) return null;
    if (!this.chorusScoreAbc.value) this.regenerateChorusPlan();
    const abc = this.chorusScoreAbc.value;
    if (!abc) return null;
    const nextPr = createChorusVariationPractice({
      practice: pr,
      abc,
      transposedKey: this.transposedKey.value,
      compingPattern: this.compingPattern.value,
      compingFeel: this.compingFeel.value,
      voicingInstrument: this.voicingInstrument.value
    });
    await this._appVm.upsertUserPractice(nextPr);
    this._appVm.showSnackbar('Variación guardada como práctica editable.');
    this._appVm.navigate(`#/editor/${encodeURIComponent(nextPr.id)}`);
    return nextPr;
  }

  // --- Delegación limpia hacia sub-ViewModels ---
  play() { this.transport.play(); }
  pause() { this.transport.pause(); }
  stop() { this.transport.stop(); }
  togglePlay() { this.transport.togglePlay(); }
  setLoop(c) { this.transport.setLoop(c); }
  setCountIn(m) { this.transport.setCountIn(m); }

  setCompingPattern(p) {
    this.mixer.setCompingPattern(p);
    this.regenerateChorusPlan();
  }
  setCompingFeel(feel) {
    this.mixer.setCompingFeel(feel);
    this.regenerateChorusPlan();
  }
  setSynthInstrument(i) { this.mixer.setSynthInstrument(i); }
  setVolumes(v) { this.mixer.setVolumes(v); }
  setChordsEnabled(e) { this.mixer.setChordsEnabled(e); }
  setBassEnabled(e) { this.mixer.setBassEnabled(e); }
  setMetronomeEnabled(e) { this.mixer.setMetronomeEnabled(e); }
  setVoiceMode(m) { this.mixer.setVoiceMode(m); }
  resetPracticeMix() { return this.mixer.resetPracticeMix(); }

  setVoicingInstrument(i) { this.fingeringDesigner.setVoicingInstrument(i); }
  setFingeringDesign(id) { this.fingeringDesigner.setFingeringDesign(id); }
  setStepVoicingOverride(idx, v) { this.fingeringDesigner.setStepVoicingOverride(idx, v); }
  getAvailableFingeringCriteria() { return this.fingeringDesigner.getAvailableFingeringCriteria(); }
  compareFingeringDesigns() { return this.fingeringDesigner.compareFingeringDesigns(); }
  saveFingeringDesignAsPractice() { return this.fingeringDesigner.saveFingeringDesignAsPractice(); }
  playStepVoicing(s) { this.fingeringDesigner.playStepVoicing(s); }

  setSpeedTrainer(c) { this.sessionTracker.setSpeedTrainer(c); }
  logManualRepetition() { return this.sessionTracker.logManualRepetition(); }

  /** Libera suscripciones, `ComputedObservable`, callbacks de audio, sub-ViewModels y WakeLock. */
  dispose() {
    this.transport.dispose();
    if (this._unsubSettings) {
      this._unsubSettings();
      this._unsubSettings = null;
    }
    this.practiceStats.dispose();
    this.renderableAbc.dispose();
    this.exercise.dispose();
    this.fingeringDesigner.dispose();
    this.transposedKey.dispose();
    this.transposedAbc.dispose();
    this.mixer.dispose();
    this.sessionTracker.dispose();
  }
}
