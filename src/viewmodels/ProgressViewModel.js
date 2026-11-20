import { ComputedObservable } from '../core/Observable.js';
import { LEVELS } from '../models/Level.js';
import { UserProgress } from '../models/UserProgress.js';

/**
 * ViewModel de la pantalla de Progreso (#/progreso).
 * Expone métricas acumuladas, racha de días, resumen semanal, avance por nivel,
 * desbloqueo/salto de niveles y exportación/importación de copias de seguridad.
 */
export class ProgressViewModel {
  /**
   * Inicializa el ViewModel inyectando el AppViewModel y el servicio de importar/exportar.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel global.
   * @param {import('../services/ImportExportService.js').ImportExportService} importExportService Servicio JSON.
   */
  constructor(appVm, importExportService) {
    /** Referencia al ViewModel raíz. */
    this._appVm = appVm;
    /** Servicio de respaldo en JSON. */
    this._io = importExportService;

    /** Totales globales: tiempo total, repeticiones, prácticas estudiadas y objetivos logrados. */
    this.totals = new ComputedObservable(
      [appVm.progress],
      () => appVm.progress.value.getTotals()
    );

    /** Racha actual de días consecutivos con sesiones registradas. */
    this.streakDays = new ComputedObservable(
      [appVm.progress],
      () => appVm.progress.value.getCurrentStreak()
    );

    /** Resumen de los últimos 7 días con segundos y sesiones por día. */
    this.weeklySummary = new ComputedObservable(
      [appVm.progress],
      () => appVm.progress.value.getWeeklySummary()
    );

    /** Estado de avance y desbloqueo de cada uno de los 5 niveles. */
    this.levelsOverview = new ComputedObservable(
      [appVm.progress, appVm.allPractices],
      () => {
        const statusMap = appVm.progress.value.getLevelsStatus(appVm.allPractices.value);
        return LEVELS.map((level) => ({
          level,
          ...(statusMap[level.number] || { unlocked: level.number === 1, completedCount: 0, requiredCount: 2, totalPractices: 0, skipped: false })
        }));
      }
    );

    /** Lista de prácticas con actividad registrada, ordenadas por última sesión más reciente. */
    this.studiedPractices = new ComputedObservable(
      [appVm.progress, appVm.allPractices],
      () => {
        const prog = appVm.progress.value;
        const catalogMap = new Map(appVm.allPractices.value.map((p) => [p.id, p]));
        return Object.entries(prog.byPractice)
          .filter(([, stats]) => stats.repetitions > 0 || stats.studySeconds > 0)
          .map(([id, stats]) => ({
            practiceId: id,
            practice: catalogMap.get(id) || null,
            stats
          }))
          .sort((a, b) => (b.stats.lastSessionAt || '').localeCompare(a.stats.lastSessionAt || ''));
      }
    );
  }

  /**
   * Desbloquea manualmente un nivel permitiendo saltar requisitos previos.
   * @param {number} levelNumber Nivel a desbloquear (2 a 5).
   * @returns {Promise<void>}
   */
  async skipToLevel(levelNumber) {
    await this._appVm.skipToLevel(levelNumber);
  }

  /**
   * Exporta el progreso completo en un archivo JSON descargable.
   */
  exportProgress() {
    const content = this._io.exportProgressJson(this._appVm.progress.value);
    this._io.triggerBrowserDownload('acordate-progreso.json', content, 'application/json');
    this._appVm.showSnackbar('Progreso exportado en JSON.');
  }

  /**
   * Importa un respaldo de progreso desde texto JSON y reemplaza el estado local.
   * @param {string} jsonText Contenido JSON del backup.
   * @returns {Promise<{ ok: boolean, errors: string[] }>} Resultado de la importación.
   */
  async importProgress(jsonText) {
    const { progress, errors } = this._io.importProgressJson(jsonText);
    if (!progress || errors.length > 0) {
      this._appVm.showSnackbar(errors[0] || 'No se pudo importar el progreso.');
      return { ok: false, errors };
    }
    await this._appVm.replaceProgress(progress);
    this._appVm.showSnackbar('Progreso importado correctamente.');
    return { ok: true, errors: [] };
  }

  /**
   * Reinicia todo el historial de progreso del usuario.
   * @returns {Promise<void>}
   */
  async resetProgress() {
    await this._appVm.replaceProgress(new UserProgress());
    this._appVm.showSnackbar('Progreso reiniciado.');
  }

  /**
   * Abre una práctica directamente desde la tabla de progreso.
   * @param {string} practiceId ID de la práctica.
   */
  openPractice(practiceId) {
    this._appVm.activePracticeId.set(practiceId);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
  }

  /**
   * Libera todos los `ComputedObservable` suscriptos al progreso y catálogo global.
   */
  dispose() {
    this.studiedPractices.dispose();
    this.levelsOverview.dispose();
    this.weeklySummary.dispose();
    this.streakDays.dispose();
    this.totals.dispose();
  }
}
