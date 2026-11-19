import { Observable } from '../core/Observable.js';
import { Practice } from '../models/Practice.js';
import { UserProgress } from '../models/UserProgress.js';
import { Settings } from '../models/Settings.js';

/**
 * Mezcla de volúmenes predeterminada para cualquier práctica sin personalización previa.
 * La voz principal arranca al 100 % para garantizar audibilidad inmediata.
 */
export const DEFAULT_PRACTICE_MIX = {
  melody: 1.0,
  chords: 0.55,
  bass: 0.75,
  metronome: 0.65,
  chordsEnabled: true,
  metronomeEnabled: true
};

/**
 * Normaliza un objeto de mezcla garantizando números válidos en [0, 1] y melodía audible si está corrupta.
 * @param {object} [raw] Mezcla candidata.
 * @returns {typeof DEFAULT_PRACTICE_MIX} Mezcla saneada.
 */
export function sanitizePracticeMix(raw) {
  const safeNum = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  };
  return {
    melody: safeNum(raw?.melody, DEFAULT_PRACTICE_MIX.melody),
    chords: safeNum(raw?.chords, DEFAULT_PRACTICE_MIX.chords),
    bass: safeNum(raw?.bass, DEFAULT_PRACTICE_MIX.bass),
    metronome: safeNum(raw?.metronome, DEFAULT_PRACTICE_MIX.metronome),
    chordsEnabled: raw?.chordsEnabled !== undefined ? Boolean(raw.chordsEnabled) : DEFAULT_PRACTICE_MIX.chordsEnabled,
    metronomeEnabled: raw?.metronomeEnabled !== undefined ? Boolean(raw.metronomeEnabled) : DEFAULT_PRACTICE_MIX.metronomeEnabled
  };
}

/**
 * ViewModel raíz de la aplicación.
 * Centraliza catálogo combinado, ajustes, progreso, mezclas por práctica, sesiones guiadas,
 * navegación por hash, snackbars y geometría de ventana (clase de tamaño + orientación).
 */
export class AppViewModel {
  /**
   * Inicializa el AppViewModel inyectando los servicios necesarios.
   * @param {object} deps Dependencias inyectadas manualmente.
   */
  constructor({ storageService, themeService, wakeLockService, router, eventBus, loadCatalogFn }) {
    /** Servicio de persistencia IndexedDB/localStorage. */
    this._storage = storageService;
    /** Servicio de paleta dinámica y tema Material 3. */
    this._theme = themeService;
    /** Servicio de Wake Lock API. */
    this._wakeLock = wakeLockService;
    /** Router SPA por hash. */
    this._router = router;
    /** Bus de eventos interno. */
    this._eventBus = eventBus;
    /** Cargador del catálogo de prácticas incluidas. */
    this._loadCatalogFn = loadCatalogFn;

    /** Observable con todas las prácticas disponibles (incluidas + usuario). */
    this.allPractices = new Observable([]);
    /** Observable con los ajustes activos del usuario. */
    this.settings = new Observable(new Settings());
    /** Observable con el progreso acumulado del usuario. */
    this.progress = new Observable(new UserProgress());
    /** Mapa practiceId -> mezcla de audio personalizada guardada. */
    this.practiceMixes = new Observable({});
    /** Lista de sesiones de estudio personalizadas del usuario. */
    this.studySessions = new Observable([]);
    /** Sesión de estudio guiada en ejecución o null si no hay ninguna activa. */
    this.activeStudySession = new Observable(null);
    /** Observable con la ruta actual resuelta por el router. */
    this.currentRoute = this._router.currentRoute;
    /** Observable con el ID de la práctica seleccionada actualmente. */
    this.activePracticeId = new Observable(null);
    /** Observable con la clase de tamaño de ventana Material 3 ('compact' | 'medium' | 'expanded'). */
    this.windowSizeClass = new Observable('compact');
    /** Observable que indica si el dispositivo está en orientación horizontal (apaisado compacto). */
    this.isMobileLandscape = new Observable(false);
    /** Observable con el mensaje de snackbar activo o null. */
    this.snackbar = new Observable(null);
    /** Observable de estado de carga inicial. */
    this.isReady = new Observable(false);

    /** Temporizador de autocierre para snackbars. */
    this._snackbarTimer = null;
    /** Temporizador de cuenta regresiva para sesión de estudio guiada. */
    this._sessionTickTimer = null;
  }

