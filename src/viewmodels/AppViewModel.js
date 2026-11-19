import { Observable } from '../core/Observable.js';
import { Practice } from '../models/Practice.js';
import { UserProgress } from '../models/UserProgress.js';
import { Settings } from '../models/Settings.js';

/**
 * ViewModel raíz de la aplicación.
 * Centraliza el catálogo combinado (incluidas + usuario), los ajustes, el progreso global,
 * la navegación por hash, las notificaciones snackbar y la clase de ancho de ventana.
 */
export class AppViewModel {
  /**
   * Inicializa el AppViewModel inyectando los servicios necesarios.
   * @param {object} deps Dependencias inyectadas manualmente.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia local.
   * @param {import('../services/ThemeService.js').ThemeService} deps.themeService Gestión de tema Material 3.
   * @param {import('../services/WakeLockService.js').WakeLockService} deps.wakeLockService Bloqueo de pantalla.
   * @param {import('../core/Router.js').Router} deps.router Router por hash.
   * @param {import('../core/EventBus.js').EventBus} deps.eventBus Bus de eventos.
   * @param {Function} deps.loadCatalogFn Función asíncrona que carga el catálogo incluido.
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
    /** Observable con la ruta actual resuelta por el router. */
    this.currentRoute = this._router.currentRoute;
    /** Observable con el ID de la práctica seleccionada actualmente (para panel doble en escritorio). */
    this.activePracticeId = new Observable(null);
    /** Observable con la clase de tamaño de ventana Material 3 ('compact' | 'medium' | 'expanded'). */
    this.windowSizeClass = new Observable('compact');
    /** Observable con el mensaje de snackbar activo o null. */
    this.snackbar = new Observable(null);
    /** Observable de estado de carga inicial. */
    this.isReady = new Observable(false);

    /** Temporizador de autocierre para snackbars. */
    this._snackbarTimer = null;
  }

  /**
   * Carga el catálogo incluido, las prácticas de usuario, los ajustes y el progreso al arrancar.
   * @returns {Promise<void>}
   */
  async init() {
    const [builtinPractices, userRows, savedSettings, savedProgress] = await Promise.all([
      this._loadCatalogFn(),
      this._storage.getUserPractices(),
      this._storage.loadSettings(),
      this._storage.loadProgress()
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

    if (merged.length > 0 && !this.activePracticeId.value) {
      this.activePracticeId.set(merged[0].id);
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
   * Navega hacia una ruta hash mediante el router.
   * @param {string} hashPath Ruta destino (ej. "#/practicas").
   */
  navigate(hashPath) {
    this._router.navigate(hashPath);
  }

  /**
   * Actualiza la clase de ventana según el ancho actual del viewport (Material 3).
   * @param {number} widthPx Ancho de la ventana en píxeles.
   */
  updateWindowWidth(widthPx) {
    let nextClass = 'compact';
    if (widthPx >= 840) nextClass = 'expanded';
    else if (widthPx >= 600) nextClass = 'medium';
    this.windowSizeClass.set(nextClass);
  }

  /**
   * Muestra una notificación breve (snackbar) con acción opcional.
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

    const duration = options.durationMs ?? 3800;
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
   * Registra una sesión de práctica en el progreso del usuario y la persiste localmente.
   * @param {{ practiceId: string, bpm: number, targetBpm?: number, repetitions?: number, studySeconds?: number }} session Datos de sesión.
   * @returns {Promise<void>}
   */
  async recordPracticeSession(session) {
    const current = new UserProgress(this.progress.value.toJSON());
    current.recordSession(session);
    this.progress.set(current, true);
    await this._storage.saveProgress(current.toJSON());
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
   * Reemplaza el progreso completo (al importar backup o reiniciar).
   * @param {UserProgress} nextProgress Nueva instancia de progreso.
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
}
