/**
 * Bus de eventos liviano para comunicación desacoplada entre ViewModels y servicios.
 */
export class EventBus {
  /**
   * Inicializa el registro interno de canales de eventos.
   */
  constructor() {
    /** Mapa de nombre de evento hacia el conjunto de listeners suscriptos. */
    this._channels = new Map();
  }

  /**
   * Registra un listener para un nombre de evento específico.
   * @param {string} eventName Nombre del evento a escuchar.
   * @param {Function} handler Función manejadora del payload.
   * @returns {Function} Función para desuscribir el listener.
   */
  on(eventName, handler) {
    if (!this._channels.has(eventName)) {
      this._channels.set(eventName, new Set());
    }
    const listeners = this._channels.get(eventName);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      if (listeners.size === 0) {
        this._channels.delete(eventName);
      }
    };
  }

  /**
   * Publica un evento a todos los listeners registrados en ese canal.
   * @param {string} eventName Nombre del evento a emitir.
   * @param {*} [payload] Datos asociados al evento.
   */
  emit(eventName, payload) {
    const listeners = this._channels.get(eventName);
    if (!listeners) return;
    for (const handler of [...listeners]) {
      handler(payload);
    }
  }
}
