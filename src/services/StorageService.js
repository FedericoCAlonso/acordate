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
 * Clave de respaldo en localStorage para mezclas por práctica.
 */
const MIXES_LS_KEY = 'acordate_practice_mixes_v1';

/**
 * Clave de respaldo en localStorage para sesiones de estudio armadas por el usuario.
 */
const SESSIONS_LS_KEY = 'acordate_study_sessions_v1';

/**
 * Clave de respaldo en localStorage para el borrador automático del editor.
 */
const DRAFT_LS_KEY = 'acordate_editor_draft_v1';

/**
 * Claves de respaldo en localStorage para prácticas de usuario y progreso cuando IndexedDB no está disponible.
 */
const PRACTICES_LS_KEY = 'acordate_user_practices_v1';
const PROGRESS_LS_KEY = 'acordate_progress_v1';

/**
 * Servicio de persistencia local basado en IndexedDB (prácticas de usuario, progreso,
 * ajustes, mezclas por práctica, sesiones y borradores), con respaldo seguro en localStorage.
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
   * Nunca cachea una conexión fallida (`null`) y maneja `onblocked` / `onversionchange`.
   * @returns {Promise<IDBDatabase|null>} Instancia de IDBDatabase o null si no está disponible.
   */
  async _openDb() {
    if (typeof indexedDB === 'undefined') {
      return null;
    }
    if (this._dbPromise) {
      return this._dbPromise;
    }

    const promise = new Promise((resolve) => {
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

        request.onblocked = () => {
          this._dbPromise = null;
          resolve(null);
        };

        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            try { db.close(); } catch { /* ignore */ }
            this._dbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          this._dbPromise = null;
          resolve(null);
        };
      } catch {
        this._dbPromise = null;
        resolve(null);
      }
    });

    this._dbPromise = promise;
    const db = await promise;
    if (!db) this._dbPromise = null;
    return db;
  }

  /**
   * Ejecuta una transacción segura sobre un object store de IndexedDB,
   * esperando `tx.oncomplete` en escrituras para garantizar durabilidad real.
   * @param {string} storeName Nombre del object store.
   * @param {'readonly'|'readwrite'} mode Modo de transacción.
   * @param {Function} operation Función que recibe el store y devuelve un IDBRequest.
   * @returns {Promise<*>} Resultado de la operación.
   */
  async _withStore(storeName, mode, operation) {
    const db = await this._openDb();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = operation(store);
        let reqResult;
        req.onsuccess = () => {
          reqResult = req.result;
          if (mode === 'readonly') resolve(reqResult);
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => {
          if (mode !== 'readonly') resolve(reqResult);
        };
        tx.onabort = () => reject(tx.error || new Error('Transacción IndexedDB abortada'));
        tx.onerror = () => reject(tx.error || new Error('Error en transacción IndexedDB'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Lee prácticas de usuario desde el respaldo localStorage. */
  _readPracticesFallback() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(PRACTICES_LS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // Storage inaccesible
    }
    return [];
  }

  /** Escribe prácticas de usuario en el respaldo localStorage sin lanzar ante cuota llena. */
  _writePracticesFallback(list) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PRACTICES_LS_KEY, JSON.stringify(list));
      }
    } catch {
      // Ignora cuota llena
    }
  }

  /**
   * Obtiene todas las prácticas creadas por el usuario desde IndexedDB (o respaldo localStorage).
   * @returns {Promise<object[]>} Lista de objetos JSON de prácticas de usuario.
   */
  async getUserPractices() {
    try {
      const rows = await this._withStore('practices', 'readonly', (store) => store.getAll());
      if (Array.isArray(rows)) return rows;
    } catch {
      // Fallback
    }
    return this._readPracticesFallback();
  }

  /**
   * Guarda o actualiza una práctica de usuario en IndexedDB con respaldo localStorage.
   * @param {object} practiceJson Práctica serializada en JSON.
   * @returns {Promise<void>}
   */
  async saveUserPractice(practiceJson) {
    const fallback = this._readPracticesFallback().filter((p) => p?.id !== practiceJson?.id);
    fallback.push(practiceJson);
    this._writePracticesFallback(fallback);
    try {
      await this._withStore('practices', 'readwrite', (store) => store.put(practiceJson));
    } catch {
      // Respaldado en localStorage
    }
  }

  /**
   * Elimina una práctica de usuario por su identificador en IndexedDB y respaldo localStorage.
   * @param {string} practiceId ID de la práctica a borrar.
   * @returns {Promise<void>}
   */
  async deleteUserPractice(practiceId) {
    const fallback = this._readPracticesFallback().filter((p) => p?.id !== practiceId);
    this._writePracticesFallback(fallback);
    try {
      await this._withStore('practices', 'readwrite', (store) => store.delete(practiceId));
    } catch {
      // Respaldado en localStorage
    }
  }

  /**
   * Carga el progreso del usuario guardado localmente (IndexedDB con respaldo localStorage).
   * @returns {Promise<object|null>} Objeto de progreso o null si aún no existe.
   */
  async loadProgress() {
    try {
      const row = await this._withStore('progress', 'readonly', (store) => store.get('main'));
      if (row?.data) return row.data;
    } catch {
      // Fallback
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(PROGRESS_LS_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Guarda el progreso del usuario en IndexedDB con respaldo seguro en localStorage.
   * @param {object} progressJson Progreso serializado.
   * @returns {Promise<void>}
   */
  async saveProgress(progressJson) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PROGRESS_LS_KEY, JSON.stringify(progressJson));
      }
    } catch {
      // Ignora cuota llena
    }
    try {
      await this._withStore('progress', 'readwrite', (store) =>
        store.put({ key: 'main', data: progressJson })
      );
    } catch {
      // Respaldado en localStorage
    }
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
      // Fallback
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
      // Ignora cuotas
    }
    try {
      await this._withStore('settings', 'readwrite', (store) =>
        store.put({ key: 'main', data: settingsJson })
      );
    } catch {
      // Ya persistido en localStorage
    }
  }

  /**
   * Carga el mapa de mezclas de audio personalizadas por ID de práctica.
   * @returns {Promise<Record<string, object>>} Mapa practiceId -> mezcla guardada.
   */
  async loadPracticeMixes() {
    try {
      const row = await this._withStore('settings', 'readonly', (store) => store.get('practiceMixes'));
      if (row?.data && typeof row.data === 'object') return row.data;
    } catch {
      // Fallback
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(MIXES_LS_KEY);
        return raw ? JSON.parse(raw) : {};
      }
    } catch {
      return {};
    }
    return {};
  }

  /**
   * Guarda el mapa de mezclas personalizadas por práctica.
   * @param {Record<string, object>} mixesMap Mapa practiceId -> configuración de volúmenes.
   * @returns {Promise<void>}
   */
  async savePracticeMixes(mixesMap) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MIXES_LS_KEY, JSON.stringify(mixesMap));
      }
    } catch {
      // Ignora
    }
    try {
      await this._withStore('settings', 'readwrite', (store) =>
        store.put({ key: 'practiceMixes', data: mixesMap })
      );
    } catch {
      // Fallback en localStorage
    }
  }

  /**
   * Carga las sesiones de estudio personalizadas (listas ordenadas con minutos por práctica).
   * @returns {Promise<Array<object>>} Lista de sesiones guardadas.
   */
  async loadStudySessions() {
    try {
      const row = await this._withStore('settings', 'readonly', (store) => store.get('studySessions'));
      if (Array.isArray(row?.data)) return row.data;
    } catch {
      // Fallback
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(SESSIONS_LS_KEY);
        return raw ? JSON.parse(raw) : [];
      }
    } catch {
      return [];
    }
    return [];
  }

  /**
   * Guarda las sesiones de estudio personalizadas del usuario.
   * @param {Array<object>} sessions Lista de sesiones.
   * @returns {Promise<void>}
   */
  async saveStudySessions(sessions) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SESSIONS_LS_KEY, JSON.stringify(sessions));
      }
    } catch {
      // Ignora
    }
    try {
      await this._withStore('settings', 'readwrite', (store) =>
        store.put({ key: 'studySessions', data: sessions })
      );
    } catch {
      // Fallback
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
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${DRAFT_LS_KEY}_${draftKey}`, JSON.stringify(payload));
      }
    } catch {
      // Ignora cuota llena o modo privado estricto
    }
    try {
      await this._withStore('drafts', 'readwrite', (store) => store.put(payload));
    } catch {
      // Respaldado en localStorage
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
