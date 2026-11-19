import { toLocalDayKey } from '../core/i18n.js';
import { LEVELS } from './Level.js';

/**
 * Modelo de dominio puro que registra el progreso del usuario por práctica,
 * racha de días, resumen semanal y estado de desbloqueo de niveles.
 */
export class UserProgress {
  /**
   * Crea o restaura el progreso del usuario desde un objeto serializado.
   * @param {object} [data={}] Datos persistidos del progreso.
   */
  constructor(data = {}) {
    /** Versión del esquema de progreso. */
    this.version = data.version ?? 1;
    /**
     * Mapa practiceId -> { bestBpm, repetitions, studySeconds, lastSessionAt, completedTarget }.
     */
    this.byPractice = {};
    if (data.byPractice && typeof data.byPractice === 'object') {
      for (const [id, entry] of Object.entries(data.byPractice)) {
        this.byPractice[id] = {
          bestBpm: Number(entry.bestBpm || 0),
          repetitions: Number(entry.repetitions || 0),
          studySeconds: Number(entry.studySeconds || 0),
          lastSessionAt: entry.lastSessionAt || null,
          completedTarget: Boolean(entry.completedTarget)
        };
      }
    }

    /**
     * Mapa YYYY-MM-DD -> { studySeconds, sessions } para calcular rachas y resumen semanal.
     */
    this.dailyLog = {};
    if (data.dailyLog && typeof data.dailyLog === 'object') {
      for (const [dayKey, entry] of Object.entries(data.dailyLog)) {
        this.dailyLog[dayKey] = {
          studySeconds: Number(entry.studySeconds || 0),
          sessions: Number(entry.sessions || 0)
        };
      }
    }

    /**
     * Conjunto de niveles que el usuario desbloqueó manualmente ("saltar nivel").
     */
    this.skippedLevels = Array.isArray(data.skippedLevels)
      ? [...new Set(data.skippedLevels.map(Number).filter((n) => n >= 1 && n <= 5))]
      : [];
  }

  /**
   * Devuelve el registro de progreso para una práctica o un registro vacío inicial.
   * @param {string} practiceId Identificador de la práctica.
   * @returns {{ bestBpm: number, repetitions: number, studySeconds: number, lastSessionAt: string|null, completedTarget: boolean }} Estadísticas de la práctica.
   */
  getPracticeStats(practiceId) {
    return (
      this.byPractice[practiceId] || {
        bestBpm: 0,
        repetitions: 0,
        studySeconds: 0,
        lastSessionAt: null,
        completedTarget: false
      }
    );
  }

  /**
   * Registra una sesión de estudio completada o parcial para una práctica.
   * @param {object} params Datos de la sesión.
   * @param {string} params.practiceId ID de la práctica estudiada.
   * @param {number} params.bpm Tempo alcanzado en la sesión.
   * @param {number} [params.targetBpm=0] BPM objetivo de la práctica para marcarla como superada.
   * @param {number} [params.repetitions=1] Cantidad de repeticiones o vueltas completadas.
   * @param {number} [params.studySeconds=0] Tiempo de práctica en segundos.
   * @param {Date} [params.date=new Date()] Fecha de la sesión.
   */
  recordSession({ practiceId, bpm, targetBpm = 0, repetitions = 1, studySeconds = 0, date = new Date() }) {
    if (!practiceId) return;
    const current = this.getPracticeStats(practiceId);
    const safeBpm = Math.max(0, Math.round(Number(bpm) || 0));
    const safeReps = Math.max(0, Math.round(Number(repetitions) || 0));
    const safeSecs = Math.max(0, Math.round(Number(studySeconds) || 0));
    const bestBpm = Math.max(current.bestBpm, safeBpm);
    const completedTarget = current.completedTarget || (targetBpm > 0 && bestBpm >= targetBpm);

    this.byPractice[practiceId] = {
      bestBpm,
      repetitions: current.repetitions + safeReps,
      studySeconds: current.studySeconds + safeSecs,
      lastSessionAt: date.toISOString(),
      completedTarget
    };

    const dayKey = toLocalDayKey(date);
    const dayEntry = this.dailyLog[dayKey] || { studySeconds: 0, sessions: 0 };
    this.dailyLog[dayKey] = {
      studySeconds: dayEntry.studySeconds + safeSecs,
      sessions: dayEntry.sessions + 1
    };
  }

