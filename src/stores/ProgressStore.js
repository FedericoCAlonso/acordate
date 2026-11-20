import { Observable } from '../core/Observable.js';
import { UserProgress } from '../models/UserProgress.js';

/**
 * Store dueño único del progreso global del usuario (`UserProgress`).
 * Centraliza todas las mutaciones inmutables y su persistencia para evitar fugas de
 * encapsulamiento desde otros ViewModels.
 */
export class ProgressStore {
  /**
   * Inicializa el store de progreso inyectando almacenamiento y acceso al catálogo.
   * @param {object} deps Dependencias del store.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia local.
   * @param {Function} [deps.findPracticeById] Función para resolver instrumentos de una práctica.
   */
  constructor({ storageService, findPracticeById = () => null }) {
    /** Servicio de persistencia local. */
    this._storage = storageService;
    /** Buscador de prácticas para enriquecer sesiones con sus instrumentos. */
    this._findPracticeById = findPracticeById;
    /** Observable con la instancia activa de UserProgress. */
    this.progress = new Observable(new UserProgress());
  }

  /**
   * Carga el progreso persistido desde almacenamiento local.
   * @returns {Promise<UserProgress>} Progreso hidratado.
   */
  async init() {
    const saved = await this._storage.loadProgress();
    const loaded = new UserProgress(saved || {});
    this.progress.set(loaded);
    return loaded;
  }

  /**
   * Clona el progreso actual, aplica un mutador y persiste la nueva instantánea.
   * @param {(draft: UserProgress) => *} mutator Función que muta la copia de UserProgress.
   * @returns {Promise<{ next: UserProgress, result: *, previousSnapshot: object }>} Estado previo, nuevo y retorno.
   */
  async _commit(mutator) {
    const previousSnapshot = this.progress.value.toJSON();
    const next = new UserProgress(previousSnapshot);
    const result = mutator(next);
    this.progress.set(next, true);
    await this._storage.saveProgress(next.toJSON());
    return { next, result, previousSnapshot };
  }

  /**
   * Registra una sesión de práctica y devuelve la instantánea previa (para acción "Deshacer").
   * @param {object} session Datos de la sesión registrada.
   * @returns {Promise<object>} Instantánea JSON anterior al registro.
   */
  async recordPracticeSession(session) {
    const pr = this._findPracticeById(session.practiceId);
    const { previousSnapshot } = await this._commit((draft) => {
      draft.recordSession({
        ...session,
        instruments: session.instruments || pr?.instruments || []
      });
    });
    return previousSnapshot;
  }

  /**
   * Alterna el estado tildado de un objetivo de verificación de una práctica.
   * @param {string} practiceId Identificador de práctica.
   * @param {number} goalIndex Índice del objetivo.
   * @returns {Promise<boolean>} Nuevo estado tildado.
   */
  async toggleGoalChecked(practiceId, goalIndex) {
    const { result } = await this._commit((draft) => draft.toggleGoalChecked(practiceId, goalIndex));
    return result;
  }

  /**
   * Desbloquea manualmente un nivel permitiendo saltar requisitos previos.
   * @param {number} levelNumber Número de nivel (2-5).
   * @returns {Promise<void>}
   */
  async skipToLevel(levelNumber) {
    await this._commit((draft) => draft.skipToLevel(levelNumber));
  }

  /**
   * Alterna el estado de verificación local de una transcripción/práctica de repertorio.
   * @param {import('../models/Practice.js').Practice|string} practiceOrId Práctica o ID.
   * @returns {Promise<boolean>} Nuevo estado verificado (true si quedó verificada).
   */
  async togglePracticeVerified(practiceOrId) {
    const practiceId = typeof practiceOrId === 'string' ? practiceOrId : practiceOrId?.id;
    if (!practiceId) return false;
    const { result } = await this._commit((draft) => {
      const currentlyVerified = draft.isPracticeVerified(practiceOrId);
      draft.setPracticeVerified(practiceId, !currentlyVerified);
      return !currentlyVerified;
    });
    return result;
  }

  /**
   * Marca o desmarca un acorde como favorito del usuario.
   * @param {string} chordSymbol Símbolo americano del acorde.
   * @returns {Promise<boolean>} True si el acorde quedó guardado en favoritos.
   */
  async toggleFavoriteChord(chordSymbol) {
    const { result } = await this._commit((draft) => draft.toggleFavoriteChord(chordSymbol));
    return result;
  }

  /**
   * Registra una marca de cambios por minuto (CPM) en el entrenador de cambios.
   * @param {string} sequenceKey Clave legible de la secuencia (ej. "G – C").
   * @param {number} cpm Cambios por minuto logrados.
   * @returns {Promise<number>} Mejor marca histórica para esa secuencia.
   */
  async recordChangeTrainerCpm(sequenceKey, cpm) {
    const { result } = await this._commit((draft) => draft.recordChangeTrainerCpm(sequenceKey, cpm));
    return result;
  }

  /**
   * Guarda una digitación personalizada en la colección "Mis acordes" del usuario.
   * @param {object} voicingJson Representación serializable del Voicing.
   * @returns {Promise<void>}
   */
  async saveCustomChord(voicingJson) {
    await this._commit((draft) => draft.saveCustomChord(voicingJson));
  }

  /**
   * Reemplaza el progreso completo (respaldo importado, acción Deshacer o reinicio).
   * @param {UserProgress|object} nextProgress Nueva instancia o JSON de progreso.
   * @returns {Promise<void>}
   */
  async replaceProgress(nextProgress) {
    const safe = nextProgress instanceof UserProgress ? nextProgress : new UserProgress(nextProgress);
    this.progress.set(safe, true);
    await this._storage.saveProgress(safe.toJSON());
  }
}