  /**
   * Carga catálogo incluido, prácticas de usuario, ajustes, progreso, mezclas y sesiones.
   * @returns {Promise<void>}
   */
  async init() {
    const [builtinPractices, userRows, savedSettings, savedProgress, savedMixes, savedSessions] = await Promise.all([
      this._loadCatalogFn(),
      this._storage.getUserPractices(),
      this._storage.loadSettings(),
      this._storage.loadProgress(),
      this._storage.loadPracticeMixes ? this._storage.loadPracticeMixes() : Promise.resolve({}),
      this._storage.loadStudySessions ? this._storage.loadStudySessions() : Promise.resolve([])
    ]);

    const userPractices = [];
    for (const raw of userRows) {
      try {
        userPractices.push(new Practice({ ...raw, origin: 'user' }));
      } catch {
        // Omite registros corruptos si los hubiera
      }
    }

    const merged = [...builtinPractices, ...userPractices];
    this.allPractices.set(merged);

    const loadedSettings = new Settings(savedSettings || {});
    this.settings.set(loadedSettings);
    this._theme.apply(loadedSettings.theme, loadedSettings.seedColor);
    this._wakeLock.setEnabled(loadedSettings.wakeLockEnabled);

    const loadedProgress = new UserProgress(savedProgress || {});
    this.progress.set(loadedProgress);

    this.practiceMixes.set(savedMixes && typeof savedMixes === 'object' ? savedMixes : {});
    this.studySessions.set(Array.isArray(savedSessions) ? savedSessions : []);

    if (merged.length > 0 && !this.activePracticeId.value) {
      const preferred = merged.find((p) => p.instruments.includes(loadedSettings.defaultInstrument)) || merged[0];
      this.activePracticeId.set(preferred.id);
    }

    this.isReady.set(true);
  }

  /**
   * Busca una práctica por su ID dentro del catálogo combinado.
   * @param {string} id Identificador de la práctica.
   * @returns {Practice|null} Práctica encontrada o null.
   */
  findPracticeById(id) {
    return this.allPractices.value.find((p) => p.id === id) || null;
  }

  /**
   * Devuelve la mezcla guardada para una práctica o su mezcla predeterminada (melodía 100%).
   * @param {Practice|string|null} practiceOrId Instancia o ID de práctica.
   * @returns {typeof DEFAULT_PRACTICE_MIX} Mezcla saneada.
   */
  getPracticeMix(practiceOrId) {
    const id = typeof practiceOrId === 'string' ? practiceOrId : practiceOrId?.id;
    const saved = id ? this.practiceMixes.value[id] : null;
    if (saved) {
      return sanitizePracticeMix(saved);
    }
    const isBass = typeof practiceOrId === 'object' && practiceOrId?.instruments?.includes('bajo');
    return sanitizePracticeMix({
      ...DEFAULT_PRACTICE_MIX,
      melody: 1.0,
      bass: isBass ? 1.0 : 0.7
    });
  }

  /**
   * Guarda la mezcla personalizada de una práctica en almacenamiento local.
   * @param {string} practiceId ID de la práctica.
   * @param {object} mix Mezcla actualizada.
   * @returns {Promise<void>}
   */
  async savePracticeMix(practiceId, mix) {
    if (!practiceId) return;
    const sanitized = sanitizePracticeMix(mix);
    const nextMap = { ...this.practiceMixes.value, [practiceId]: sanitized };
    this.practiceMixes.set(nextMap);
    if (this._storage.savePracticeMixes) {
      await this._storage.savePracticeMixes(nextMap);
    }
  }

  /**
   * Elimina la mezcla personalizada de una práctica para volver a sus valores por defecto.
   * @param {string} practiceId ID de la práctica.
   * @returns {Promise<void>}
   */
  async resetPracticeMix(practiceId) {
    if (!practiceId) return;
    const nextMap = { ...this.practiceMixes.value };
    delete nextMap[practiceId];
    this.practiceMixes.set(nextMap);
    if (this._storage.savePracticeMixes) {
      await this._storage.savePracticeMixes(nextMap);
    }
  }