  /**
   * Permite al usuario desbloquear un nivel manualmente sin haber completado los anteriores.
   * @param {number} levelNumber Número de nivel (2 a 5).
   */
  skipToLevel(levelNumber) {
    const n = Number(levelNumber);
    if (n < 1 || n > 5) return;
    for (let lvl = 2; lvl <= n; lvl++) {
      if (!this.skippedLevels.includes(lvl)) {
        this.skippedLevels.push(lvl);
      }
    }
    this.skippedLevels.sort((a, b) => a - b);
  }

  /**
   * Calcula qué niveles están desbloqueados según las prácticas que alcanzaron su BPM objetivo
   * o los niveles saltados por el usuario.
   * @param {Array<{ id: string, level: number, tempo: { target: number } }>} practices Catálogo de prácticas.
   * @returns {Record<number, { unlocked: boolean, completedCount: number, requiredCount: number, skipped: boolean }>} Estado por nivel.
   */
  getLevelsStatus(practices = []) {
    const status = {};
    for (const lvl of LEVELS) {
      const levelPractices = practices.filter((p) => p.level === lvl.number);
      const completedCount = levelPractices.filter((p) => {
        const stats = this.byPractice[p.id];
        return stats && (stats.completedTarget || stats.bestBpm >= (p.tempo?.target || 0));
      }).length;

      const skipped = this.skippedLevels.includes(lvl.number);
      let unlocked = lvl.number === 1 || skipped;

      if (!unlocked && lvl.number > 1) {
        const prev = status[lvl.number - 1];
        if (prev && prev.completedCount >= prev.requiredCount) {
          unlocked = true;
        }
      }

      status[lvl.number] = {
        unlocked,
        completedCount,
        requiredCount: Math.min(lvl.minKeyPracticesToUnlock, Math.max(1, levelPractices.length)),
        totalPractices: levelPractices.length,
        skipped
      };
    }
    return status;
  }

  /**
   * Calcula la racha actual de días consecutivos con práctica registrada hasta hoy (o ayer).
   * @param {Date} [referenceDate=new Date()] Fecha de referencia.
   * @returns {number} Cantidad de días consecutivos de racha.
   */
  getCurrentStreak(referenceDate = new Date()) {
    const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const hasActivity = (d) => {
      const key = toLocalDayKey(d);
      const entry = this.dailyLog[key];
      return Boolean(entry && (entry.sessions > 0 || entry.studySeconds > 0));
    };

    let cursor = new Date(today);
    if (!hasActivity(cursor)) {
      cursor.setDate(cursor.getDate() - 1);
      if (!hasActivity(cursor)) return 0;
    }

    let streak = 0;
    while (hasActivity(cursor)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  /**
   * Devuelve el resumen de los últimos 7 días con minutos y sesiones por día.
   * @param {Date} [referenceDate=new Date()] Fecha de referencia.
   * @returns {Array<{ dayKey: string, label: string, studySeconds: number, sessions: number }>} Arreglo de 7 días.
   */
  getWeeklySummary(referenceDate = new Date()) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const result = [];
    const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(base);
      d.setDate(base.getDate() - offset);
      const dayKey = toLocalDayKey(d);
      const entry = this.dailyLog[dayKey] || { studySeconds: 0, sessions: 0 };
      result.push({
        dayKey,
        label: dayNames[d.getDay()],
        studySeconds: entry.studySeconds,
        sessions: entry.sessions
      });
    }
    return result;
  }

  /**
   * Calcula totales globales acumulados (tiempo total, repeticiones y prácticas estudiadas).
   * @returns {{ totalStudySeconds: number, totalRepetitions: number, practicesStudied: number, targetsReached: number }} Totales agregados.
   */
  getTotals() {
    let totalStudySeconds = 0;
    let totalRepetitions = 0;
    let practicesStudied = 0;
    let targetsReached = 0;

    for (const stats of Object.values(this.byPractice)) {
      totalStudySeconds += stats.studySeconds || 0;
      totalRepetitions += stats.repetitions || 0;
      if (stats.repetitions > 0 || stats.studySeconds > 0) practicesStudied += 1;
      if (stats.completedTarget) targetsReached += 1;
    }

    return {
      totalStudySeconds,
      totalRepetitions,
      practicesStudied,
      targetsReached
    };
  }

  /**
   * Serializa el progreso del usuario a JSON plano para almacenamiento o exportación.
   * @returns {object} Objeto JSON serializable.
   */
  toJSON() {
    return {
      version: this.version,
      byPractice: JSON.parse(JSON.stringify(this.byPractice)),
      dailyLog: JSON.parse(JSON.stringify(this.dailyLog)),
      skippedLevels: [...this.skippedLevels]
    };
  }
}
