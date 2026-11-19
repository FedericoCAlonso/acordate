import { CATEGORY_LABELS, INSTRUMENT_LABELS, formatKeyName } from '../core/i18n.js';
import { createFloatingField, el, icon } from './uiHelpers.js';

/**
 * Vista del catálogo y buscador de prácticas (#/practicas).
 * Se suscribe a PracticeListViewModel para renderizar chips de filtro, niveles con
 * desbloqueo y tarjetas seleccionables de prácticas sin contener lógica de dominio.
 */
export class PracticeListView {
  /**
   * Inicializa la vista de lista con su ViewModel y el AppViewModel para leer ajustes/progreso.
   * @param {import('../viewmodels/PracticeListViewModel.js').PracticeListViewModel} vm ViewModel de lista.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel global.
   */
  constructor(vm, appVm) {
    /** ViewModel de la lista de prácticas. */
    this._vm = vm;
    /** ViewModel global para cifrado, selección activa y estadísticas. */
    this._appVm = appVm;
    /** Lista de desuscripciones activas mientras la vista está montada. */
    this._unsubs = [];
    /** Contenedor DOM donde se montó la vista. */
    this._container = null;
    /** Contenedor donde se renderizan los grupos de niveles. */
    this._listWrap = null;
    /** Contenedor de filtros chips. */
    this._chipsWrap = null;
    /** Resumen numérico de resultados. */
    this._countBadge = null;
  }

