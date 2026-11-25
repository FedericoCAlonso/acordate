import { Observable } from '../core/Observable.js';
import { DEFAULT_PRACTICE_MIX, sanitizePracticeMix } from '../models/PracticeMix.js';
import { PracticeCatalogStore } from '../stores/PracticeCatalogStore.js';
import { PracticeMixStore } from '../stores/PracticeMixStore.js';
import { ProgressStore } from '../stores/ProgressStore.js';
import { SettingsStore } from '../stores/SettingsStore.js';
import { StudySessionRunner } from '../stores/StudySessionRunner.js';
import { AppShellViewModel } from './AppShellViewModel.js';

export { DEFAULT_PRACTICE_MIX, sanitizePracticeMix };

/**
 * Fachada / Composition Root liviana de la aplicación.
 * Compone los stores de dominio (`PracticeCatalogStore`, `PracticeMixStore`, `ProgressStore`,
 * `SettingsStore`, `StudySessionRunner`) y el `AppShellViewModel` de UI efímera,
 * delegando cada responsabilidad al dueño correspondiente sin mezclar dominios.
 */
export class AppViewModel {
  /**
   * Construye el AppViewModel componiendo los stores inyectables (o creándolos desde los servicios base).
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({
    storageService,
    themeService,
    wakeLockService,
    router,
    eventBus,
    loadCatalogFn,
    shellVm = null,
    catalogStore = null,
    mixStore = null,
    progressStore = null,
    settingsStore = null,
    sessionRunner = null
  }) {
    /** ViewModel de infraestructura de UI (viewport, snackbar, haptics, navegación). */
    this.shellVm = shellVm || new AppShellViewModel({ router });
    /** Store del catálogo combinado de prácticas (incluidas + usuario). */
    this.catalogStore = catalogStore || new PracticeCatalogStore({ storageService, loadCatalogFn });
    /** Store de mezclas personalizadas por práctica. */
    this.mixStore = mixStore || new PracticeMixStore({ storageService });
    /** Store dueño único de `UserProgress` y sus mutaciones. */
    this.progressStore = progressStore || new ProgressStore({
      storageService,
      findPracticeById: (id) => this.catalogStore.findById(id)
    });
    /** Store de ajustes globales + coordinación con tema, WakeLock y EventBus. */
    this.settingsStore = settingsStore || new SettingsStore({
      storageService,
      themeService,
      wakeLockService,
      eventBus
    });
    /** Ejecutor de sesiones guiadas con lock anti-race y reloj por timestamp. */
    this.sessionRunner = sessionRunner || new StudySessionRunner({
      storageService,
      findPracticeById: (id) => this.catalogStore.findById(id),
      getDefaultInstrument: () => this.settingsStore.settings.value.defaultInstrument,
      recordPracticeSession: (session) => this.progressStore.recordPracticeSession(session),
      onSelectPractice: (practiceId) => {
        this.catalogStore.activePracticeId.set(practiceId);
        this.shellVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
      },
      onNavigate: (hashPath) => this.shellVm.navigate(hashPath),
      onNotify: (msg, opts) => this.shellVm.showSnackbar(msg, opts),
      onHaptic: (pattern) => this.shellVm.triggerHaptic(pattern)
    });

