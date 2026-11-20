/**
 * Servicio que gestiona la Screen Wake Lock API para evitar que la pantalla se apague
 * mientras el usuario está practicando o reproduciendo un ejercicio.
 */
export class WakeLockService {
  /**
   * Inicializa el estado del bloqueo de pantalla y el listener de visibilidad.
   */
  constructor() {
    /** Sentinel activo devuelto por navigator.wakeLock.request(). */
    this._sentinel = null;
    /** Indica si la aplicación solicita mantener la pantalla encendida. */
    this._shouldHold = false;
    /** Indica si el usuario habilitó la función en Ajustes. */
    this._enabled = true;

    /** Listener de visibilidad guardado para poder removerlo en dispose(). */
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this._shouldHold && this._enabled) {
        this._acquire();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  /**
   * Libera el Wake Lock activo y remueve el listener de visibilidad del documento.
   */
  dispose() {
    this.release();
    if (typeof document !== 'undefined' && this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  /**
   * Indica si el navegador soporta la API Screen Wake Lock.
   * @returns {boolean} True si está disponible.
   */
  get isSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  /**
   * Habilita o deshabilita el comportamiento según el ajuste del usuario.
   * @param {boolean} enabled Nuevo estado de preferencia.
   */
  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    if (!this._enabled) {
      this.release();
    } else if (this._shouldHold) {
      this._acquire();
    }
  }

  /**
   * Solicita mantener la pantalla encendida durante la sesión activa.
   * @returns {Promise<void>}
   */
  async request() {
    this._shouldHold = true;
    if (!this._enabled) return;
    await this._acquire();
  }

  /**
   * Libera el bloqueo de pantalla cuando se pausa o finaliza la práctica.
   * @returns {Promise<void>}
   */
  async release() {
    this._shouldHold = false;
    if (this._sentinel) {
      try {
        await this._sentinel.release();
      } catch {
        // Ignora errores si el navegador ya lo liberó
      }
      this._sentinel = null;
    }
  }

  /**
   * Ejecuta internamente la solicitud al navegador de forma segura.
   * @returns {Promise<void>}
   */
  async _acquire() {
    if (!this.isSupported || this._sentinel) return;
    try {
      this._sentinel = await navigator.wakeLock.request('screen');
      this._sentinel.addEventListener('release', () => {
        this._sentinel = null;
      });
    } catch {
      this._sentinel = null;
    }
  }
}