  /**
   * Monta la vista de lista de prácticas dentro del contenedor indicado.
   * @param {HTMLElement} container Nodo contenedor.
   */
  mount(container) {
    this._container = container;
    container.innerHTML = '';

    const searchField = createFloatingField({
      id: 'practice-search',
      label: 'Buscar práctica, tonalidad o etiqueta…',
      value: this._vm.searchQuery.value,
      onInput: (e) => this._vm.setSearchQuery(e.target.value)
    });

    this._chipsWrap = el('div', { className: 'filter-panel' });
    this._countBadge = el('div', { className: 'm3-body-md' });
    this._listWrap = el('div', { className: 'levels-list' });

    const headerCard = el('div', { className: 'm3-card filter-panel' }, [
      searchField.wrap,
      this._chipsWrap,
      el('div', { className: 'player-toolbar' }, [
        this._countBadge,
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--text',
            ripple: true,
            onClick: () => {
              this._vm.resetFilters();
              searchField.control.value = '';
            }
          },
          ['Limpiar filtros']
        )
      ])
    ]);

    container.appendChild(headerCard);
    container.appendChild(this._listWrap);

    this._unsubs = [
      this._vm.instrumentFilter.subscribe(() => this._renderChips()),
      this._vm.levelFilter.subscribe(() => this._renderChips()),
      this._vm.categoryFilter.subscribe(() => this._renderChips()),
      this._vm.originFilter.subscribe(() => this._renderChips()),
      this._vm.groupedByLevel.subscribe(() => this._renderList()),
      this._appVm.activePracticeId.subscribe(() => this._renderList()),
      this._appVm.settings.subscribe(() => this._renderList()),
      this._appVm.progress.subscribe(() => this._renderList())
    ];

    this._renderChips();
    this._renderList();
  }

  /**
   * Libera todas las suscripciones de la vista al desmontar.
   */
  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Renderiza los grupos de Filter Chips (Instrumento, Nivel, Categoría y Origen).
   */
  _renderChips() {
    if (!this._chipsWrap) return;
    this._chipsWrap.innerHTML = '';

    const instOptions = [
      { value: 'todos', label: 'Todos' },
      { value: 'guitarra-clasica', label: INSTRUMENT_LABELS['guitarra-clasica'] },
      { value: 'guitarra', label: INSTRUMENT_LABELS.guitarra },
      { value: 'bajo', label: INSTRUMENT_LABELS.bajo }
    ];

    const levelOptions = [
      { value: 'todos', label: 'Todos los niveles' },
      ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `Nivel ${n}` }))
    ];

    const catOptions = [
      { value: 'todos', label: 'Todas las áreas' },
      ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
    ];

    const originOptions = [
      { value: 'todos', label: 'Todas' },
      { value: 'builtin', label: 'Catálogo' },
      { value: 'user', label: 'Mis prácticas' }
    ];

    this._chipsWrap.appendChild(
      this._buildChipRow('Instrumento', instOptions, this._vm.instrumentFilter.value, (v) => this._vm.setInstrument(v))
    );
    this._chipsWrap.appendChild(
      this._buildChipRow('Nivel', levelOptions, this._vm.levelFilter.value, (v) => this._vm.setLevel(v))
    );
    this._chipsWrap.appendChild(
      this._buildChipRow('Categoría', catOptions, this._vm.categoryFilter.value, (v) => this._vm.setCategory(v))
    );
    this._chipsWrap.appendChild(
      this._buildChipRow('Origen', originOptions, this._vm.originFilter.value, (v) => this._vm.setOrigin(v))
    );
  }

  /**
   * Construye una fila accesible de chips seleccionables.
   * @param {string} ariaLabel Nombre del grupo de filtros.
   * @param {Array<{ value: *, label: string }>} options Opciones.
   * @param {*} currentValue Valor activo.
   * @param {Function} onSelect Callback al elegir un chip.
   * @returns {HTMLElement} Fila DOM de chips.
   */
  _buildChipRow(ariaLabel, options, currentValue, onSelect) {
    return el(
      'div',
      { className: 'm3-chip-row', role: 'group', 'aria-label': ariaLabel },
      options.map((opt) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(opt.value === currentValue),
            onClick: () => onSelect(opt.value)
          },
          [opt.label]
        )
      )
    );
  }

  /**
   * Renderiza las secciones de niveles y las tarjetas de cada práctica filtrada.
   */
  _renderList() {
    if (!this._listWrap) return;
    const groups = this._vm.groupedByLevel.value;
    const totalFiltered = this._vm.filteredPractices.value.length;
    const notation = this._appVm.settings.value.chordNotation;
    const activeId = this._appVm.activePracticeId.value;
    const progress = this._appVm.progress.value;

    this._countBadge.textContent = `${totalFiltered} práctica${totalFiltered === 1 ? '' : 's'} encontrada${totalFiltered === 1 ? '' : 's'}`;
    this._listWrap.innerHTML = '';

    if (groups.length === 0) {
      this._listWrap.appendChild(
        el('div', { className: 'm3-card' }, [
          el('p', { className: 'm3-title-md' }, ['No hay prácticas que coincidan con esos filtros.']),
          el('p', { className: 'm3-body-md' }, ['Probá limpiando los filtros o creá tu propia práctica en el Editor.'])
        ])
      );
      return;
    }

    for (const group of groups) {
      const { level, status, practices } = group;
      const statusBadge = status.unlocked
        ? el('span', { className: 'm3-badge m3-badge--success' }, [
            icon('check', 14),
            `${status.completedCount}/${status.requiredCount} clave`
          ])
        : el('span', { className: 'm3-badge' }, [icon('lock', 14), 'Sugerido desbloquear']);

      const skipBtn = !status.unlocked
        ? el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--text',
              ripple: true,
              onClick: () => this._vm.skipLevel(level.number)
            },
            ['Saltar nivel']
          )
        : null;

      const header = el('div', { className: 'level-section__header' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, [`Nivel ${level.number}: ${level.name}`]),
          el('span', { className: 'm3-body-md' }, [`${level.subtitle} · ${level.description}`])
        ]),
        el('div', { className: 'm3-chip-row' }, [statusBadge, skipBtn])
      ]);

      const grid = el(
        'div',
        { className: 'practice-grid' },
        practices.map((pr) => {
          const stats = progress.getPracticeStats(pr.id);
          const isSelected = pr.id === activeId && this._appVm.windowSizeClass.value === 'expanded';
          const instText = pr.instruments.map((i) => INSTRUMENT_LABELS[i] || i).join(' · ');

          return el(
            'button',
            {
              type: 'button',
              className: `practice-card ${isSelected ? 'practice-card--active' : ''}`,
              ripple: true,
              'aria-current': isSelected ? 'true' : undefined,
              onClick: () => this._vm.openPractice(pr.id)
            },
            [
              el('div', { className: 'm3-title-md' }, [pr.title]),
              el('div', { className: 'practice-card__meta' }, [
                el('span', { className: 'm3-badge m3-badge--primary' }, [instText]),
                el('span', { className: 'm3-badge' }, [CATEGORY_LABELS[pr.category] || pr.category]),
                el('span', { className: 'm3-badge' }, [`${formatKeyName(pr.key, notation)} · ${pr.timeSignature}`]),
                el('span', { className: 'm3-badge' }, [`Obj. ${pr.tempo.target} BPM`]),
                pr.origin === 'user' ? el('span', { className: 'm3-badge m3-badge--tertiary' }, ['Propia']) : null,
                stats.completedTarget
                  ? el('span', { className: 'm3-badge m3-badge--success' }, [icon('check', 13), `${stats.bestBpm} BPM`])
                  : stats.bestBpm > 0
                    ? el('span', { className: 'm3-badge' }, [`Mejor: ${stats.bestBpm} BPM`])
                    : null
              ])
            ]
          );
        })
      );

      this._listWrap.appendChild(el('section', { className: 'level-section' }, [header, grid]));
    }
  }
}
