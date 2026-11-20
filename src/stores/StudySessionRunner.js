import { Observable } from '../core/Observable.js';

/**
 * Máquina de estados y temporizador de sesiones de estudio guiadas encadenadas.
 * - Calcula el tiempo restante por timestamp objetivo (`stepEndsAtMs`) para evitar deriva en móviles.
 * - Pausa el temporizador y usa un lock (`_isAdvancing`) antes del `await` al avanzar de paso
 *   para impedir condiciones de carrera si la persistencia demora más de 1 segundo.
 */
export class StudySessionRunner {
  /**
   * Inicializa el ejecutor de sesiones guiadas inyectando dependencias de persistencia y coordinación.
   * @param {object} deps Dependencias del runner.
   * @param {import('../services/StorageService.js').StorageService} deps.storageService Persistencia de sesiones guardadas.
   * @param {Function} deps.findPracticeById Resolutor de prácticas del catálogo.
   * @param {Function} deps.getDefaultInstrument Función que devuelve el instrumento por defecto.
   * @param {Function} deps.recordPracticeSession Acción asíncrona para registrar progreso al cerrar un bloque.
   * @param {Function} deps.onSelectPractice Callback para marcar la práctica activa y navegar a ella.
   * @param {Function} deps.onNavigate Callback para navegar a una ruta hash.
   * @param {Function} deps.onNotify Callback para mostrar snackbars al usuario.
   * @param {Function} deps.onHaptic Callback para disparar vibración háptica.
   * @param {Function} [deps.nowFn] Proveedor de reloj en ms (inyectable para pruebas unitarias deterministas).
   */
  constructor({
    storageService,
    findPracticeById,
    getDefaultInstrument,
    recordPracticeSession,
    onSelectPractice,
    onNavigate,
    onNotify,
    onHaptic,
    nowFn = () => Date.now()
  }) {
    /** Servicio de persistencia local. */
    this._storage = storageService;
    /** Buscador de prácticas por ID. */
    this._findPracticeById = findPracticeById;
    /** Lector del instrumento predeterminado del usuario. */
    this._getDefaultInstrument = getDefaultInstrument;
    /** Registrador de sesiones en el ProgressStore. */
    this._recordPracticeSession = recordPracticeSession;
    /** Callback para activar y abrir una práctica del bloque. */
    this._onSelectPractice = onSelectPractice;
    /** Callback de navegación SPA. */
    this._onNavigate = onNavigate;
    /** Callback de notificaciones snackbar. */
    this._onNotify = onNotify;
    /** Callback de respuesta háptica. */
    this._onHaptic = onHaptic;
    /** Proveedor de tiempo actual en milisegundos. */
    this._now = nowFn;

    /** Lista observable de sesiones de estudio personalizadas del usuario. */
    this.studySessions = new Observable([]);
    /** Estado observable de la sesión guiada en ejecución o null si no hay ninguna activa. */
    this.activeStudySession = new Observable(null);

    /** Identificador del intervalo de actualización visual del reloj. */
    this._tickTimer = null;
    /** Lock de concurrencia para evitar avances duplicados durante operaciones async. */
    this._isAdvancing = false;
  }

  /**
   * Carga las sesiones de estudio personalizadas guardadas por el usuario.
   * @returns {Promise<Array<object>>} Sesiones cargadas.
   */
  async init() {
    const saved = this._storage.loadStudySessions
      ? await this._storage.loadStudySessions()
      : [];
    const list = Array.isArray(saved) ? saved : [];
    this.studySessions.set(list);
    return list;
  }

  /**
   * Guarda o actualiza una sesión de estudio personalizada.
   * @param {{ id?: string, title: string, instrument?: string, items: Array<{ practiceId: string, minutes: number }> }} session Sesión a guardar.
   * @returns {Promise<void>}
   */
  async saveStudySession(session) {
    const entry = {
      id: session.id || `ses-${this._now().toString(36)}`,
      title: String(session.title || 'Mi sesión de estudio').trim(),
      instrument: session.instrument || this._getDefaultInstrument(),
      items: (session.items || []).filter((it) => it.practiceId && Number(it.minutes) > 0)
    };
    const next = [...this.studySessions.value.filter((s) => s.id !== entry.id), entry];
    this.studySessions.set(next);
    if (this._storage.saveStudySessions) {
      await this._storage.saveStudySessions(next);
    }
    this._onNotify(`Sesión "${entry.title}" guardada.`);
  }

  /**
   * Elimina una sesión de estudio personalizada.
   * @param {string} sessionId Identificador de la sesión.
   * @returns {Promise<void>}
   */
  async deleteStudySession(sessionId) {
    const next = this.studySessions.value.filter((s) => s.id !== sessionId);
    this.studySessions.set(next);
    if (this._storage.saveStudySessions) {
      await this._storage.saveStudySessions(next);
    }
  }

