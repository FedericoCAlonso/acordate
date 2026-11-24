import { ComputedObservable, Observable } from '../core/Observable.js';
import { LEVELS } from '../models/Level.js';
import { VALID_INSTRUMENTS } from '../models/Practice.js';
import {
  buildTodayRoutine,
  pickContinueCard
} from '../services/StudyRoutineService.js';

/** Meta diaria sugerida de estudio en minutos para el anillo/barra del Panel de Inicio. */
const DEFAULT_DAILY_GOAL_MINUTES = 15;

/**
 * ViewModel del Panel de Inicio (#/inicio).
 * Reúne en una vista accionable y serena:
 * - Instrumento activo sincronizado con Ajustes.
 * - Tarjeta "Retomar ahora" (última práctica o punto de partida recomendado).
 * - Rutina "Sesión de hoy" (~15 min) + sesiones guardadas del usuario.
 * - Progreso del nivel actual con acceso directo a sus prácticas clave pendientes.
 * - Métricas diarias (racha, minutos hoy, resumen semanal de 7 días).
 */
export class HomeViewModel {
  /**
   * Construye el ViewModel del Panel de Inicio inyectando el AppViewModel global.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   */
  constructor(appVm) {
    /** Referencia al AppViewModel global. */
    this._appVm = appVm;

    /** Instrumento seleccionado actualmente en el panel (sincronizado con Ajustes). */
    this.instrument = new Observable(appVm.settings.value.defaultInstrument || 'guitarra');

    /** Prácticas filtradas para el instrumento activo. */
    this.instrumentPractices = new ComputedObservable(
      [appVm.allPractices, this.instrument],
      () => {
        const inst = this.instrument.value;
        return appVm.allPractices.value.filter((p) => p.instruments.includes(inst));
      }
    );

    /** Estado de avance y desbloqueo por nivel (1–5) para el instrumento activo. */
    this.levelsStatus = new ComputedObservable(
      [this.instrumentPractices, appVm.progress],
      () => appVm.progress.value.getLevelsStatus(this.instrumentPractices.value)
    );

    /** Tarjeta principal "Retomar ahora" / "Para empezar". */
    this.continueCard = new ComputedObservable(
      [this.instrumentPractices, this.instrument, appVm.progress],
      () => pickContinueCard(this.instrumentPractices.value, appVm.progress.value, this.instrument.value)
    );

    /** Rutina guiada sugerida para hoy (~15 min). */
    this.todayRoutine = new ComputedObservable(
      [this.instrumentPractices, this.levelsStatus, appVm.progress],
      () => buildTodayRoutine(this.instrumentPractices.value, this.levelsStatus.value, appVm.progress.value)
    );

    /** Sesiones personalizadas guardadas por el usuario para el instrumento activo. */
    this.savedSessions = new ComputedObservable(
      [appVm.studySessions, this.instrument],
      () => appVm.studySessions.value.filter((s) => s.instrument === this.instrument.value)
    );

    /** Resumen del nivel activo en curso y hasta 3 prácticas recomendadas de ese nivel. */
    this.currentLevelSummary = new ComputedObservable(
      [this.instrumentPractices, this.levelsStatus, appVm.progress],
      () => {
        const statusMap = this.levelsStatus.value;
        const prog = appVm.progress.value;
        let activeLevel = LEVELS[0];
        for (const lvl of LEVELS) {
          const st = statusMap[lvl.number];
          if (st?.unlocked && !st.completed) {
            activeLevel = lvl;
            break;
          }
        }
        const status = statusMap[activeLevel.number] || {
          unlocked: true,
          completed: false,
          completedCount: 0,
          requiredCount: 2,
          totalCount: 0
        };
        const levelPractices = this.instrumentPractices.value.filter((p) => p.level === activeLevel.number);
        // Prioriza prácticas todavía no dominadas para guiar el siguiente paso real
        const pendingFirst = [...levelPractices].sort((a, b) => {
          const sa = prog.getPracticeStatus(a.id, a.tempo.target);
          const sb = prog.getPracticeStatus(b.id, b.tempo.target);
          const rank = { 'en-curso': 0, nueva: 1, dominada: 2 };
          return (rank[sa] ?? 1) - (rank[sb] ?? 1) || a.title.localeCompare(b.title, 'es-AR');
        });

        return {
          level: activeLevel,
          status,
          recommended: pendingFirst.slice(0, 3),
          totalInLevel: levelPractices.length
        };
      }
    );

    /** Métricas motivadoras del día y la semana para la cabecera del Panel. */
    this.dailyStats = new ComputedObservable(
      [appVm.progress, this.instrumentPractices],
      () => {
        const prog = appVm.progress.value;
        const totals = prog.getTotals();
        const weekly = prog.getWeeklySummary();
        const todayEntry = weekly[weekly.length - 1] || { studySeconds: 0, repetitions: 0 };
        const todayMinutes = Math.round((todayEntry.studySeconds || 0) / 60);
        const goalMinutes = DEFAULT_DAILY_GOAL_MINUTES;
        const goalPct = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));
        const masteredInInstrument = this.instrumentPractices.value.filter(
          (p) => prog.getPracticeStatus(p.id, p.tempo.target) === 'dominada'
        ).length;

        return {
          streakDays: prog.getCurrentStreak(),
          todayMinutes,
          goalMinutes,
          goalPct,
          weekly,
          totalStudySeconds: totals.totalStudySeconds,
          masteredInInstrument,
          totalInInstrument: this.instrumentPractices.value.length
        };
      }
    );

    /** Sincroniza el instrumento si cambia desde Ajustes o desde Prácticas. */
    this._unsubSettings = appVm.settings.subscribe((s) => {
      if (s?.defaultInstrument && s.defaultInstrument !== this.instrument.value) {
        this.instrument.set(s.defaultInstrument);
      }
    });
  }

  /** Cambia el instrumento activo del estudio y lo recuerda globalmente. */
  setInstrument(value) {
    if (!VALID_INSTRUMENTS.includes(value)) return;
    this.instrument.set(value);
    this._appVm.updateSettings({ defaultInstrument: value });
  }

  /** Abre una práctica directamente en Modo Atril. */
  openPractice(practiceId) {
    if (!practiceId) return;
    this._appVm.activePracticeId.set(practiceId);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
  }

  /** Inicia la rutina guiada sugerida para hoy. */
  startTodayRoutine() {
    const routine = this.todayRoutine.value;
    if (!routine || routine.items.length === 0) return;
    this._appVm.startStudySession(routine);
  }

  /** Inicia una sesión personalizada guardada por el usuario. */
  startStudySession(session) {
    if (!session) return;
    this._appVm.startStudySession(session);
  }

  /** Navega a cualquier ruta de la aplicación. */
  navigate(hash) {
    this._appVm.navigate(hash);
  }

  /** Libera suscripciones y observables derivados. */
  dispose() {
    if (this._unsubSettings) {
      this._unsubSettings();
      this._unsubSettings = null;
    }
    this.dailyStats.dispose();
    this.currentLevelSummary.dispose();
    this.savedSessions.dispose();
    this.todayRoutine.dispose();
    this.continueCard.dispose();
    this.levelsStatus.dispose();
    this.instrumentPractices.dispose();
  }
}
