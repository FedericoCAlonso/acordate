import { CATEGORY_LABELS, INSTRUMENT_LABELS, PRACTICE_TYPE_LABELS, RIGHTS_LABELS, STYLE_LABELS, formatKeyName } from '../core/i18n.js';
import {
  createFloatingField,
  el,
  icon,
  openModalDialog,
  openSheetModal
} from './uiHelpers.js';

/** Instrumentos disponibles en el selector superior de Prácticas. */
const INSTRUMENT_TABS = [
  { value: 'guitarra-clasica', label: 'Clásica', fullLabel: 'Guitarra clásica' },
  { value: 'guitarra', label: 'Guitarra', fullLabel: 'Guitarra' },
  { value: 'bajo', label: 'Bajo', fullLabel: 'Bajo' }
];

/**
 * Vista de la pantalla de Prácticas (#/practicas) organizada en 3 pestañas claras:
 * - Ruta (Niveles 1–5 con selector de pasos sin acordeones anidados)
 * - Repertorio (filtros compactos por estilo, nivel y derechos en una sola barra)
 * - Mis prácticas (creación, importación .json/.abc y sesiones propias)
 * Al seleccionar cualquier práctica abre directamente el Modo Atril (#/practica/:id).
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
  }

  /**
   * Abre una pestaña específica desde el router hash (#/practicas/ruta|repertorio|mias).
   * @param {string} tab Nombre de pestaña.
   */
  openSection(tab) {
    this._vm.setActiveSection(tab);
  }

  /**
   * Monta la vista de Prácticas dentro del contenedor.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this.unmount();
    this._container = container;
    container.innerHTML = '';

    this._instBar = el('div', { className: 'practices-top-bar' });
    this._sectionTabs = el('div', { className: 'm3-tabs', role: 'tablist', 'aria-label': 'Secciones de prácticas' });
    this._searchRow = el('div', { className: 'm3-search-row' });
    this._bodyHost = el('div', { className: 'route-stack' });

    this._searchInput = el('input', {
      type: 'search',
      placeholder: 'Buscar práctica o tono…',
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

    const stack = el('div', { className: 'route-stack practices-page' }, [
      this._instBar,
      this._sectionTabs,
      this._searchRow,
      this._bodyHost
    ]);

    container.append(stack);

    this._unsubs = [
      this._vm.instrumentFilter.subscribe(() => {
        this._renderInstrumentBar();
        this._renderSectionTabs();
        this._renderBody();
      }),
      this._vm.activeSection.subscribe(() => {
        this._renderSectionTabs();
        this._renderBody();
      }),
      this._vm.activeFilterCount.subscribe(() => this._syncFilterButton()),
      this._vm.isFiltering.subscribe(() => this._renderBody()),
      this._vm.groupedByLevel.subscribe(() => this._renderBody()),
      this._vm.userPractices.subscribe(() => {
        this._renderSectionTabs();
        this._renderBody();
      }),
      this._vm.repertoirePractices.subscribe(() => {
        this._renderSectionTabs();
        this._renderBody();
      }),
      this._vm.expandedLevel.subscribe(() => this._renderBody()),
      this._appVm.studySessions.subscribe(() => this._renderBody()),
      this._appVm.settings.subscribe(() => this._renderBody()),
      this._appVm.progress.subscribe(() => this._renderBody())
    ];

    this._renderInstrumentBar();
    this._renderSectionTabs();
    this._syncFilterButton();
    this._renderBody();
  }

  /** Libera todas las suscripciones al desmontar. */
  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /** Renderiza el selector de instrumento y el botón integrado "+ Nueva" (sin FAB flotante). */
  _renderInstrumentBar() {
    if (!this._instBar) return;
    const active = this._vm.instrumentFilter.value;
    this._instBar.innerHTML = '';

    const seg = el(
      'div',
      { className: 'm3-segmented practices-inst-seg', role: 'group', 'aria-label': 'Seleccionar instrumento' },
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

    const newBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--filled',
        ripple: true,
        'aria-label': 'Crear nueva práctica',
        onClick: () => this._vm.createNewPractice()
      },
      [icon('plus', 18), 'Nueva']
    );

    this._instBar.append(seg, newBtn);
  }

  /** Renderiza las 3 pestañas principales de Prácticas: Ruta · Repertorio · Mis prácticas. */
  _renderSectionTabs() {
    if (!this._sectionTabs) return;
    const active = this._vm.activeSection.value;
    const repCount = this._vm.repertoirePractices.value.length;
    const myCount = this._vm.userPractices.value.length;

    const tabs = [
      { id: 'ruta', label: 'Ruta', count: null },
      { id: 'repertorio', label: 'Repertorio', count: repCount },
      { id: 'mias', label: 'Mis prácticas', count: myCount }
    ];

    this._sectionTabs.innerHTML = '';
    for (const t of tabs) {
      this._sectionTabs.appendChild(
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: 'm3-tabs__btn',
            ripple: true,
            'aria-pressed': String(active === t.id),
            'aria-selected': String(active === t.id),
            onClick: () => {
              this._vm.setActiveSection(t.id);
              this._appVm.navigate(`#/practicas/${t.id}`);
            }
          },
          [t.label, t.count !== null ? el('span', { className: 'm3-tabs__count' }, [String(t.count)]) : null]
        )
      );
    }
  }

  /** Actualiza la etiqueta del botón "Filtros" indicando cuántos filtros están activos. */
  _syncFilterButton() {
    if (!this._filterBtn) return;
    const count = this._vm.activeFilterCount.value;
    this._filterBtn.innerHTML = '';
    this._filterBtn.appendChild(icon('filter', 18));
    this._filterBtn.appendChild(el('span', {}, [count > 0 ? `Filtros (${count})` : 'Filtros']));
  }

  /** Renderiza el cuerpo según si hay búsqueda/filtros globales activos o la pestaña seleccionada. */
  _renderBody() {
    if (!this._bodyHost) return;
    this._bodyHost.innerHTML = '';

    if (this._vm.isFiltering.value) {
      this._renderSearchResults();
      return;
    }

    const tab = this._vm.activeSection.value;
    if (tab === 'repertorio') {
      this._bodyHost.appendChild(this._buildRepertoireSection());
    } else if (tab === 'mias') {
      this._bodyHost.appendChild(this._buildMyPracticesSection());
    } else {
      this._bodyHost.appendChild(this._buildLevelsRouteSection());
    }
  }

  /**
   * Pestaña 1 — Ruta de niveles (1–5) con barra de pasos horizontal (sin acordeones anidados).
   * @returns {HTMLElement} Sección de Ruta.
   */
  _buildLevelsRouteSection() {
    const groups = this._vm.groupedByLevel.value;
    const activeLvlNum = this._vm.getActiveExpandedLevel() || 1;
    const activeGroup = groups.find((g) => g.level.number === activeLvlNum) || groups[0];

    // Selector horizontal de niveles N1..N5
    const levelPills = el(
      'div',
      { className: 'level-stepper', role: 'tablist', 'aria-label': 'Seleccionar nivel de la ruta' },
      groups.map((g) => {
        const isCurrent = g.level.number === activeGroup?.level.number;
        const { status, level } = g;
        const badgeIcon = status.completed ? icon('check', 15) : !status.unlocked ? icon('lock', 14) : null;
        return el(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: `level-pill ${isCurrent ? 'level-pill--active' : ''} ${status.completed ? 'level-pill--done' : ''} ${!status.unlocked ? 'level-pill--locked' : ''}`,
            ripple: true,
            'aria-selected': String(isCurrent),
            onClick: () => this._vm.expandedLevel.set(level.number)
          },
          [
            el('span', { className: 'level-pill__num' }, [badgeIcon, `Nivel ${level.number}`]),
            el('span', { className: 'level-pill__name' }, [level.name])
          ]
        );
      })
    );

    if (!activeGroup) {
      return el('div', { className: 'route-stack' }, [levelPills]);
    }

    const { level, status, areas } = activeGroup;
    const ratio = status.requiredCount > 0 ? Math.min(1, status.completedCount / status.requiredCount) : 0;

    let stateText;
    if (status.completed) stateText = `Completo · ${status.completedCount}/${status.requiredCount} prácticas clave al objetivo`;
    else if (status.unlocked) stateText = `En curso · ${status.completedCount}/${status.requiredCount} prácticas clave al objetivo`;
    else {
      const rem = status.remainingToUnlock || 2;
      stateText = `Te falta${rem === 1 ? '' : 'n'} ${rem} práctica${rem === 1 ? '' : 's'} clave del nivel ${level.number - 1}`;
    }

    const pct = Math.round(ratio * 100);
    const levelHeaderCard = el('section', { className: `level-summary-strip ${!status.unlocked ? 'level-step--locked' : ''}` }, [
      el('div', { className: 'level-summary-strip__main' }, [
        el('div', { className: 'level-summary-strip__text' }, [
          el('strong', {}, [level.subtitle]),
          el('span', { className: 'm3-body-md' }, [stateText])
        ]),
        el('div', { className: 'm3-linear-progress', style: 'max-width:220px' }, [
          el('div', {
            className: `m3-linear-progress__fill ${status.completed ? 'm3-linear-progress__fill--done' : ''}`,
            style: `width:${pct}%`
          })
        ])
      ]),
      !status.unlocked
        ? el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--tonal',
              ripple: true,
              onClick: () => this._vm.skipLevel(level.number)
            },
            [icon('check', 16), `Saltar a N${level.number}`]
          )
        : null
    ]);

    // Agrupación limpia por área pedagógica con encabezados planos (sin acordeones dentro de acordeones)
    const areaSections = areas.map((areaGroup) =>
      el('section', { className: 'area-block' }, [
        el('div', { className: 'area-block__header' }, [
          el('h3', { className: 'm3-title-md' }, [CATEGORY_LABELS[areaGroup.area] || areaGroup.area]),
          el('span', { className: 'm3-label' }, [`${areaGroup.practices.length} práctica${areaGroup.practices.length === 1 ? '' : 's'}`])
        ]),
        el(
          'div',
          { className: 'practice-grid practice-grid--responsive' },
          areaGroup.practices.map((pr) => this._buildCompactPracticeCard(pr))
        )
      ])
    );

    return el('div', { className: 'route-stack' }, [levelPills, levelHeaderCard, ...areaSections]);
  }

  /**
   * Pestaña 2 — Repertorio con barra compacta de filtros desplegables (estilo, nivel, derechos).
   * @returns {HTMLElement} Sección Repertorio.
   */
  _buildRepertoireSection() {
    const items = this._vm.repertoirePractices.value;
    const styleF = this._vm.repertoireStyleFilter.value;
    const rightsF = this._vm.repertoireRightsFilter.value;
    const lvlF = this._vm.repertoireLevelFilter.value;
    const hasRepFilters = styleF !== 'todos' || rightsF !== 'todos' || lvlF !== 'todos';

    const styleSelect = el(
      'select',
      {
        className: 'm3-field__select compact-select',
        'aria-label': 'Filtrar repertorio por estilo',
        onChange: (e) => this._vm.repertoireStyleFilter.set(e.target.value)
      },
      [
        el('option', { value: 'todos' }, ['Estilo: Todos']),
        ...Object.entries(STYLE_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
      ]
    );
    styleSelect.value = styleF;

    const levelSelect = el(
      'select',
      {
        className: 'm3-field__select compact-select',
        'aria-label': 'Filtrar repertorio por nivel',
        onChange: (e) => this._vm.repertoireLevelFilter.set(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
      },
      [
        el('option', { value: 'todos' }, ['Nivel: Todos']),
        ...[1, 2, 3, 4, 5].map((n) => el('option', { value: String(n) }, [`Nivel ${n}`]))
      ]
    );
    levelSelect.value = String(lvlF);

    const rightsSelect = el(
      'select',
      {
        className: 'm3-field__select compact-select',
        'aria-label': 'Filtrar repertorio por tipo de partitura',
        onChange: (e) => this._vm.repertoireRightsFilter.set(e.target.value)
      },
      [
        el('option', { value: 'todos' }, ['Tipo: Todos']),
        ...Object.entries(RIGHTS_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
      ]
    );
    rightsSelect.value = rightsF;

    const filterToolbar = el('div', { className: 'repertoire-filter-bar' }, [
      styleSelect,
      levelSelect,
      rightsSelect,
      hasRepFilters
        ? el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--text',
              ripple: true,
              onClick: () => {
                this._vm.repertoireStyleFilter.set('todos');
                this._vm.repertoireLevelFilter.set('todos');
                this._vm.repertoireRightsFilter.set('todos');
              }
            },
            ['Limpiar']
          )
        : null
    ]);

    const listEl = items.length > 0
      ? el('div', { className: 'practice-grid practice-grid--responsive' }, items.map((pr) => this._buildCompactPracticeCard(pr, { showRepertoireBadges: true })))
      : el('div', { className: 'empty-state' }, [
          el('div', { className: 'm3-title-md' }, ['Sin piezas con esos filtros']),
          el('p', { className: 'm3-body-md' }, ['Probá cambiando el estilo, el nivel o el instrumento activo.'])
        ]);

    return el('section', { className: 'route-stack', 'aria-label': 'Repertorio' }, [
      el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
        el('div', { className: 'player-toolbar' }, [
          el('div', {}, [
            el('h2', { className: 'm3-title-md' }, [`Repertorio (${items.length})`]),
            el('span', { className: 'm3-body-md' }, ['Standards en modo solo armonía, temas tradicionales y obras de dominio público'])
          ])
        ]),
        filterToolbar
      ]),
      listEl
    ]);
  }

  /**
   * Pestaña 3 — Mis prácticas + sesiones personalizadas + importación .json / .abc.
   * @returns {HTMLElement} Sección Mis prácticas.
   */
  _buildMyPracticesSection() {
    const userItems = this._vm.userPractices.value;
    const savedSessions = this._appVm.studySessions.value.filter(
      (s) => s.instrument === this._vm.instrumentFilter.value
    );

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

    const actionsCard = el('div', { className: 'm3-card', style: 'display:flex; flex-direction:column; gap:10px' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, [`Mis prácticas (${userItems.length})`]),
          el('span', { className: 'm3-body-md' }, ['Ejercicios creados con el editor o importados desde .json / .abc'])
        ]),
        el('div', { className: 'm3-chip-row' }, [
          fileInput,
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--filled',
              ripple: true,
              onClick: () => this._vm.createNewPractice()
            },
            [icon('plus', 17), 'Crear práctica']
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--outlined',
              ripple: true,
              onClick: () => fileInput.click()
            },
            [icon('upload', 16), 'Importar']
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--tonal',
              ripple: true,
              onClick: () => this._openSessionBuilderDialog()
            },
            [icon('playlist', 16), 'Armar sesión']
          )
        ])
      ]),
      savedSessions.length > 0
        ? el('div', { style: 'display:flex; flex-direction:column; gap:6px' }, [
            el('span', { className: 'm3-label' }, ['Tus sesiones guardadas']),
            el(
              'div',
              { className: 'm3-chip-row' },
              savedSessions.map((ses) =>
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'm3-chip',
                    ripple: true,
                    onClick: () => this._appVm.startStudySession(ses)
                  },
                  [icon('play', 15), `${ses.title} (${ses.items.reduce((a, b) => a + b.minutes, 0)} min)`]
                )
              )
            )
          ])
        : null
    ]);

    const content =
      userItems.length === 0
        ? el('div', { className: 'empty-state' }, [
            this._buildEmptyIllustration(),
            el('div', { className: 'm3-title-md' }, ['Todavía no creaste prácticas para este instrumento']),
            el('p', { className: 'm3-body-md' }, ['Armá tu propia escala, progresión o walking bass en el editor, o importá un archivo JSON/.abc.']),
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--tonal',
                ripple: true,
                onClick: () => this._vm.createNewPractice()
              },
              [icon('plus', 18), 'Crear mi primera práctica']
            )
          ])
        : el('div', { className: 'practice-grid practice-grid--responsive' }, userItems.map((pr) => this._buildCompactPracticeCard(pr)));

    return el('section', { className: 'route-stack', 'aria-label': 'Mis prácticas' }, [actionsCard, content]);
  }

  /** Dibuja un anillo SVG de progreso de nivel (46x46 px). */
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

  /** Dibuja una ilustración vectorial liviana para el estado vacío de Mis prácticas. */
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

  /** Renderiza los resultados planos cuando hay búsqueda o filtros activos. */
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
      el('div', { className: 'practice-grid practice-grid--responsive' }, items.map((pr) => this._buildCompactPracticeCard(pr, { showRepertoireBadges: true })))
    );
  }

  /**
   * Construye una tarjeta limpia y legible de práctica (sin sobrecarga de insignias).
   * @param {import('../models/Practice.js').Practice} pr Instancia de práctica.
   * @param {{ showRepertoireBadges?: boolean }} [opts={}] Opciones de visualización.
   * @returns {HTMLElement} Botón tarjeta.
   */
  _buildCompactPracticeCard(pr, { showRepertoireBadges = false } = {}) {
    const prog = this._appVm.progress.value;
    const stats = prog.getPracticeStats(pr.id);
    const status = prog.getPracticeStatus(pr.id, pr.tempo.target);
    const notation = this._appVm.settings.value.chordNotation;
    const pct = Math.min(100, Math.round(((stats.bestBpm || 0) / (pr.tempo.target || 100)) * 100));

    const statusIconName = status === 'dominada' ? 'check' : status === 'en-curso' ? 'progress' : 'circle';
    const statusLabel = status === 'dominada' ? 'Dominada' : status === 'en-curso' ? 'En curso' : 'Nueva';

    const repBadges = [];
    if (showRepertoireBadges && pr.style) {
      repBadges.push(el('span', { className: 'm3-badge' }, [STYLE_LABELS[pr.style] || pr.style]));
    }
    if (showRepertoireBadges && pr.rights) {
      repBadges.push(el('span', { className: 'm3-badge m3-badge--tertiary' }, [RIGHTS_LABELS[pr.rights] || pr.rights]));
    }

    return el(
      'button',
      {
        type: 'button',
        className: 'practice-card',
        ripple: true,
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
          `${PRACTICE_TYPE_LABELS[pr.type] || 'Melodía'} · Nivel ${pr.level} · ${formatKeyName(pr.key, notation)} · ${pr.timeSignature}${pr.origin === 'user' ? ' · Propia' : ''}`
        ]),
        repBadges.length > 0 ? el('div', { className: 'm3-chip-row', style: 'gap:4px' }, repBadges) : null,
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

  /** Abre el Bottom/Side Sheet de filtros secundarios (Tipo, Área, Nivel, Origen y Etiqueta). */
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

  /** Construye un bloque rotulado de chips para el sheet de filtros. */
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

  /** Abre el constructor modal para armar una sesión de estudio ordenada con tiempos por práctica. */
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