    // Referencias directas a observables de los stores (API estable para vistas y sub-ViewModels)
    /** Observable con todas las prácticas disponibles (incluidas + usuario). */
    this.allPractices = this.catalogStore.allPractices;
    /** Observable con el ID de la práctica seleccionada actualmente. */
    this.activePracticeId = this.catalogStore.activePracticeId;
    /** Observable con los ajustes activos del usuario. */
    this.settings = this.settingsStore.settings;
    /** Observable con el progreso acumulado del usuario. */
    this.progress = this.progressStore.progress;
    /** Mapa practiceId -> mezcla de audio personalizada guardada. */
    this.practiceMixes = this.mixStore.practiceMixes;
    /** Lista de sesiones de estudio personalizadas del usuario. */
    this.studySessions = this.sessionRunner.studySessions;
    /** Sesión de estudio guiada en ejecución o null si no hay ninguna activa. */
    this.activeStudySession = this.sessionRunner.activeStudySession;
    /** Observable con la ruta actual resuelta por el router. */
    this.currentRoute = this.shellVm.currentRoute;
    /** Observable con la clase de tamaño de ventana Material 3. */
    this.windowSizeClass = this.shellVm.windowSizeClass;
    /** Observable que indica si el dispositivo móvil está en apaisado compacto. */
    this.isMobileLandscape = this.shellVm.isMobileLandscape;
    /** Observable con el mensaje de snackbar activo o null. */
    this.snackbar = this.shellVm.snackbar;
    /** Observable de estado de carga inicial. */
    this.isReady = new Observable(false);
  }

  /**
   * Hidrata en paralelo todos los stores de dominio y marca la aplicación como lista.
   * @returns {Promise<void>}
   */
  async init() {
    const loadedSettings = await this.settingsStore.init();
    await Promise.all([
      this.catalogStore.init(loadedSettings.defaultInstrument),
      this.progressStore.init(),
      this.mixStore.init(),
      this.sessionRunner.init()
    ]);
    this.isReady.set(true);
  }

  // --- Delegación a PracticeCatalogStore ---
  /** Busca una práctica por su ID. */
  findPracticeById(id) { return this.catalogStore.findById(id); }
  /** Guarda o actualiza una práctica editable de usuario. */
  upsertUserPractice(practice) { return this.catalogStore.upsertUserPractice(practice); }
  /** Elimina una práctica editable de usuario. */
  deleteUserPractice(practiceId) { return this.catalogStore.deleteUserPractice(practiceId); }
  /** Importa múltiples prácticas de usuario. */
  importUserPractices(practices) { return this.catalogStore.importUserPractices(practices); }

  // --- Delegación a PracticeMixStore ---
  /** Devuelve la mezcla guardada o predeterminada para una práctica. */
  getPracticeMix(practiceOrId) { return this.mixStore.getPracticeMix(practiceOrId); }
  /** Guarda la mezcla personalizada de una práctica. */
  savePracticeMix(practiceId, mix) { return this.mixStore.savePracticeMix(practiceId, mix); }
  /** Restaura la mezcla predeterminada de una práctica. */
  resetPracticeMix(practiceId) { return this.mixStore.resetPracticeMix(practiceId); }

  // --- Delegación a ProgressStore ---
  /** Registra una sesión de práctica y devuelve snapshot previo para Deshacer. */
  recordPracticeSession(session) { return this.progressStore.recordPracticeSession(session); }
  /** Alterna el estado de un objetivo pedagógico. */
  toggleGoalChecked(practiceId, goalIndex) { return this.progressStore.toggleGoalChecked(practiceId, goalIndex); }
  /** Desbloquea manualmente un nivel y notifica al usuario. */
  async skipToLevel(levelNumber) {
    await this.progressStore.skipToLevel(levelNumber);
    this.showSnackbar(`Nivel ${levelNumber} desbloqueado.`);
  }
  /** Alterna la verificación local de una transcripción/práctica. */
  togglePracticeVerified(practiceOrId) { return this.progressStore.togglePracticeVerified(practiceOrId); }
  /** Marca o desmarca un acorde como favorito. */
  toggleFavoriteChord(chordSymbol) { return this.progressStore.toggleFavoriteChord(chordSymbol); }
  /** Registra una marca CPM del entrenador de cambios y devuelve el mejor registro. */
  recordChangeTrainerCpm(sequenceKey, cpm) { return this.progressStore.recordChangeTrainerCpm(sequenceKey, cpm); }
  /** Guarda una digitación personalizada en "Mis acordes". */
  saveCustomChord(voicingJson) { return this.progressStore.saveCustomChord(voicingJson); }
  /** Reemplaza el progreso completo (respaldo, Deshacer o reinicio). */
  replaceProgress(nextProgress) { return this.progressStore.replaceProgress(nextProgress); }

  // --- Delegación a SettingsStore ---
  /** Actualiza parcialmente los ajustes de la app y persiste. */
  updateSettings(patch) { return this.settingsStore.updateSettings(patch); }

  // --- Delegación a StudySessionRunner ---
  /** Guarda una sesión de estudio personalizada. */
  saveStudySession(session) { return this.sessionRunner.saveStudySession(session); }
  /** Elimina una sesión de estudio personalizada. */
  deleteStudySession(sessionId) { return this.sessionRunner.deleteStudySession(sessionId); }
  /** Inicia una sesión guiada encadenada. */
  startStudySession(session) { return this.sessionRunner.startStudySession(session); }
  /** Pausa o reanuda el temporizador de la sesión guiada activa. */
  togglePauseStudySession() { return this.sessionRunner.togglePauseStudySession(); }
  /** Retrocede al bloque anterior de la sesión guiada activa. */
  prevStudySessionStep() { return this.sessionRunner.prevStudySessionStep(); }
  /** Avanza al siguiente bloque de la sesión guiada activa. */
  nextStudySessionStep() { return this.sessionRunner.nextStudySessionStep(); }
  /** Detiene la sesión guiada activa. */
  stopStudySession(notify = true) { return this.sessionRunner.stopStudySession(notify); }

  // --- Delegación a AppShellViewModel ---
  /** Navega a una ruta hash. */
  navigate(hashPath) { return this.shellVm.navigate(hashPath); }
  /** Actualiza clase de tamaño Material 3 y detección de apaisado móvil. */
  updateWindowWidth(widthPx, heightPx = 800) { return this.shellVm.updateWindowWidth(widthPx, heightPx); }
  /** Dispara respuesta háptica si está soportada. */
  triggerHaptic(pattern = 18) { return this.shellVm.triggerHaptic(pattern); }
  /** Muestra un snackbar con acción opcional. */
  showSnackbar(message, options = {}) { return this.shellVm.showSnackbar(message, options); }
  /** Cierra manualmente el snackbar visible. */
  dismissSnackbar() { return this.shellVm.dismissSnackbar(); }

  /**
   * Libera todos los temporizadores y recursos retenidos por los stores y el shell.
   */
  dispose() {
    this.sessionRunner.dispose();
    this.shellVm.dispose();
  }
}
