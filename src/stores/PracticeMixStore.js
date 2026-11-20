import { Observable } from '../core/Observable.js';
import { DEFAULT_PRACTICE_MIX, sanitizePracticeMix } from '../models/PracticeMix.js';

/**
 * Store de dominio responsable de almacenar, resolver y persistir las mezclas de volumen
 * personalizadas por práctica.
 */
export class PracticeMixStore {
  /**
   * Inicializa el store de mezclas inyectando el servicio de almacenamiento.
   * @param {object} deps Dependencias del store.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia local.
   */
  constructor({ storageService }) {
    /** Servicio de persistencia local. */
    this._storage = storageService;
    /** Mapa observable practiceId -> mezcla de audio guardada. */
    this.practiceMixes = new Observable({});
  }

  /**
   * Carga desde almacenamiento el mapa de mezclas guardadas por práctica.
   * @returns {Promise<Record<string, object>>} Mapa de mezclas hidratado.
   */
  async init() {
    const saved = this._storage.loadPracticeMixes
      ? await this._storage.loadPracticeMixes()
      : {};
    const safe = saved && typeof saved === 'object' ? saved : {};
    this.practiceMixes.set(safe);
    return safe;
  }

  /**
   * Obtiene la mezcla guardada para una práctica o su mezcla predeterminada (voz principal al 100 %).
   * @param {import('../models/Practice.js').Practice|string|null} practiceOrId Instancia o ID de práctica.
   * @returns {ReturnType<typeof sanitizePracticeMix>} Mezcla saneada.
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
   * Guarda la mezcla personalizada de una práctica y la persiste en almacenamiento local.
   * @param {string} practiceId Identificador de la práctica.
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
   * Elimina la mezcla personalizada de una práctica para restaurar los valores predeterminados.
   * @param {string} practiceId Identificador de la práctica.
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
}
