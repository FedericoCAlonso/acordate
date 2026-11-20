import { Observable } from '../core/Observable.js';
import { Settings } from '../models/Settings.js';

/**
 * Store de dominio para los ajustes globales de la aplicación (`Settings`).
 * Coordina la persistencia con `ThemeService`, `WakeLockService` y `EventBus`.
 */
export class SettingsStore {
  /**
   * Inicializa el store de ajustes inyectando los servicios dependientes.
   * @param {object} deps Dependencias del store.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia local.
   * @param {import('../services/ThemeService.js').ThemeService} deps.themeService Servicio de tema M3.
   * @param {import('../services/WakeLockService.js').WakeLockService} deps.wakeLockService Bloqueo de pantalla.
   * @param {import('../core/EventBus.js').EventBus} deps.eventBus Bus de eventos global.
   */
  constructor({ storageService, themeService, wakeLockService, eventBus }) {
    /** Servicio de persistencia local. */
    this._storage = storageService;
    /** Servicio de paleta dinámica Material 3. */
    this._theme = themeService;
    /** Servicio de Wake Lock API. */
    this._wakeLock = wakeLockService;
    /** Bus de eventos interno. */
    this._eventBus = eventBus;
    /** Observable con los ajustes activos del usuario. */
    this.settings = new Observable(new Settings());
  }

  /**
   * Carga los ajustes guardados y aplica tema visual y política de Wake Lock al arrancar.
   * @returns {Promise<Settings>} Ajustes cargados.
   */
  async init() {
    const saved = await this._storage.loadSettings();
    const loaded = new Settings(saved || {});
    this.settings.set(loaded);
    this._theme.apply(loaded.theme, loaded.seedColor);
    this._wakeLock.setEnabled(loaded.wakeLockEnabled);
    return loaded;
  }

  /**
   * Actualiza parcialmente los ajustes, aplica efectos secundarios y persiste en almacenamiento.
   * @param {Partial<Settings>} patch Campos de ajustes a modificar.
   * @returns {Promise<Settings>} Nueva instancia de ajustes.
   */
  async updateSettings(patch) {
    const next = this.settings.value.withPatch(patch);
    this.settings.set(next, true);
    this._theme.apply(next.theme, next.seedColor);
    this._wakeLock.setEnabled(next.wakeLockEnabled);
    await this._storage.saveSettings(next.toJSON());
    this._eventBus.emit('settings:changed', next);
    return next;
  }
}
