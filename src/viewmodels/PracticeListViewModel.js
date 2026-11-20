import { ComputedObservable, Observable } from '../core/Observable.js';
import { LEVELS } from '../models/Level.js';

/**
 * Orden pedagógico de áreas (melódicas y armónicas) dentro de cada nivel.
 */
export const AREA_ORDER = [
  'escala',
  'acordes',
  'formas',
  'cambios',
  'inversiones',
  'conduccion-de-voces',
  'campo-armonico',
  'acompanamiento',
  'arpegios-de-acorde',
  'lectura',
  'ritmo',
  'walking',
  'arpegio',
  'oido',
  'repertorio'
];

/**
 * ViewModel de la pantalla de Prácticas organizada como "Ruta".
 * Mantiene un selector de instrumento fijo recordado entre sesiones, bloque "Continuar",
 * "Sesión de hoy" (~15 min), ruta de 5 niveles con anillos de progreso, sección "Mis prácticas"
 * y filtros avanzados en bottom sheet con contador de filtros activos.
 */
export class PracticeListViewModel {
  /**
   * Construye el ViewModel inyectando el AppViewModel compartido.
   * @param {import('./AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   */
  constructor(appVm) {
    /** Referencia al ViewModel global de la app. */
    this._appVm = appVm;

    /** Instrumento activo fijo en la parte superior ('guitarra-clasica' | 'guitarra' | 'bajo'). */
    this.instrumentFilter = new Observable(appVm.settings.value.defaultInstrument || 'guitarra');
    /** Filtro opcional de tipo ('todos' | 'melody' | 'harmony' | 'mixed'). */
    this.typeFilter = new Observable('todos');
    /** Filtro opcional de nivel dentro del bottom sheet ('todos' | 1..5). */
    this.levelFilter = new Observable('todos');
    /** Filtro opcional de área/categoría dentro del bottom sheet ('todos' | categoría). */
    this.categoryFilter = new Observable('todos');
    /** Filtro opcional de origen ('todos' | 'builtin' | 'user'). */
    this.originFilter = new Observable('todos');
    /** Filtro opcional por etiqueta. */
    this.tagFilter = new Observable('');
    /** Filtro de estilo en la sección Repertorio ('todos' | estilo). */
    this.repertoireStyleFilter = new Observable('todos');
    /** Filtro de derechos en la sección Repertorio ('todos' | 'public_domain' | 'harmony_only' | 'user_import'). */
    this.repertoireRightsFilter = new Observable('todos');
    /** Filtro de nivel en la sección Repertorio ('todos' | 1..5). */
    this.repertoireLevelFilter = new Observable('todos');
    /** Texto libre de búsqueda en la Search Bar Material 3. */
    this.searchQuery = new Observable('');
    /** Nivel actualmente abierto en la ruta de niveles (null = automático según progreso). */
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

    /** Indica si hay búsqueda o filtros avanzados activos (cambia a vista de resultados filtrados). */
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
      () => this._computeFiltered()
    );

    /** Prácticas del usuario (sección propia "Mis prácticas") filtradas por instrumento. */
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