  /**
   * Inicia una sesión de estudio guiada encadenada usando timestamp objetivo (`stepEndsAtMs`).
   * @param {{ title?: string, items: Array<{ practiceId: string, minutes: number }> }} session Plan de sesión.
   */
  startStudySession(session) {
    const validItems = (session?.items || []).filter((it) => this._findPracticeById(it.practiceId));
    if (validItems.length === 0) {
      this._onNotify('Agregá al menos una práctica para iniciar la sesión.');
      return;
    }

    this.stopStudySession(false);
    const first = validItems[0];
    const now = this._now();
    const durationSec = Math.max(60, Math.round(first.minutes * 60));

    this.activeStudySession.set({
      title: session.title || 'Sesión de hoy',
      items: validItems,
      currentIndex: 0,
      plannedSeconds: durationSec,
      remainingSeconds: durationSec,
      stepStartedAtMs: now,
      stepEndsAtMs: now + durationSec * 1000,
      startedAtMs: now,
      completedItems: 0
    }, true);

    this._startTicker();
    this._onSelectPractice(first.practiceId);
  }

  /**
   * Avanza al siguiente bloque de la sesión o finaliza registrando el tiempo real estudiado.
   * Pausa el temporizador y adquiere lock antes del `await` para prevenir condiciones de carrera.
   * @returns {Promise<void>}
   */
  async nextStudySessionStep() {
    if (this._isAdvancing) return;
    const state = this.activeStudySession.value;
    if (!state) return;

    this._isAdvancing = true;
    this._pauseTicker();

    try {
      const currentItem = state.items[state.currentIndex];
      const pr = this._findPracticeById(currentItem.practiceId);
      const plannedSec = state.plannedSeconds || Math.max(60, Math.round(currentItem.minutes * 60));
      const now = this._now();
      const elapsedSec = state.stepStartedAtMs
        ? Math.round((now - state.stepStartedAtMs) / 1000)
        : plannedSec - state.remainingSeconds;
      const spentSec = Math.max(15, Math.min(plannedSec, elapsedSec));

      if (pr) {
        await this._recordPracticeSession({
          practiceId: pr.id,
          bpm: pr.tempo.start,
          targetBpm: pr.tempo.target,
          repetitions: 1,
          studySeconds: spentSec
        });
      }

      // Si el usuario detuvo la sesión mientras se guardaba el progreso, no reanudar
      if (!this.activeStudySession.value) return;

      const nextIdx = state.currentIndex + 1;
      if (nextIdx >= state.items.length) {
        this._onHaptic([24, 40, 36]);
        this.stopStudySession(false);
        this._onNotify(`¡Sesión "${state.title}" completada! Progreso registrado.`);
        this._onNavigate('#/progreso');
        return;
      }

      const nextItem = state.items[nextIdx];
      const stepNow = this._now();
      const nextDurationSec = Math.max(60, Math.round(nextItem.minutes * 60));
      this.activeStudySession.set({
        ...state,
        currentIndex: nextIdx,
        plannedSeconds: nextDurationSec,
        remainingSeconds: nextDurationSec,
        stepStartedAtMs: stepNow,
        stepEndsAtMs: stepNow + nextDurationSec * 1000,
        completedItems: state.completedItems + 1
      }, true);

      this._onHaptic(20);
      this._onSelectPractice(nextItem.practiceId);
      this._startTicker();
    } finally {
      this._isAdvancing = false;
    }
  }

  /**
   * Detiene la sesión guiada activa y libera su temporizador.
   * @param {boolean} [notify=true] Si true, muestra snackbar de confirmación.
   */
  stopStudySession(notify = true) {
    this._pauseTicker();
    const hadSession = Boolean(this.activeStudySession.value);
    this.activeStudySession.set(null);
    if (notify && hadSession) {
      this._onNotify('Sesión de estudio finalizada.');
    }
  }

  /**
   * Sincroniza el contador restante contra el timestamp objetivo `stepEndsAtMs`
   * (sin deriva aunque la pestaña móvil haya estado suspendida en segundo plano).
   */
  tick() {
    if (this._isAdvancing) return;
    const state = this.activeStudySession.value;
    if (!state) {
      this._pauseTicker();
      return;
    }
    const remaining = Math.max(0, Math.ceil((state.stepEndsAtMs - this._now()) / 1000));
    if (remaining <= 0) {
      this.nextStudySessionStep();
    } else if (remaining !== state.remainingSeconds) {
      this.activeStudySession.set({ ...state, remainingSeconds: remaining }, true);
    }
  }

  /**
   * Pausa y limpia el intervalo activo sin destruir la sesión.
   */
  _pauseTicker() {
    if (this._tickTimer !== null) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  /**
   * Inicia el reloj periódico que evalúa el timestamp objetivo cada segundo.
   */
  _startTicker() {
    this._pauseTicker();
    this._tickTimer = setInterval(() => this.tick(), 1000);
  }

  /**
   * Libera temporizadores activos al destruir el runner.
   */
  dispose() {
    this._pauseTicker();
    this._isAdvancing = false;
  }
}
