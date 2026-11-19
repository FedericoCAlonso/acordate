import { ComputedObservable, Observable } from '../core/Observable.js';
import { LEVELS } from '../models/Level.js';

/**
 * ViewModel de la pantalla de lista de prácticas.
 * Gestiona filtros (instrumento, nivel, categoría, origen y búsqueda textual),
 * agrupación por niveles y estado de desbloqueo.
 */
export class PracticeListViewModel {
  /**
   * Construye el ViewModel inyectando el AppViewModel compartido.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   */
  constructor(appVm) {
    /** Referencia al ViewModel global de la app. */
    this._appVm = appVm;

    /** Filtro activo de instrumento ('todos' | 'guitarra-clasica' | 'guitarra' | 'bajo'). */
    this.instrumentFilter = new Observable(appVm.settings.value.defaultInstrument || 'todos');
    /** Filtro activo de nivel ('todos' | 1..5). */
    this.levelFilter = new Observable('todos');
    /** Filtro activo de categoría ('todos' | 'escala' | 'acordes' | 'lectura' | 'ritmo' | 'walking' | 'arpegio'). */
    this.categoryFilter = new Observable('todos');
    /** Filtro de origen ('todos' | 'builtin' | 'user'). */
    this.originFilter = new Observable('todos');
    /** Texto libre de búsqueda sobre título, etiquetas y tonalidad. */
    this.searchQuery = new Observable('');

    /** Estado de desbloqueo calculado para cada nivel (1-5). */
    this.levelsStatus = new ComputedObservable(
      [appVm.allPractices, appVm.progress],
      () => appVm.progress.value.getLevelsStatus(appVm.allPractices.value)
    );

    /** Lista de prácticas filtradas según todos los criterios activos. */
    this.filteredPractices = new ComputedObservable(
      [
        appVm.allPractices,
        this.instrumentFilter,
        this.levelFilter,
        this.categoryFilter,
        this.originFilter,
        this.searchQuery
      ],
      () => this._computeFiltered()
    );

    /** Prácticas filtradas agrupadas por nivel con sus metadatos pedagógicos. */
    this.groupedByLevel = new ComputedObservable(
      [this.filteredPractices, this.levelsStatus],
      () => {
        const items = this.filteredPractices.value;
        const statusMap = this.levelsStatus.value;
        return LEVELS.map((level) => ({
          level,
          status: statusMap[level.number] || { unlocked: level.number === 1, completedCount: 0, requiredCount: 2 },
          practices: items.filter((p) => p.level === level.number)
        })).filter((group) => group.practices.length > 0);
      }
    );

    // Sincroniza el filtro inicial si el usuario cambia el instrumento predeterminado al cargar ajustes
    appVm.isReady.subscribe((ready) => {
      if (ready && appVm.settings.value.defaultInstrument) {
        this.instrumentFilter.set(appVm.settings.value.defaultInstrument);
      }
    });
  }

  /**
   * Aplica todos los filtros activos sobre el catálogo completo.
   * @returns {import('../models/Practice.js').Practice[]} Lista filtrada ordenada por nivel y título.
   */
  _computeFiltered() {
    const all = this._appVm.allPractices.value;
    const inst = this.instrumentFilter.value;
    const lvl = this.levelFilter.value;
    const cat = this.categoryFilter.value;
    const origin = this.originFilter.value;
    const query = this.searchQuery.value.trim().toLowerCase();

    return all
      .filter((p) => {
        if (inst !== 'todos' && !p.instruments.includes(inst)) return false;
        if (lvl !== 'todos' && p.level !== Number(lvl)) return false;
        if (cat !== 'todos' && p.category !== cat) return false;
        if (origin !== 'todos' && p.origin !== origin) return false;
        if (query) {
          const haystack = `${p.title} ${p.key} ${p.tags.join(' ')} ${p.notes}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'es-AR'));
  }

  /**
   * Establece el filtro de instrumento.
   * @param {string} value Instrumento o 'todos'.
   */
  setInstrument(value) {
    this.instrumentFilter.set(value);
  }

  /**
   * Establece el filtro de nivel.
   * @param {string|number} value Nivel (1-5) o 'todos'.
   */
  setLevel(value) {
    this.levelFilter.set(value === 'todos' ? 'todos' : Number(value));
  }

  /**
   * Establece el filtro de categoría.
   * @param {string} value Categoría o 'todos'.
   */
  setCategory(value) {
    this.categoryFilter.set(value);
  }

  /**
   * Establece el filtro de origen ('todos', 'builtin', 'user').
   * @param {string} value Origen.
   */
  setOrigin(value) {
    this.originFilter.set(value);
  }

  /**
   * Actualiza la cadena de búsqueda libre.
   * @param {string} text Texto de búsqueda.
   */
  setSearchQuery(text) {
    this.searchQuery.set(String(text || ''));
  }

  /**
   * Restablece todos los filtros a su estado abierto por defecto.
   */
  resetFilters() {
    this.instrumentFilter.set('todos');
    this.levelFilter.set('todos');
    this.categoryFilter.set('todos');
    this.originFilter.set('todos');
    this.searchQuery.set('');
  }

  /**
   * Selecciona una práctica para practicar: en escritorio actualiza el panel activo y en móvil/tablet navega.
   * @param {string} practiceId Identificador de la práctica.
   */
  openPractice(practiceId) {
    this._appVm.activePracticeId.set(practiceId);
    if (this._appVm.windowSizeClass.value !== 'expanded') {
      this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
    } else if (this._appVm.currentRoute.value.name !== 'practicas') {
      this._appVm.navigate(`#/practica/${encodeURIComponent(practiceId)}`);
    }
  }

  /**
   * Navega al editor para crear una práctica nueva desde cero.
   */
  createNewPractice() {
    this._appVm.navigate('#/editor/nueva');
  }

  /**
   * Desbloquea un nivel manualmente si el usuario decide saltarlo.
   * @param {number} levelNumber Nivel destino.
   */
  skipLevel(levelNumber) {
    this._appVm.skipToLevel(levelNumber);
  }
}
