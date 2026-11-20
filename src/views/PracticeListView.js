import { CATEGORY_LABELS, INSTRUMENT_LABELS, PRACTICE_TYPE_LABELS, formatKeyName } from '../core/i18n.js';
import {
  createFloatingField,
  createPopupMenu,
  el,
  icon,
  openModalDialog,
  openSheetModal
} from './uiHelpers.js';

/**
 * Instrumentos disponibles en el selector fijo superior de la ruta de prácticas.
 */
const INSTRUMENT_TABS = [
  { value: 'guitarra-clasica', label: 'Clásica', fullLabel: 'Guitarra clásica' },
  { value: 'guitarra', label: 'Guitarra', fullLabel: 'Guitarra' },
  { value: 'bajo', label: 'Bajo', fullLabel: 'Bajo' }
];

/**
 * Vista de la pantalla de Prácticas v2 organizada como "Ruta".
 * Muestra selector fijo de instrumento, Search Bar + botón de filtros en bottom sheet,
 * bloques "Continuar", "Sesión de hoy", "Ruta de niveles" con anillos de progreso,
 * "Mis prácticas" con estado vacío ilustrado y FAB flotante.
 */
export class PracticeListView {
  /**
   * Inicializa la vista con su ViewModel, el AppViewModel y el servicio de importar/exportar.
   * @param {import('../viewmodels/PracticeListViewModel.js').PracticeListViewModel} vm ViewModel de lista.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel global.
   * @param {import('../services/ImportExportService.js').ImportExportService} [ioService] Servicio para importar sets.
   */
  constructor(vm, appVm, ioService = null) {
    /** ViewModel de la ruta de prácticas. */
    this._vm = vm;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Servicio de importación rápida de sets. */
    this._io = ioService;
    /** Suscripciones activas. */
    this._unsubs = [];
    /** Contenedor DOM. */
    this._container = null;
    /** Botón FAB flotante anexado a la vista. */
    this._fabEl = null;
  }

