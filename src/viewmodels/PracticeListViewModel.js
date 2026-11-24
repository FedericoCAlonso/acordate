import { ComputedObservable, Observable } from '../core/Observable.js';
import { LEVELS } from '../models/Level.js';
import { VALID_INSTRUMENTS } from '../models/Practice.js';
import {
  AREA_ORDER,
  buildTodayRoutine,
  filterPractices,
  groupPracticesByLevel,
  pickContinueCard
} from '../services/StudyRoutineService.js';

export { AREA_ORDER };

/**
 * ViewModel de la pantalla de Prácticas organizada como "Ruta".
 * Coordina filtros reactivos, sección Repertorio, Mis prácticas y delega el armado
 * de rutinas, filtrado y agrupación en `StudyRoutineService`.
 */
export class PracticeListViewModel {
  /**
   * Construye el ViewModel inyectando el AppViewModel compartido.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   */
  constructor(appVm) {
    /** Referencia al ViewModel global de la app. */
    this._appVm = appVm;

    /** Instrumento activo fijo en la parte superior. */
    this.instrumentFilter = new Observable(appVm.settings.value.defaultInstrument || 'guitarra');
    /** Filtro de tipo ('todos' | 'melody' | 'harmony' | 'mixed'). */
    this.typeFilter = new Observable('todos');
    /** Filtro de nivel ('todos' | 1..5). */
    this.levelFilter = new Observable('todos');
    /** Filtro de área/categoría ('todos' | categoría). */
    this.categoryFilter = new Observable('todos');
    /** Filtro de origen ('todos' | 'builtin' | 'user'). */
    this.originFilter = new Observable('todos');
    /** Filtro por etiqueta. */
    this.tagFilter = new Observable('');
    /** Filtro de estilo en Repertorio. */
    this.repertoireStyleFilter = new Observable('todos');
    /** Filtro de derechos en Repertorio. */
    this.repertoireRightsFilter = new Observable('todos');
    /** Filtro de nivel en Repertorio. */
    this.repertoireLevelFilter = new Observable('todos');
    /** Texto libre de búsqueda en la Search Bar. */
    this.searchQuery = new Observable('');
    /** Pestaña activa dentro de Prácticas ('ruta' | 'repertorio' | 'mias'). */
    this.activeSection = new Observable('ruta');
    /** Nivel actualmente seleccionado en la ruta de niveles (null = automático). */
    this.expandedLevel = new Observable(null);

    /** Prácticas pertenecientes al instrumento seleccionado actualmente. */
    this.instrumentPractices = new ComputedObservable(
      [appVm.allPractices, this.instrumentFilter],
      () => {
        const inst = this.instrumentFilter.value;
        if (inst === 'todos') return [...appVm.allPractices.value];
        return appVm.allPractices.value.filter((p) => p.instruments.includes(inst));
      }
    );

    /** Estado de desbloqueo y anillo de progreso por nivel para el instrumento activo. */
    this.levelsStatus = new ComputedObservable(
      [this.instrumentPractices, appVm.progress],
      () => appVm.progress.value.getLevelsStatus(this.instrumentPractices.value)
    );

    /** Cantidad de filtros secundarios activos dentro del bottom sheet. */
    this.activeFilterCount = new ComputedObservable(
      [this.typeFilter, this.levelFilter, this.categoryFilter, this.originFilter, this.tagFilter],
      () => {
        let c = 0;
        if (this.typeFilter.value !== 'todos') c += 1;
        if (this.levelFilter.value !== 'todos') c += 1;
        if (this.categoryFilter.value !== 'todos') c += 1;
        if (this.originFilter.value !== 'todos') c += 1;
        if (this.tagFilter.value.trim()) c += 1;
        return c;
      }
    );

    /** Indica si hay búsqueda o filtros avanzados activos. */
    this.isFiltering = new ComputedObservable(
      [this.searchQuery, this.activeFilterCount],
      () => Boolean(this.searchQuery.value.trim() || this.activeFilterCount.value > 0)
    );

    /** Lista de prácticas filtradas según todos los criterios activos. */
    this.filteredPractices = new ComputedObservable(
      [
        this.instrumentPractices,
        this.typeFilter,
        this.levelFilter,
        this.categoryFilter,
        this.originFilter,
        this.tagFilter,
        this.searchQuery
      ],
      () =>
        filterPractices(this.instrumentPractices.value, {
          type: this.typeFilter.value,
          level: this.levelFilter.value,
          category: this.categoryFilter.value,
          origin: this.originFilter.value,
          tag: this.tagFilter.value,
          query: this.searchQuery.value
        })
    );

    /** Prácticas del usuario filtradas por instrumento. */
    this.userPractices = new ComputedObservable(
      [this.instrumentPractices],
      () => this.instrumentPractices.value.filter((p) => p.origin === 'user')
    );

    /** Piezas de la sección Repertorio filtradas por instrumento, estilo, derechos y nivel. */
    this.repertoirePractices = new ComputedObservable(
      [
        this.instrumentPractices,
        this.repertoireStyleFilter,
        this.repertoireRightsFilter,
        this.repertoireLevelFilter
      ],
      () => {
        const styleF = this.repertoireStyleFilter.value;
        const rightsF = this.repertoireRightsFilter.value;
        const lvlF = this.repertoireLevelFilter.value;
        return this.instrumentPractices.value
          .filter((p) => p.isRepertoire)
          .filter((p) => {
            if (styleF !== 'todos' && p.style !== styleF) return false;
            if (rightsF !== 'todos' && p.rights !== rightsF) return false;
            if (lvlF !== 'todos' && p.level !== Number(lvlF)) return false;
            return true;
          })
          .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'es-AR'));
      }
    );

    /** Etiquetas disponibles en el instrumento activo. */
    this.availableTags = new ComputedObservable([this.instrumentPractices], () => {
      const set = new Set();
      for (const p of this.instrumentPractices.value) {
        for (const t of p.tags) set.add(t);
      }
      return [...set].sort((a, b) => a.localeCompare(b, 'es-AR'));
    });

    /** Tarjeta "Continuar" (declara explícitamente `instrumentFilter` como dependencia). */
    this.continueCard = new ComputedObservable(
      [this.instrumentPractices, this.instrumentFilter, appVm.progress],
      () => pickContinueCard(this.instrumentPractices.value, appVm.progress.value, this.instrumentFilter.value)
    );

    /** Rutina sugerida "Sesión de hoy" (~15 minutos). */
    this.todayRoutine = new ComputedObservable(
      [this.instrumentPractices, this.levelsStatus, appVm.progress],
      () => buildTodayRoutine(this.instrumentPractices.value, this.levelsStatus.value, appVm.progress.value)
    );

    /** Ruta de los 5 niveles con sus prácticas agrupadas por área pedagógica. */
    this.groupedByLevel = new ComputedObservable(
      [this.filteredPractices, this.levelsStatus],
      () => groupPracticesByLevel(this.filteredPractices.value, this.levelsStatus.value)
    );

    /** Desuscripción guardada de `appVm.isReady`. */
    this._unsubReady = appVm.isReady.subscribe((ready) => {
      if (ready && appVm.settings.value.defaultInstrument) {
        this.instrumentFilter.set(appVm.settings.value.defaultInstrument);
      }
    });

    /** Mantiene el instrumento sincronizado con cambios realizados en el Panel de Inicio o Ajustes. */
    this._unsubSettings = appVm.settings.subscribe((s) => {
      if (s?.defaultInstrument && s.defaultInstrument !== this.instrumentFilter.value && this.instrumentFilter.value !== 'todos') {
        this.instrumentFilter.set(s.defaultInstrument);
      }
    });
  }

  /** Cambia la pestaña activa dentro de Prácticas ('ruta' | 'repertorio' | 'mias'). */
  setActiveSection(tab) {
    const valid = ['ruta', 'repertorio', 'mias'].includes(tab) ? tab : 'ruta';
    if (this.activeSection.value !== valid) {
      this.activeSection.set(valid);
    }
  }

  /** Establece filtro de tipo de práctica. */
  setType(value) { this.typeFilter.set(value); }

  /** Cambia el instrumento fijo superior y lo recuerda en Ajustes. */
  setInstrument(value) {
    this.instrumentFilter.set(value);
    if (VALID_INSTRUMENTS.includes(value)) {
      this._appVm.updateSettings({ defaultInstrument: value });
    }
  }

  /** Establece filtro de nivel. */
  setLevel(value) { this.levelFilter.set(value === 'todos' ? 'todos' : Number(value)); }
  /** Establece filtro de categoría/área. */
  setCategory(value) { this.categoryFilter.set(value); }
  /** Establece filtro de origen. */
  setOrigin(value) { this.originFilter.set(value); }
  /** Establece filtro de etiqueta. */
  setTag(tag) { this.tagFilter.set(String(tag || '')); }
  /** Actualiza búsqueda libre. */
  setSearchQuery(text) { this.searchQuery.set(String(text || '')); }

  /** Limpia búsqueda y filtros secundarios manteniendo el instrumento activo. */
  resetFilters() {
    this.typeFilter.set('todos');
    this.levelFilter.set('todos');
    this.categoryFilter.set('todos');
    this.originFilter.set('todos');
    this.tagFilter.set('');
    this.searchQuery.set('');
  }

  /** Abre o colapsa un nivel específico en la ruta. */
  toggleLevelExpanded(levelNumber) {
    const current = this.getActiveExpandedLevel();
    this.expandedLevel.set(current === levelNumber ? 0 : levelNumber);
  }

  /** Determina qué nivel debe mostrarse expandido por defecto. */
  getActiveExpandedLevel() {
    if (this.expandedLevel.value !== null) return this.expandedLevel.value;
    const statusMap = this.levelsStatus.value;
    for (const lvl of LEVELS) {
      const st = statusMap[lvl.number];
      if (st?.unlocked && !st.completed) return lvl.number;
    }
    return 1;
  }

  /** Inicia la rutina sugerida "Sesión de hoy". */
  startTodayRoutine() {
    const routine = this.todayRoutine.value;
    if (!routine || routine.items.length === 0) return;
    this._appVm.startStudySession(routine);
  }

  /** Abre una práctica directamente en Modo Atril (#/practica/:id). */
  openPractice(practiceId) {
    if (!practiceId) return;
    this._appVm.activePracticeId.set(practiceId);
    this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
  }

  /** Navega al editor para crear una práctica nueva. */
  createNewPractice() { this._appVm.navigate('#/editor/nueva'); }

  /** Desbloquea un nivel manualmente si el usuario decide saltarlo. */
  skipLevel(levelNumber) { this._appVm.skipToLevel(levelNumber); }

  /**
   * Libera la suscripción a `appVm.isReady`, `appVm.settings` y todos los `ComputedObservable`.
   */
  dispose() {
    if (this._unsubReady) {
      this._unsubReady();
      this._unsubReady = null;
    }
    if (this._unsubSettings) {
      this._unsubSettings();
      this._unsubSettings = null;
    }
    this.groupedByLevel.dispose();
    this.todayRoutine.dispose();
    this.continueCard.dispose();
    this.availableTags.dispose();
    this.repertoirePractices.dispose();
    this.userPractices.dispose();
    this.filteredPractices.dispose();
    this.isFiltering.dispose();
    this.activeFilterCount.dispose();
    this.levelsStatus.dispose();
    this.instrumentPractices.dispose();
  }
}
