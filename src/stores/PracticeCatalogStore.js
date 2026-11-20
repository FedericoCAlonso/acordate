import { Observable } from '../core/Observable.js';
import { Practice } from '../models/Practice.js';

/**
 * Store de dominio para el catálogo combinado de prácticas (incluidas + creadas por el usuario)
 * y la selección activa de práctica.
 */
export class PracticeCatalogStore {
  /**
   * Inicializa el store de catálogo inyectando almacenamiento y cargador de catálogo incluido.
   * @param {object} deps Dependencias del store.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia local.
   * @param {Function} deps.loadCatalogFn Cargador asíncrono del catálogo incluido.
   */
  constructor({ storageService, loadCatalogFn }) {
    /** Servicio de persistencia local (IndexedDB / localStorage). */
    this._storage = storageService;
    /** Función que carga las prácticas incluidas de solo lectura. */
    this._loadCatalogFn = loadCatalogFn;

    /** Observable con todas las prácticas disponibles (incluidas + usuario). */
    this.allPractices = new Observable([]);
    /** Observable con el identificador de la práctica seleccionada actualmente. */
    this.activePracticeId = new Observable(null);
  }

  /**
   * Hidrata el catálogo combinado a partir de las prácticas incluidas y las guardadas por el usuario.
   * @param {string} [defaultInstrument='guitarra'] Instrumento preferido para seleccionar la práctica inicial.
   * @returns {Promise<Practice[]>} Catálogo combinado cargado.
   */
  async init(defaultInstrument = 'guitarra') {
    const [builtinPractices, userRows] = await Promise.all([
      this._loadCatalogFn(),
      this._storage.getUserPractices()
    ]);

    const userPractices = [];
    for (const raw of userRows) {
      try {
        userPractices.push(new Practice({ ...raw, origin: 'user' }));
      } catch {
        // Omite registros corruptos sin interrumpir la carga
      }
    }

    const merged = [...builtinPractices, ...userPractices];
    this.allPractices.set(merged);

    if (merged.length > 0 && !this.activePracticeId.value) {
      const preferred = merged.find((p) => p.instruments.includes(defaultInstrument)) || merged[0];
      this.activePracticeId.set(preferred.id);
    }

    return merged;
  }

  /**
   * Busca una práctica por identificador dentro del catálogo combinado.
   * @param {string} id Identificador de práctica.
   * @returns {Practice|null} Práctica encontrada o null.
   */
  findById(id) {
    return this.allPractices.value.find((p) => p.id === id) || null;
  }

  /**
   * Guarda o actualiza una práctica editable del usuario en almacenamiento y estado reactivo.
   * @param {Practice|object} practice Instancia o JSON de práctica de usuario.
   * @returns {Promise<Practice>} Práctica validada y persistida.
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
   * Elimina una práctica de usuario del almacenamiento y actualiza el catálogo reactivo.
   * @param {string} practiceId Identificador de la práctica a eliminar.
   * @returns {Promise<boolean>} True si la práctica fue eliminada.
   */
  async deleteUserPractice(practiceId) {
    const target = this.findById(practiceId);
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
   * Importa y persiste múltiples prácticas de usuario secuencialmente.
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
}