    /** Etiquetas disponibles en el instrumento activo para sugerir en el filtro. */
    this.availableTags = new ComputedObservable(
      [this.instrumentPractices],
      () => {
        const set = new Set();
        for (const p of this.instrumentPractices.value) {
          for (const t of p.tags) set.add(t);
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'es-AR'));
      }
    );

    /** Tarjeta "Continuar": última práctica estudiada para el instrumento activo o la primera disponible. */
    this.continueCard = new ComputedObservable(
      [this.instrumentPractices, appVm.progress],
      () => {
        const list = this.instrumentPractices.value;
        if (list.length === 0) return null;
        const prog = appVm.progress.value;
        const lastId = prog.lastPracticeByInstrument[this.instrumentFilter.value];
        let target = lastId ? list.find((p) => p.id === lastId) : null;

        if (!target) {
          // Busca la práctica con lastSessionAt más reciente dentro de este instrumento
          let latest = null;
          let latestTime = '';
          for (const p of list) {
            const st = prog.getPracticeStats(p.id);
            if (st.lastSessionAt && st.lastSessionAt > latestTime) {
              latestTime = st.lastSessionAt;
              latest = p;
            }
          }
          target = latest || list[0];
        }

        return {
          practice: target,
          stats: prog.getPracticeStats(target.id),
          isFresh: prog.getPracticeStatus(target.id, target.tempo.target) === 'nueva'
        };
      }
    );

    /** Rutina sugerida "Sesión de hoy" (~15 minutos: calentamiento escala, acordes, lectura y ritmo). */
    this.todayRoutine = new ComputedObservable(
      [this.instrumentPractices, this.levelsStatus, appVm.progress],
      () => this._buildTodayRoutine()
    );

    /** Ruta de los 5 niveles con sus prácticas agrupadas por área pedagógica. */
    this.groupedByLevel = new ComputedObservable(
      [this.filteredPractices, this.levelsStatus],
      () => {
        const items = this.filteredPractices.value;
        const statusMap = this.levelsStatus.value;
        return LEVELS.map((level) => {
          const levelPractices = items.filter((p) => p.level === level.number);
          const areas = AREA_ORDER.map((area) => ({
            area,
            practices: levelPractices.filter((p) => p.category === area)
          })).filter((g) => g.practices.length > 0);

          return {
            level,
            status: statusMap[level.number] || {
              unlocked: level.number === 1,
              completed: false,
              completedCount: 0,
              requiredCount: 2,
              remainingToUnlock: 2,
              totalPractices: levelPractices.length,
              skipped: false
            },
            practices: levelPractices,
            areas
          };
        });
      }
    );

    // Sincroniza el instrumento recordado al terminar la carga inicial
    appVm.isReady.subscribe((ready) => {
      if (ready && appVm.settings.value.defaultInstrument) {
        this.instrumentFilter.set(appVm.settings.value.defaultInstrument);
      }
    });
  }

  /**
   * Construye la rutina sugerida de ~15 minutos adaptada al nivel activo del instrumento seleccionado.
   * @returns {{ title: string, totalMinutes: number, items: Array<{ role: string, practice: object, practiceId: string, minutes: number }> }} Rutina sugerida.
   */
  _buildTodayRoutine() {
    const list = this.instrumentPractices.value;
    if (list.length === 0) return { title: 'Sesión de hoy', totalMinutes: 0, items: [] };

    const statusMap = this.levelsStatus.value;
    const prog = this._appVm.progress.value;

    // Determina el nivel más alto desbloqueado que aún no esté completado
    let activeLevel = 1;
    for (const lvl of LEVELS) {
      const st = statusMap[lvl.number];
      if (st?.unlocked) {
        activeLevel = lvl.number;
        if (!st.completed) break;
      }
    }

    const levelPool = list.filter((p) => p.level === activeLevel);
    const pool = levelPool.length >= 4 ? levelPool : list;

    const pickByCategory = (cats) => {
      const candidates = pool.filter((p) => cats.includes(p.category));
      if (candidates.length === 0) return null;
      // Prioriza una práctica aún no dominada
      const pending = candidates.find((p) => prog.getPracticeStatus(p.id, p.tempo.target) !== 'dominada');
      return pending || candidates[0];
    };

    const plan = [
      { role: 'Calentamiento', cats: ['escala', 'arpegio'], minutes: 3 },
      { role: 'Acordes', cats: ['acordes'], minutes: 4 },
      { role: 'Lectura', cats: ['lectura'], minutes: 4 },
      { role: 'Ritmo / Groove', cats: ['ritmo', 'walking'], minutes: 4 }
    ];

    const items = [];
    const usedIds = new Set();
    for (const slot of plan) {
      const found = pickByCategory(slot.cats);
      if (found && !usedIds.has(found.id)) {
        usedIds.add(found.id);
        items.push({
          role: slot.role,
          practice: found,
          practiceId: found.id,
          minutes: slot.minutes
        });
      }
    }

    const totalMinutes = items.reduce((acc, it) => acc + it.minutes, 0);
    return {
      title: `Sesión de hoy (Nivel ${activeLevel})`,
      totalMinutes,
      items
    };
  }

  /**
   * Aplica todos los filtros activos sobre las prácticas del instrumento elegido.
   * @returns {import('../models/Practice.js').Practice[]} Lista filtrada ordenada por nivel y título.
   */
  _computeFiltered() {
    const base = this.instrumentPractices.value;
    const typeF = this.typeFilter.value;
    const lvl = this.levelFilter.value;
    const cat = this.categoryFilter.value;
    const origin = this.originFilter.value;
    const tag = this.tagFilter.value.trim().toLowerCase();
    const query = this.searchQuery.value.trim().toLowerCase();

    return base
      .filter((p) => {
        if (typeF !== 'todos' && p.type !== typeF) return false;
        if (lvl !== 'todos' && p.level !== Number(lvl)) return false;
        if (cat !== 'todos' && p.category !== cat) return false;
        if (origin !== 'todos' && p.origin !== origin) return false;
        if (tag && !p.tags.some((t) => t.toLowerCase() === tag)) return false;
        if (query) {
          const haystack = `${p.title} ${p.key} ${p.tags.join(' ')} ${p.notes}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'es-AR'));
  }

  /**
   * Establece el filtro de tipo de práctica ('todos' | 'melody' | 'harmony' | 'mixed').
   * @param {string} value Tipo elegido.
   */
  setType(value) {
    this.typeFilter.set(value);
  }

  /**
   * Cambia el instrumento fijo superior y lo recuerda en Ajustes para próximas sesiones.
   * @param {'guitarra-clasica'|'guitarra'|'bajo'|'todos'} value Instrumento elegido.
   */
  setInstrument(value) {
    this.instrumentFilter.set(value);
    if (['guitarra-clasica', 'guitarra', 'bajo'].includes(value)) {
      this._appVm.updateSettings({ defaultInstrument: value });
    }
  }

  /**
   * Establece el filtro de nivel.
   * @param {string|number} value Nivel (1-5) o 'todos'.
   */
  setLevel(value) {
    this.levelFilter.set(value === 'todos' ? 'todos' : Number(value));
  }

  /**
   * Establece el filtro de categoría/área.
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
   * Establece el filtro de etiqueta.
   * @param {string} tag Etiqueta o cadena vacía.
   */
  setTag(tag) {
    this.tagFilter.set(String(tag || ''));
  }

  /**
   * Actualiza la cadena de búsqueda libre.
   * @param {string} text Texto de búsqueda.
   */
  setSearchQuery(text) {
    this.searchQuery.set(String(text || ''));
  }

  /**
   * Limpia búsqueda y filtros secundarios manteniendo el instrumento activo.
   */
  resetFilters() {
    this.typeFilter.set('todos');
    this.levelFilter.set('todos');
    this.categoryFilter.set('todos');
    this.originFilter.set('todos');
    this.tagFilter.set('');
    this.searchQuery.set('');
  }

  /**
   * Abre o colapsa un nivel específico en la ruta de niveles.
   * @param {number} levelNumber Número de nivel (1 a 5).
   */
  toggleLevelExpanded(levelNumber) {
    const current = this.getActiveExpandedLevel();
    this.expandedLevel.set(current === levelNumber ? 0 : levelNumber);
  }

  /**
   * Determina qué nivel debe mostrarse expandido por defecto (el nivel actual en curso).
   * @returns {number} Número de nivel expandido (0 si todos cerrados).
   */
  getActiveExpandedLevel() {
    if (this.expandedLevel.value !== null) return this.expandedLevel.value;
    const statusMap = this.levelsStatus.value;
    for (const lvl of LEVELS) {
      const st = statusMap[lvl.number];
      if (st?.unlocked && !st.completed) return lvl.number;
    }
    return 1;
  }

  /**
   * Inicia la rutina sugerida "Sesión de hoy".
   */
  startTodayRoutine() {
    const routine = this.todayRoutine.value;
    if (!routine || routine.items.length === 0) return;
    this._appVm.startStudySession(routine);
  }

  /**
   * Abre una práctica para practicar: en escritorio actualiza el panel activo y en móvil/tablet navega.
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
