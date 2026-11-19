/**
 * Nombre de la base de datos IndexedDB de la aplicación.
 */
const DB_NAME = 'acordate-db';

/**
 * Versión del esquema de IndexedDB.
 */
const DB_VERSION = 1;

/**
 * Clave de respaldo en localStorage para ajustes livianos.
 */
const SETTINGS_LS_KEY = 'acordate_settings_v1';

/**
 * Clave de respaldo en localStorage para el borrador automático del editor.
 */
const DRAFT_LS_KEY = 'acordate_editor_draft_v1';

/**
 * Servicio de persistencia local basado en IndexedDB (prácticas de usuario, progreso,
 * ajustes y borradores), con fallback seguro a localStorage para ajustes pequeños.
 */
export class StorageService {
  /**
   * Inicializa el servicio de almacenamiento local.
   */
  constructor() {
    /** Promesa cacheada de conexión abierta a IndexedDB. */
    this._dbPromise = null;
  }

  /**
   * Abre o crea la base de datos IndexedDB con los object stores requeridos.
   * @returns {Promise<IDBDatabase|null>} Instancia de IDBDatabase o null si no está disponible.
   */
  async _openDb() {
    if (typeof indexedDB === 'undefined') {
      return null;
    }
    if (this._dbPromise) {
      return this._dbPromise;
    }

    this._dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('practices')) {
            db.createObjectStore('practices', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('progress')) {
            db.createObjectStore('progress', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: 'key' });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this._dbPromise;
  }

  /**
   * Ejecuta una transacción simple sobre un object store de IndexedDB.
   * @param {string} storeName Nombre del object store.
   * @param {'readonly'|'readwrite'} mode Modo de transacción.
   * @param {Function} operation Función que recibe el store y devuelve un IDBRequest.
   * @returns {Promise<*>} Resultado de la operación.
   */
  async _withStore(storeName, mode, operation) {
    const db = await this._openDb();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = operation(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Obtiene todas las prácticas creadas por el usuario desde IndexedDB.
   * @returns {Promise<object[]>} Lista de objetos JSON de prácticas de usuario.
   */
  async getUserPractices() {
    try {
      const rows = await this._withStore('practices', 'readonly', (store) => store.getAll());
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  /**
   * Guarda o actualiza una práctica de usuario en IndexedDB.
   * @param {object} practiceJson Práctica serializada en JSON.
   * @returns {Promise<void>}
   */
  async saveUserPractice(practiceJson) {
    await this._withStore('practices', 'readwrite', (store) => store.put(practiceJson));
  }

  /**
   * Elimina una práctica de usuario por su identificador.
   * @param {string} practiceId ID de la práctica a borrar.
   * @returns {Promise<void>}
   */
  async deleteUserPractice(practiceId) {
    await this._withStore('practices', 'readwrite', (store) => store.delete(practiceId));
  }

  /**
   * Carga el progreso del usuario guardado localmente.
   * @returns {Promise<object|null>} Objeto de progreso o null si aún no existe.
   */
  async loadProgress() {
    try {
      const row = await this._withStore('progress', 'readonly', (store) => store.get('main'));
      return row?.data || null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda el progreso del usuario en IndexedDB.
   * @param {object} progressJson Progreso serializado.
   * @returns {Promise<void>}
   */
  async saveProgress(progressJson) {
    await this._withStore('progress', 'readwrite', (store) =>
      store.put({ key: 'main', data: progressJson })
    );
  }

  /**
   * Carga los ajustes del usuario desde IndexedDB o desde localStorage como respaldo.
   * @returns {Promise<object|null>} Objeto de ajustes o null.
   */
  async loadSettings() {
    try {
      const row = await this._withStore('settings', 'readonly', (store) => store.get('main'));
      if (row?.data) return row.data;
    } catch {
      // Continúa hacia fallback de localStorage
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(SETTINGS_LS_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Guarda los ajustes en IndexedDB y replica en localStorage para acceso rápido inicial.
   * @param {object} settingsJson Ajustes serializados.
   * @returns {Promise<void>}
   */
  async saveSettings(settingsJson) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(settingsJson));
      }
    } catch {
      // Ignora cuotas de localStorage si falla
    }
    try {
      await this._withStore('settings', 'readwrite', (store) =>
        store.put({ key: 'main', data: settingsJson })
      );
    } catch {
      // Fallback ya persistido en localStorage
    }
  }

  /**
   * Guarda un borrador automático del editor para evitar pérdida de cambios.
   * @param {string} draftKey Identificador del borrador (por ejemplo ID de práctica o 'nueva').
   * @param {object} draftData Contenido del borrador.
   * @returns {Promise<void>}
   */
  async saveDraft(draftKey, draftData) {
    const payload = { key: draftKey, data: draftData, updatedAt: Date.now() };
    try {
      await this._withStore('drafts', 'readwrite', (store) => store.put(payload));
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${DRAFT_LS_KEY}_${draftKey}`, JSON.stringify(payload));
      }
    }
  }

  /**
   * Recupera un borrador guardado del editor.
   * @param {string} draftKey Identificador del borrador.
   * @returns {Promise<{ data: object, updatedAt: number }|null>} Borrador encontrado o null.
   */
  async loadDraft(draftKey) {
    try {
      const row = await this._withStore('drafts', 'readonly', (store) => store.get(draftKey));
      if (row?.data) return { data: row.data, updatedAt: row.updatedAt };
    } catch {
      // Fallback
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`${DRAFT_LS_KEY}_${draftKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { data: parsed.data, updatedAt: parsed.updatedAt };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Borra un borrador del editor una vez que la práctica fue guardada o descartada.
   * @param {string} draftKey Identificador del borrador.
   * @returns {Promise<void>}
   */
  async clearDraft(draftKey) {
    try {
      await this._withStore('drafts', 'readwrite', (store) => store.delete(draftKey));
    } catch {
      // Ignora
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${DRAFT_LS_KEY}_${draftKey}`);
      }
    } catch {
      // Ignora
    }
  }
}