  /**
   * Monta la vista de ruta de prácticas dentro del contenedor.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    container.innerHTML = '';

    this._instBar = el('div', { className: 'instrument-sticky' });
    this._searchRow = el('div', { className: 'm3-search-row' });
    this._bodyHost = el('div', { className: 'route-stack' });

    this._searchInput = el('input', {
      type: 'search',
      placeholder: 'Buscar práctica, tonalidad o tema…',
      'aria-label': 'Buscar prácticas',
      value: this._vm.searchQuery.value,
      onInput: (e) => this._vm.setSearchQuery(e.target.value)
    });

    this._filterBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--tonal',
        ripple: true,
        'aria-label': 'Abrir filtros avanzados',
        onClick: () => this._openFiltersSheet()
      },
      [icon('filter', 18), el('span', {}, ['Filtros'])]
    );

    const searchBar = el('div', { className: 'm3-search-bar' }, [
      icon('search', 20),
      this._searchInput
    ]);

    this._searchRow.append(searchBar, this._filterBtn);

    const stack = el('div', { className: 'route-stack' }, [
      this._instBar,
      this._searchRow,
      this._bodyHost
    ]);

    // FAB flotante para crear una nueva práctica
    this._fabEl = el(
      'button',
      {
        type: 'button',
        className: 'm3-fab m3-fab--primary m3-fab--floating',
        ripple: true,
        'aria-label': 'Crear nueva práctica',
        onClick: () => this._vm.createNewPractice()
      },
      [icon('plus', 22), el('span', {}, ['Nueva'])]
    );

    container.append(stack, this._fabEl);

    this._unsubs = [
      this._vm.instrumentFilter.subscribe(() => {
        this._renderInstrumentTabs();
        this._renderBody();
      }),
      this._vm.activeFilterCount.subscribe(() => this._syncFilterButton()),
      this._vm.isFiltering.subscribe(() => this._renderBody()),
      this._vm.groupedByLevel.subscribe(() => this._renderBody()),
      this._vm.continueCard.subscribe(() => this._renderBody()),
      this._vm.todayRoutine.subscribe(() => this._renderBody()),
      this._vm.userPractices.subscribe(() => this._renderBody()),
      this._vm.expandedLevel.subscribe(() => this._renderBody()),
      this._appVm.activePracticeId.subscribe(() => this._renderBody()),
      this._appVm.studySessions.subscribe(() => this._renderBody()),
      this._appVm.settings.subscribe(() => this._renderBody()),
      this._appVm.progress.subscribe(() => this._renderBody())
    ];

    this._renderInstrumentTabs();
    this._syncFilterButton();
    this._renderBody();
  }

  /**
   * Libera todas las suscripciones al desmontar.
   */
  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._fabEl?.remove();
    this._fabEl = null;
    this._container = null;
  }

  /**
   * Renderiza el selector de instrumento fijo superior (Guitarra clásica / Guitarra / Bajo).
   */
  _renderInstrumentTabs() {
    if (!this._instBar) return;
    const active = this._vm.instrumentFilter.value;
    this._instBar.innerHTML = '';

    const seg = el(
      'div',
      { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Seleccionar instrumento' },
      INSTRUMENT_TABS.map((inst) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            title: inst.fullLabel,
            'aria-pressed': String(active === inst.value),
            onClick: () => this._vm.setInstrument(inst.value)
          },
          [inst.label]
        )
      )
    );
    this._instBar.appendChild(seg);
  }

  /**
   * Actualiza la etiqueta del botón "Filtros" indicando cuántos filtros están activos.
   */
  _syncFilterButton() {
    if (!this._filterBtn) return;
    const count = this._vm.activeFilterCount.value;
    this._filterBtn.innerHTML = '';
    this._filterBtn.appendChild(icon('filter', 18));
    this._filterBtn.appendChild(el('span', {}, [count > 0 ? `Filtros (${count})` : 'Filtros']));
  }

  /**
   * Renderiza el cuerpo principal: resultados filtrados o los bloques de la Ruta.
   */
  _renderBody() {
    if (!this._bodyHost) return;
    this._bodyHost.innerHTML = '';

    if (this._vm.isFiltering.value) {
      this._renderSearchResults();
      return;
    }

    // 1) Bloques "Continuar" y "Sesión de hoy" visibles inmediatamente en la primera pantalla
    const heroGrid = el('div', { className: 'hero-cards-grid' }, [
      this._buildContinueBlock(),
      this._buildTodaySessionBlock()
    ]);
    this._bodyHost.appendChild(heroGrid);

    // 2) Ruta de niveles (1 a 5) con anillos de progreso
    this._bodyHost.appendChild(this._buildLevelsRouteSection());

    // 3) Sección propia "Mis prácticas" y sesiones personalizadas
    this._bodyHost.appendChild(this._buildMyPracticesSection());
  }

  /**
   * Construye la tarjeta destacada "Continuar" con la última práctica del instrumento activo.
   * @returns {HTMLElement|null} Tarjeta Continuar.
   */
  _buildContinueBlock() {
    const info = this._vm.continueCard.value;
    if (!info) return null;
    const { practice, stats, isFresh } = info;
    const notation = this._appVm.settings.value.chordNotation;
    const pct = Math.min(100, Math.round(((stats.bestBpm || 0) / (practice.tempo.target || 100)) * 100));

    return el('section', { className: 'continue-card', 'aria-label': 'Continuar práctica' }, [
      el('div', { className: 'player-toolbar' }, [
        el('span', { className: 'm3-label' }, [isFresh ? 'PARA EMPEZAR' : 'CONTINUAR']),
        el('span', { className: 'm3-label' }, [`Nivel ${practice.level} · ${formatKeyName(practice.key, notation)}`])
      ]),
      el('h2', { className: 'm3-title-lg' }, [practice.title]),
      el('div', { className: 'm3-body-md' }, [
        stats.bestBpm > 0
          ? `Mejor marca: ${stats.bestBpm} / ${practice.tempo.target} BPM (${pct}%)`
          : `Inicio sugerido: ${practice.tempo.start} BPM · Objetivo: ${practice.tempo.target} BPM`
      ]),
      el('div', { style: 'margin-top:4px' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--filled',
            ripple: true,
            onClick: () => this._vm.openPractice(practice.id)
          },
          [icon('play', 18), isFresh ? 'Empezar ahora' : 'Seguir practicando']
        )
      ])
    ]);
  }

  /**
   * Construye la tarjeta "Sesión de hoy" (~15 min) y el botón para armar una sesión personalizada.
   * @returns {HTMLElement} Tarjeta de sesión sugerida.
   */
  _buildTodaySessionBlock() {
    const routine = this._vm.todayRoutine.value;
    const savedSessions = this._appVm.studySessions.value.filter(
      (s) => s.instrument === this._vm.instrumentFilter.value
    );

    const rows = routine.items.map((item) =>
      el('div', { className: 'routine-row' }, [
        el('span', { style: 'min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap' }, [
          el('strong', {}, [`${item.role}: `]),
          item.practice.title
        ]),
        el('span', { className: 'm3-label', style: 'flex-shrink:0' }, [`${item.minutes} min`])
      ])
    );

    const customList =
      savedSessions.length > 0
        ? el(
            'div',
            { className: 'm3-chip-row', style: 'margin-top:8px' },
            savedSessions.map((ses) =>
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-chip',
                  ripple: true,
                  onClick: () => this._appVm.startStudySession(ses)
                },
                [icon('playlist', 16), `${ses.title} (${ses.items.reduce((a, b) => a + b.minutes, 0)} min)`]
              )
            )
          )
        : null;

    return el('section', { className: 'm3-card', 'aria-label': 'Sesión de hoy' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, [routine.title]),
        el('span', { className: 'm3-badge m3-badge--tertiary' }, [`~${routine.totalMinutes} min`])
      ]),
      el('div', { className: 'routine-list' }, rows),
      el('div', { className: 'm3-chip-row', style: 'margin-top:8px' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--tonal',
            ripple: true,
            onClick: () => this._vm.startTodayRoutine()
          },
          [icon('play', 18), 'Iniciar sesión']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--outlined',
            ripple: true,
            onClick: () => this._openSessionBuilderDialog()
          },
          [icon('playlist', 18), 'Armar sesión']
        )
      ]),
      customList
    ]);
  }

  /**
   * Construye la sección "Ruta de niveles" con anillos de progreso SVG y áreas plegables dentro de cada nivel.
   * @returns {HTMLElement} Contenedor de la ruta de niveles.
   */
  _buildLevelsRouteSection() {
    const groups = this._vm.groupedByLevel.value;
    const expanded = this._vm.getActiveExpandedLevel();

    const steps = groups.map((group) => {
      const { level, status, areas } = group;
      const isOpen = expanded === level.number;
      const pct = status.requiredCount > 0 ? Math.min(1, status.completedCount / status.requiredCount) : 0;

      let stateText;
      if (status.completed) stateText = `Completo (${status.completedCount}/${status.requiredCount} clave)`;
      else if (status.unlocked) stateText = `En curso · ${status.completedCount}/${status.requiredCount} prácticas clave`;
      else {
        const rem = status.remainingToUnlock || 2;
        stateText = `Te falta${rem === 1 ? '' : 'n'} ${rem} práctica${rem === 1 ? '' : 's'} clave del nivel ${level.number - 1}`;
      }

      const menuItems = [
        !status.unlocked
          ? {
              label: `Saltar al nivel ${level.number}`,
              iconName: 'check',
              onClick: () => this._vm.skipLevel(level.number)
            }
          : null,
        {
          label: isOpen ? 'Plegar nivel' : 'Ver prácticas del nivel',
          iconName: 'music',
          onClick: () => this._vm.toggleLevelExpanded(level.number)
        }
      ].filter(Boolean);

      const header = el('div', { className: 'level-step__header' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'level-step__toggle',
            'aria-expanded': String(isOpen),
            onClick: () => this._vm.toggleLevelExpanded(level.number)
          },
          [
            this._buildProgressRing(level.number, pct, status.completed, !status.unlocked),
            el('div', { style: 'min-width:0' }, [
              el('div', { className: 'm3-title-md' }, [`Nivel ${level.number}: ${level.name}`]),
              el('div', { className: 'm3-body-md' }, [`${level.subtitle} · ${stateText}`])
            ])
          ]
        ),
        createPopupMenu(`Opciones del nivel ${level.number}`, menuItems)
      ]);

      let body = null;
      if (isOpen) {
        body = el(
          'div',
          { className: 'level-step__body' },
          areas.map((areaGroup, idx) =>
            el('details', { className: 'm3-collapsible', open: idx === 0 }, [
              el('summary', {}, [
                el('span', {}, [`${CATEGORY_LABELS[areaGroup.area] || areaGroup.area} (${areaGroup.practices.length})`]),
                icon('chevronDown', 18)
              ]),
              el('div', { className: 'm3-collapsible__content' }, [
                el(
                  'div',
                  { className: 'practice-grid' },
                  areaGroup.practices.map((pr) => this._buildCompactPracticeCard(pr))
                )
              ])
            ])
          )
        );
      }

      return el('article', { className: `level-step ${status.unlocked ? '' : 'level-step--locked'}` }, [header, body]);
    });

    return el('section', { className: 'route-stack', 'aria-label': 'Ruta de niveles' }, [
      el('h2', { className: 'm3-title-lg' }, ['Ruta de niveles']),
      ...steps
    ]);
  }

  /**
   * Construye un anillo SVG de progreso de nivel (46x46 px).
   * @param {number} levelNumber Número del nivel.
   * @param {number} ratio Fracción de avance [0, 1].
   * @param {boolean} isCompleted True si alcanzó las prácticas clave.
   * @param {boolean} isLocked True si el nivel está bloqueado.
   * @returns {HTMLElement} Nodo del anillo.
   */
  _buildProgressRing(levelNumber, ratio, isCompleted, isLocked) {
    const r = 19;
    const c = 2 * Math.PI * r;
    const dashOffset = c * (1 - Math.max(0, Math.min(1, ratio)));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 46 46');
    svg.setAttribute('width', '46');
    svg.setAttribute('height', '46');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <circle cx="23" cy="23" r="${r}" fill="none" stroke="var(--md-sys-color-outline-variant)" stroke-width="4"/>
      <circle cx="23" cy="23" r="${r}" fill="none" stroke="${isCompleted ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-primary)'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"/>
    `;

    const center = isCompleted
      ? icon('check', 18)
      : isLocked
        ? icon('lock', 16)
        : el('span', { className: 'level-ring__label' }, [String(levelNumber)]);

    return el('div', { className: 'level-ring' }, [svg, center]);
  }

  /**
   * Construye la sección dedicada "Mis prácticas" con estado vacío ilustrado e importación de sets.
   * @returns {HTMLElement} Sección Mis prácticas.
   */
  _buildMyPracticesSection() {
    const userItems = this._vm.userPractices.value;
    const fileInput = el('input', {
      type: 'file',
      accept: '.json,.abc,application/json,text/plain',
      className: 'sr-only',
      onChange: async (e) => {
        const f = e.target.files?.[0];
        if (!f || !this._io) return;
        const text = await f.text();
        if (f.name.toLowerCase().endsWith('.abc')) {
          const { practice, errors } = this._io.importPracticeFromAbc(text, f.name);
          if (practice) {
            await this._appVm.upsertUserPractice(practice);
            this._appVm.showSnackbar(`Importada "${practice.title}".`);
          } else {
            this._appVm.showSnackbar(errors[0] || 'Error al importar .abc');
          }
        } else {
          const { practices, errors } = this._io.importPracticesFromJson(text);
          if (practices.length > 0) {
            const count = await this._appVm.importUserPractices(practices);
            this._appVm.showSnackbar(`${count} práctica${count === 1 ? '' : 's'} importada${count === 1 ? '' : 's'}.`);
          } else {
            this._appVm.showSnackbar(errors[0] || 'Error al importar JSON');
          }
        }
        e.target.value = '';
      }
    });

    const header = el('div', { className: 'player-toolbar' }, [
      el('h2', { className: 'm3-title-lg' }, [`Mis prácticas (${userItems.length})`]),
      el('div', { className: 'stepper-inline' }, [
        fileInput,
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--compact m3-btn--outlined',
            ripple: true,
            onClick: () => fileInput.click()
          },
          [icon('upload', 16), 'Importar set']
        )
      ])
    ]);

    const content =
      userItems.length === 0
        ? el('div', { className: 'empty-state' }, [
            this._buildEmptyIllustration(),
            el('div', { className: 'm3-title-md' }, ['Todavía no creaste prácticas.']),
            el('p', { className: 'm3-body-md' }, ['Tocá + para armar tu primera escala, progresión o walking bass, o importá un set en JSON/.abc.']),
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--tonal',
                ripple: true,
                onClick: () => this._vm.createNewPractice()
              },
              [icon('plus', 18), 'Crear práctica']
            )
          ])
        : el('div', { className: 'practice-grid' }, userItems.map((pr) => this._buildCompactPracticeCard(pr)));

    return el('section', { className: 'route-stack', 'aria-label': 'Mis prácticas', style: 'margin-bottom:56px' }, [
      header,
      content
    ]);
  }

  /**
   * Dibuja una ilustración vectorial liviana para el estado vacío de Mis prácticas.
   * @returns {SVGSVGElement} Ilustración SVG.
   */
  _buildEmptyIllustration() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 64');
    svg.setAttribute('width', '104');
    svg.setAttribute('height', '56');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <g stroke="var(--md-sys-color-outline)" stroke-width="2" opacity="0.55">
        <line x1="8" y1="16" x2="112" y2="16"/>
        <line x1="8" y1="26" x2="112" y2="26"/>
        <line x1="8" y1="36" x2="112" y2="36"/>
        <line x1="8" y1="46" x2="112" y2="46"/>
      </g>
      <circle cx="44" cy="40" r="8" fill="var(--md-sys-color-primary)"/>
      <rect x="50" y="12" width="3" height="28" fill="var(--md-sys-color-primary)"/>
      <circle cx="76" cy="30" r="8" fill="var(--md-sys-color-tertiary)"/>
      <rect x="82" y="8" width="3" height="22" fill="var(--md-sys-color-tertiary)"/>
      <path d="M50 12 L85 8 L85 14 L50 18 Z" fill="var(--md-sys-color-primary)"/>
    `;
    return svg;
  }

  /**
   * Renderiza los resultados planos cuando el usuario escribe en la búsqueda o aplica filtros del sheet.
   */
  _renderSearchResults() {
    const items = this._vm.filteredPractices.value;
    const header = el('div', { className: 'player-toolbar' }, [
      el('span', { className: 'm3-body-md' }, [`${items.length} resultado${items.length === 1 ? '' : 's'}`]),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--text',
          ripple: true,
          onClick: () => {
            this._vm.resetFilters();
            this._searchInput.value = '';
          }
        },
        ['Limpiar filtros']
      )
    ]);

    this._bodyHost.appendChild(header);

    if (items.length === 0) {
      this._bodyHost.appendChild(
        el('div', { className: 'empty-state' }, [
          el('div', { className: 'm3-title-md' }, ['Sin coincidencias']),
          el('p', { className: 'm3-body-md' }, ['Probá con otra palabra clave o limpiá los filtros activos.'])
        ])
      );
      return;
    }

    this._bodyHost.appendChild(
      el('div', { className: 'practice-grid' }, items.map((pr) => this._buildCompactPracticeCard(pr)))
    );
  }

  /**
   * Construye una tarjeta compacta de práctica:
   * título (máx 2 líneas), línea única ("Do · 4/4"), barra de progreso BPM e ícono de estado.
   * @param {import('../models/Practice.js').Practice} pr Instancia de práctica.
   * @returns {HTMLElement} Botón tarjeta.
   */
  _buildCompactPracticeCard(pr) {
    const prog = this._appVm.progress.value;
    const stats = prog.getPracticeStats(pr.id);
    const status = prog.getPracticeStatus(pr.id, pr.tempo.target);
    const notation = this._appVm.settings.value.chordNotation;
    const isSelected = pr.id === this._appVm.activePracticeId.value && this._appVm.windowSizeClass.value === 'expanded';
    const pct = Math.min(100, Math.round(((stats.bestBpm || 0) / (pr.tempo.target || 100)) * 100));

    const statusIconName = status === 'dominada' ? 'check' : status === 'en-curso' ? 'progress' : 'circle';
    const statusLabel = status === 'dominada' ? 'Dominada' : status === 'en-curso' ? 'En curso' : 'Nueva';

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
        el('div', { className: 'practice-card__top' }, [
          el('span', { className: 'practice-card__title' }, [pr.title]),
          el(
            'span',
            {
              className: `practice-card__status practice-card__status--${status}`,
              title: statusLabel,
              'aria-label': statusLabel
            },
            [icon(statusIconName, 16)]
          )
        ]),
        el('div', { className: 'm3-body-md' }, [
          `${PRACTICE_TYPE_LABELS[pr.type] || 'Melodía'} · ${formatKeyName(pr.key, notation)} · ${pr.timeSignature}${pr.origin === 'user' ? ' · Propia' : ''}`
        ]),
        el('div', { className: 'practice-card__progress-row' }, [
          el('div', { className: 'm3-linear-progress', style: 'flex:1 1 auto' }, [
            el('div', {
              className: `m3-linear-progress__fill ${status === 'dominada' ? 'm3-linear-progress__fill--done' : ''}`,
              style: `width:${pct}%`
            })
          ]),
          el('span', { style: 'white-space:nowrap; font-variant-numeric:tabular-nums' }, [
            stats.bestBpm > 0 ? `${stats.bestBpm}/${pr.tempo.target} BPM` : `Obj. ${pr.tempo.target} BPM`
          ])
        ])
      ]
    );
  }

  /**
   * Abre el Bottom Sheet de filtros secundarios (Área, Nivel, Origen y Etiqueta).
   */
  _openFiltersSheet() {
    const content = el('div', { style: 'display:flex; flex-direction:column; gap:14px' });

    const renderFilters = (closeFn) => {
      content.innerHTML = '';

      const typeRow = this._buildFilterChipGroup(
        'Tipo',
        [
          { value: 'todos', label: 'Todos' },
          { value: 'melody', label: 'Melodía' },
          { value: 'harmony', label: 'Armonía' },
          { value: 'mixed', label: 'Mixta' }
        ],
        this._vm.typeFilter.value,
        (v) => {
          this._vm.setType(v);
          renderFilters(closeFn);
        }
      );

      const catRow = this._buildFilterChipGroup(
        'Área',
        [{ value: 'todos', label: 'Todas' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))],
        this._vm.categoryFilter.value,
        (v) => {
          this._vm.setCategory(v);
          renderFilters(closeFn);
        }
      );

      const levelRow = this._buildFilterChipGroup(
        'Nivel',
        [{ value: 'todos', label: 'Todos' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `Nivel ${n}` }))],
        this._vm.levelFilter.value,
        (v) => {
          this._vm.setLevel(v);
          renderFilters(closeFn);
        }
      );

      const originRow = this._buildFilterChipGroup(
        'Origen',
        [
          { value: 'todos', label: 'Todas' },
          { value: 'builtin', label: 'Catálogo' },
          { value: 'user', label: 'Mis prácticas' }
        ],
        this._vm.originFilter.value,
        (v) => {
          this._vm.setOrigin(v);
          renderFilters(closeFn);
        }
      );

      const tags = this._vm.availableTags.value.slice(0, 14);
      const tagRow =
        tags.length > 0
          ? this._buildFilterChipGroup(
              'Etiqueta',
              [{ value: '', label: 'Cualquiera' }, ...tags.map((t) => ({ value: t, label: t }))],
              this._vm.tagFilter.value,
              (v) => {
                this._vm.setTag(v);
                renderFilters(closeFn);
              }
            )
          : null;

      const footer = el('div', { className: 'm3-dialog__actions' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--text',
            ripple: true,
            onClick: () => {
              this._vm.resetFilters();
              renderFilters(closeFn);
            }
          },
          ['Limpiar']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--filled',
            ripple: true,
            onClick: closeFn
          },
          [`Ver resultados (${this._vm.filteredPractices.value.length})`]
        )
      ]);

      content.append(typeRow, catRow, levelRow, originRow, tagRow, footer);
    };

    const sheet = openSheetModal({
      title: 'Filtrar prácticas',
      body: content,
      sideOnWide: true
    });
    renderFilters(sheet.close);
  }

  /**
   * Construye un bloque rotulado de chips para el bottom sheet de filtros.
   * @param {string} title Título del grupo.
   * @param {Array<{ value: *, label: string }>} options Opciones.
   * @param {*} current Valor activo.
   * @param {Function} onSelect Handler de selección.
   * @returns {HTMLElement} Bloque DOM.
   */
  _buildFilterChipGroup(title, options, current, onSelect) {
    return el('div', {}, [
      el('div', { className: 'm3-body-md', style: 'margin-bottom:6px; font-weight:600' }, [title]),
      el(
        'div',
        { className: 'm3-chip-row', role: 'group', 'aria-label': title },
        options.map((opt) =>
          el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              ripple: true,
              'aria-pressed': String(opt.value === current),
              onClick: () => onSelect(opt.value)
            },
            [opt.label]
          )
        )
      )
    ]);
  }

  /**
   * Abre el constructor modal para armar una sesión de estudio ordenada con tiempos por práctica.
   */
  _openSessionBuilderDialog() {
    const pool = this._vm.instrumentPractices.value;
    if (pool.length === 0) return;

    const titleField = createFloatingField({
      id: 'ses-title',
      label: 'Nombre de la sesión',
      value: `Rutina ${INSTRUMENT_LABELS[this._vm.instrumentFilter.value] || ''}`.trim()
    });

    const selected = [
      { practiceId: pool[0].id, minutes: 4 },
      ...(pool[1] ? [{ practiceId: pool[1].id, minutes: 5 }] : [])
    ];

    const listHost = el('div', { style: 'display:flex; flex-direction:column; gap:8px' });

    const renderSelected = () => {
      listHost.innerHTML = '';
      selected.forEach((entry, idx) => {
        const prSelect = el(
          'select',
          {
            className: 'm3-field__select',
            style: 'padding:8px 10px; min-height:44px; flex:1 1 auto',
            'aria-label': `Práctica paso ${idx + 1}`,
            onChange: (e) => {
              selected[idx].practiceId = e.target.value;
            }
          },
          pool.map((p) => el('option', { value: p.id, selected: p.id === entry.practiceId }, [`N${p.level} · ${p.title}`]))
        );
        prSelect.value = entry.practiceId;

        const minInput = el('input', {
          type: 'number',
          min: 1,
          max: 60,
          value: entry.minutes,
          className: 'm3-field__input',
          style: 'padding:8px; min-height:44px; width:68px',
          'aria-label': 'Minutos',
          onChange: (e) => {
            selected[idx].minutes = Math.max(1, Math.min(60, Number(e.target.value) || 3));
          }
        });

        const delBtn = el(
          'button',
          {
            type: 'button',
            className: 'm3-icon-btn',
            'aria-label': 'Quitar paso',
            onClick: () => {
              if (selected.length <= 1) return;
              selected.splice(idx, 1);
              renderSelected();
            }
          },
          [icon('close', 18)]
        );

        listHost.appendChild(
          el('div', { className: 'stepper-inline', style: 'width:100%' }, [prSelect, minInput, el('span', { className: 'm3-body-md' }, ['min']), delBtn])
        );
      });
    };

    renderSelected();

    const addBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--outlined',
        ripple: true,
        onClick: () => {
          selected.push({ practiceId: pool[selected.length % pool.length].id, minutes: 4 });
          renderSelected();
        }
      },
      [icon('plus', 16), 'Agregar bloque']
    );

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [
      titleField.wrap,
      listHost,
      addBtn
    ]);

    openModalDialog({
      title: 'Armar sesión de estudio',
      body,
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Guardar',
          variant: 'm3-btn--tonal',
          onClick: async (close) => {
            await this._appVm.saveStudySession({
              title: titleField.control.value,
              instrument: this._vm.instrumentFilter.value,
              items: [...selected]
            });
            close();
          }
        },
        {
          label: 'Guardar e iniciar',
          variant: 'm3-btn--filled',
          onClick: async (close) => {
            const payload = {
              title: titleField.control.value,
              instrument: this._vm.instrumentFilter.value,
              items: [...selected]
            };
            await this._appVm.saveStudySession(payload);
            close();
            this._appVm.startStudySession(payload);
          }
        }
      ]
    });
  }
}