  /**
   * Navega hacia una ruta hash mediante el router.
   * @param {string} hashPath Ruta destino (ej. "#/practicas").
   */
  navigate(hashPath) {
    this._router.navigate(hashPath);
  }

  /**
   * Actualiza la clase de ventana Material 3 y la detección de celular en apaisado.
   * @param {number} widthPx Ancho del viewport en píxeles.
   * @param {number} [heightPx=800] Alto del viewport en píxeles.
   */
  updateWindowWidth(widthPx, heightPx = 800) {
    let nextClass = 'compact';
    if (widthPx >= 840) nextClass = 'expanded';
    else if (widthPx >= 600) nextClass = 'medium';
    this.windowSizeClass.set(nextClass);
    this.isMobileLandscape.set(widthPx > heightPx && heightPx <= 540);
  }

  /**
   * Emite una vibración háptica breve si el dispositivo lo soporta.
   * @param {number|number[]} [pattern=18] Duración o patrón en milisegundos.
   */
  triggerHaptic(pattern = 18) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignora dispositivos sin permiso de vibración
      }
    }
  }

  /**
   * Muestra una notificación breve (snackbar) con acción opcional (ej. "Deshacer").
   * @param {string} message Mensaje en español para el usuario.
   * @param {{ actionLabel?: string, onAction?: Function, durationMs?: number }} [options={}] Opciones.
   */
  showSnackbar(message, options = {}) {
    if (this._snackbarTimer) {
      clearTimeout(this._snackbarTimer);
      this._snackbarTimer = null;
    }
    this.snackbar.set({
      message,
      actionLabel: options.actionLabel || null,
      onAction: options.onAction || null
    }, true);

    const duration = options.durationMs ?? 4200;
    if (duration > 0) {
      this._snackbarTimer = setTimeout(() => {
        this.snackbar.set(null);
      }, duration);
    }
  }

  /**
   * Cierra manualmente el snackbar visible.
   */
  dismissSnackbar() {
    if (this._snackbarTimer) {
      clearTimeout(this._snackbarTimer);
      this._snackbarTimer = null;
    }
    this.snackbar.set(null);
  }

  /**
   * Guarda o actualiza una práctica de usuario en almacenamiento y en el catálogo reactivo.
   * @param {Practice} practice Instancia válida de Practice con origin "user".
   * @returns {Promise<Practice>} Práctica persistida.
   */
  async upsertUserPractice(practice) {
    const validated = practice instanceof Practice ? practice : new Practice({ ...practice, origin: 'user' });
    if (validated.isReadOnly) {
      throw new Error('Las prácticas incluidas no se modifican directamente; duplicála primero.');
    }

    await this._storage.saveUserPractice(validated.toJSON());

    const list = [...this.allPractices.value];
    const existingIdx = list.findIndex((p) => p.id === validated.id);
    if (existingIdx >= 0) {
      list[existingIdx] = validated;
    } else {
      list.push(validated);
    }
    this.allPractices.set(list);
    this.activePracticeId.set(validated.id);
    return validated;
  }

  /**
   * Elimina una práctica de usuario de IndexedDB y del catálogo observable.
   * @param {string} practiceId Identificador de la práctica a eliminar.
   * @returns {Promise<boolean>} True si fue eliminada.
   */
  async deleteUserPractice(practiceId) {
    const target = this.findPracticeById(practiceId);
    if (!target || target.isReadOnly) return false;

    await this._storage.deleteUserPractice(practiceId);
    const nextList = this.allPractices.value.filter((p) => p.id !== practiceId);
    this.allPractices.set(nextList);

    if (this.activePracticeId.value === practiceId) {
      this.activePracticeId.set(nextList[0]?.id || null);
    }
    return true;
  }

  /**
   * Importa múltiples prácticas de usuario validando y persistiendo cada una.
   * @param {Practice[]} practices Lista de prácticas válidas.
   * @returns {Promise<number>} Cantidad de prácticas guardadas.
   */
  async importUserPractices(practices) {
    let count = 0;
    for (const pr of practices) {
      await this.upsertUserPractice(pr);
      count += 1;
    }
    return count;
  }

  /**
   * Registra una sesión de práctica en el progreso del usuario y devuelve una instantánea previa
   * por si el usuario presiona "Deshacer".
   * @param {object} session Datos de la sesión.
   * @returns {Promise<object>} Instantánea JSON del progreso anterior.
   */
  async recordPracticeSession(session) {
    const previousSnapshot = this.progress.value.toJSON();
    const pr = this.findPracticeById(session.practiceId);
    const current = new UserProgress(previousSnapshot);
    current.recordSession({
      ...session,
      instruments: session.instruments || pr?.instruments || []
    });
    this.progress.set(current, true);
    await this._storage.saveProgress(current.toJSON());
    return previousSnapshot;
  }

  /**
   * Marca o desmarca un objetivo de la lista de verificación de una práctica.
   * @param {string} practiceId ID de la práctica.
   * @param {number} goalIndex Índice del objetivo.
   * @returns {Promise<boolean>} Nuevo estado tildado.
   */
  async toggleGoalChecked(practiceId, goalIndex) {
    const current = new UserProgress(this.progress.value.toJSON());
    const checked = current.toggleGoalChecked(practiceId, goalIndex);
    this.progress.set(current, true);
    await this._storage.saveProgress(current.toJSON());
    return checked;
  }

  /**
   * Desbloquea manualmente un nivel para que el usuario pueda saltar requisitos.
   * @param {number} levelNumber Nivel a desbloquear (2-5).
   * @returns {Promise<void>}
   */
  async skipToLevel(levelNumber) {
    const current = new UserProgress(this.progress.value.toJSON());
    current.skipToLevel(levelNumber);
    this.progress.set(current, true);
    await this._storage.saveProgress(current.toJSON());
    this.showSnackbar(`Nivel ${levelNumber} desbloqueado.`);
  }

  /**
   * Reemplaza el progreso completo (al importar backup, deshacer o reiniciar).
   * @param {UserProgress|object} nextProgress Nueva instancia o JSON de progreso.
   * @returns {Promise<void>}
   */
  async replaceProgress(nextProgress) {
    const safe = nextProgress instanceof UserProgress ? nextProgress : new UserProgress(nextProgress);
    this.progress.set(safe, true);
    await this._storage.saveProgress(safe.toJSON());
  }

  /**
   * Actualiza parcialmente los ajustes de la app, aplica el tema/WakeLock y persiste.
   * @param {Partial<Settings>} patch Campos de ajustes modificados.
   * @returns {Promise<void>}
   */
  async updateSettings(patch) {
    const next = this.settings.value.withPatch(patch);
    this.settings.set(next, true);
    this._theme.apply(next.theme, next.seedColor);
    this._wakeLock.setEnabled(next.wakeLockEnabled);
    await this._storage.saveSettings(next.toJSON());
    this._eventBus.emit('settings:changed', next);
  }

  /**
   * Guarda una sesión de estudio personalizada creada por el usuario.
   * @param {{ id?: string, title: string, instrument: string, items: Array<{ practiceId: string, minutes: number }> }} session Sesión a guardar.
   * @returns {Promise<void>}
   */
  async saveStudySession(session) {
    const entry = {
      id: session.id || `ses-${Date.now().toString(36)}`,
      title: String(session.title || 'Mi sesión de estudio').trim(),
      instrument: session.instrument || this.settings.value.defaultInstrument,
      items: (session.items || []).filter((it) => it.practiceId && Number(it.minutes) > 0)
    };
    const next = [...this.studySessions.value.filter((s) => s.id !== entry.id), entry];
    this.studySessions.set(next);
    if (this._storage.saveStudySessions) {
      await this._storage.saveStudySessions(next);
    }
    this.showSnackbar(`Sesión "${entry.title}" guardada.`);
  }

  /**
   * Elimina una sesión de estudio guardada.
   * @param {string} sessionId ID de la sesión.
   * @returns {Promise<void>}
   */
  async deleteStudySession(sessionId) {
    const next = this.studySessions.value.filter((s) => s.id !== sessionId);
    this.studySessions.set(next);
    if (this._storage.saveStudySessions) {
      await this._storage.saveStudySessions(next);
    }
  }

  /**
   * Inicia una sesión de estudio encadenada (sugerida o personalizada), navegando a la primera práctica
   * y llevando el temporizador paso a paso hasta el registro final.
   * @param {{ title: string, items: Array<{ practiceId: string, minutes: number }> }} session Plan de sesión.
   */
  startStudySession(session) {
    const validItems = (session?.items || []).filter((it) => this.findPracticeById(it.practiceId));
    if (validItems.length === 0) {
      this.showSnackbar('Agregá al menos una práctica para iniciar la sesión.');
      return;
    }

    this.stopStudySession(false);
    const first = validItems[0];
    this.activeStudySession.set({
      title: session.title || 'Sesión de hoy',
      items: validItems,
      currentIndex: 0,
      remainingSeconds: Math.max(60, Math.round(first.minutes * 60)),
      startedAtMs: Date.now(),
      completedItems: 0
    }, true);

    this._startSessionTicker();
    this.activePracticeId.set(first.practiceId);
    this.navigate(`#/practica/${encodeURIComponent(first.practiceId)}`);
  }

  /**
   * Avanza al siguiente bloque de la sesión guiada actual o finaliza registrando el tiempo estudiado.
   * @returns {Promise<void>}
   */
  async nextStudySessionStep() {
    const state = this.activeStudySession.value;
    if (!state) return;

    const currentItem = state.items[state.currentIndex];
    const pr = this.findPracticeById(currentItem.practiceId);
    const plannedSec = Math.max(60, Math.round(currentItem.minutes * 60));
    const spentSec = Math.max(15, plannedSec - state.remainingSeconds);

    if (pr) {
      await this.recordPracticeSession({
        practiceId: pr.id,
        bpm: pr.tempo.start,
        targetBpm: pr.tempo.target,
        repetitions: 1,
        studySeconds: spentSec
      });
    }

    const nextIdx = state.currentIndex + 1;
    if (nextIdx >= state.items.length) {
      this.triggerHaptic([24, 40, 36]);
      this.stopStudySession(false);
      this.showSnackbar(`¡Sesión "${state.title}" completada! Progreso registrado.`);
      this.navigate('#/progreso');
      return;
    }

    const nextItem = state.items[nextIdx];
    this.activeStudySession.set({
      ...state,
      currentIndex: nextIdx,
      remainingSeconds: Math.max(60, Math.round(nextItem.minutes * 60)),
      completedItems: state.completedItems + 1
    }, true);
    this.triggerHaptic(20);
    this.activePracticeId.set(nextItem.practiceId);
    this.navigate(`#/practica/${encodeURIComponent(nextItem.practiceId)}`);
  }

  /**
   * Detiene la sesión guiada activa y limpia su temporizador.
   * @param {boolean} [notify=true] Mostrar snackbar de confirmación.
   */
  stopStudySession(notify = true) {
    if (this._sessionTickTimer) {
      clearInterval(this._sessionTickTimer);
      this._sessionTickTimer = null;
    }
    const hadSession = Boolean(this.activeStudySession.value);
    this.activeStudySession.set(null);
    if (notify && hadSession) {
      this.showSnackbar('Sesión de estudio finalizada.');
    }
  }

  /**
   * Inicia el reloj de 1 segundo de la sesión guiada para encadenar automáticamente los pasos.
   */
  _startSessionTicker() {
    if (this._sessionTickTimer) clearInterval(this._sessionTickTimer);
    this._sessionTickTimer = setInterval(() => {
      const state = this.activeStudySession.value;
      if (!state) {
        clearInterval(this._sessionTickTimer);
        this._sessionTickTimer = null;
        return;
      }
      const nextRem = state.remainingSeconds - 1;
      if (nextRem <= 0) {
        this.nextStudySessionStep();
      } else {
        this.activeStudySession.set({ ...state, remainingSeconds: nextRem }, true);
      }
    }, 1000);
  }
}
