import { Observable } from '../core/Observable.js';

/**
 * ViewModel de infraestructura de UI del App Shell.
 * Gestiona estado efímero de ventana (clase Material 3 y orientación apaisada),
 * notificaciones snackbar con autocierre, vibración háptica y navegación SPA.
 */
export class AppShellViewModel {
  /**
   * Inicializa el ViewModel de UI del shell inyectando el router por hash.
   * @param {object} deps Dependencias de navegación.
   * @param {import('../core/Router.js').Router} deps.router Router SPA por hash.
   */
  constructor({ router }) {
    /** Router SPA por hash. */
    this._router = router;
    /** Observable con la ruta actual resuelta por el router. */
    this.currentRoute = router.currentRoute;
    /** Clase de tamaño de ventana Material 3 ('compact' | 'medium' | 'expanded'). */
    this.windowSizeClass = new Observable('compact');
    /** Indica si el dispositivo móvil está en orientación apaisada compacta. */
    this.isMobileLandscape = new Observable(false);
    /** Notificación snackbar activa o null. */
    this.snackbar = new Observable(null);
    /** Temporizador de autocierre para snackbars. */
    this._snackbarTimer = null;
  }

  /**
   * Navega hacia una ruta hash mediante el router SPA.
   * @param {string} hashPath Ruta destino (ej. "#/practicas").
   */
  navigate(hashPath) {
    this._router.navigate(hashPath);
  }

  /**
   * Actualiza la clase de tamaño Material 3 y la detección de celular apaisado.
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
   * @param {{ actionLabel?: string, onAction?: Function, durationMs?: number }} [options={}] Opciones de visualización.
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
        this._snackbarTimer = null;
        this.snackbar.set(null);
      }, duration);
    }
  }

  /**
   * Cierra manualmente el snackbar visible y cancela su temporizador.
   */
  dismissSnackbar() {
    if (this._snackbarTimer) {
      clearTimeout(this._snackbarTimer);
      this._snackbarTimer = null;
    }
    this.snackbar.set(null);
  }

  /**
   * Libera temporizadores activos al destruir el ViewModel del shell.
   */
  dispose() {
    this.dismissSnackbar();
  }
}
