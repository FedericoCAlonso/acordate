import { INSTRUMENT_LABELS, PRACTICE_TYPE_LABELS, formatKeyName } from '../core/i18n.js';
import { openNotationGuideModal } from './NotationGuideModal.js';
import { createFloatingField, el, icon, openModalDialog } from './uiHelpers.js';

/** Instrumentos disponibles en la cabecera del Panel de Inicio. */
const INSTRUMENT_TABS = [
  { value: 'guitarra-clasica', label: 'Clásica', fullLabel: 'Guitarra clásica' },
  { value: 'guitarra', label: 'Guitarra', fullLabel: 'Guitarra' },
  { value: 'bajo', label: 'Bajo', fullLabel: 'Bajo' }
];

/**
 * Vista del Panel de Inicio (#/inicio).
 * Ofrece un tablero claro y sin ruido para decidir en 2 segundos qué tocar hoy:
 * - Selector de instrumento + racha y meta diaria de estudio.
 * - Tarjeta principal "Retomar ahora" / "Para empezar".
 * - "Sesión guiada de hoy" (~15 min) con acceso rápido a iniciar o armar sesión.
 * - Avance del nivel activo con acceso directo a las próximas prácticas clave.
 * - Accesos directos a Biblioteca/Repertorio, Acordes, Escalas, Metrónomo, Editor y Guía de símbolos.
 */
export class HomeView {
  /**
   * Construye el Panel de Inicio inyectando su HomeViewModel y AppViewModel.
   * @param {import('../viewmodels/HomeViewModel.js').HomeViewModel} vm ViewModel del Panel.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel global.
   */
  constructor(vm, appVm) {
    /** ViewModel del panel. */
    this._vm = vm;
    /** ViewModel global (sesiones y ajustes). */
    this._appVm = appVm;
    /** Contenedor DOM montado. */
    this._container = null;
    /** Suscripciones reactivas. */
    this._unsubs = [];
  }

  /**
   * Monta el Panel de Inicio y suscribe sus observables.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this.unmount();
    this._container = container;
    this._unsubs = [
      this._vm.instrument.subscribe(() => this._render()),
      this._vm.continueCard.subscribe(() => this._render()),
      this._vm.todayRoutine.subscribe(() => this._render()),
      this._vm.savedSessions.subscribe(() => this._render()),
      this._vm.currentLevelSummary.subscribe(() => this._render()),
      this._vm.dailyStats.subscribe(() => this._render()),
      this._appVm.settings.subscribe(() => this._render()),
      this._appVm.progress.subscribe(() => this._render())
    ];
    this._render();
  }

  /** Libera suscripciones al desmontar. */
  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /** Renderiza todo el Panel de Inicio. */
  _render() {
    if (!this._container) return;
    this._container.innerHTML = '';

    const activeInst = this._vm.instrument.value;
    const stats = this._vm.dailyStats.value;
    const notation = this._appVm.settings.value.chordNotation;

    // 1) Cabecera: instrumento activo + píldora de racha / minutos de hoy
    const instSeg = el(
      'div',
      { className: 'm3-segmented home-inst-seg', role: 'group', 'aria-label': 'Instrumento de estudio' },
      INSTRUMENT_TABS.map((inst) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            title: inst.fullLabel,
            'aria-pressed': String(activeInst === inst.value),
            onClick: () => this._vm.setInstrument(inst.value)
          },
          [inst.label]
        )
      )
    );

    const statusPill = el(
      'button',
      {
        type: 'button',
        className: 'home-status-pill',
        ripple: true,
        title: 'Ver resumen completo de progreso y racha',
        onClick: () => this._vm.navigate('#/progreso')
      },
      [
        el('span', { className: 'home-status-pill__streak' }, [
          icon('flame', 16),
          `${stats.streakDays} día${stats.streakDays === 1 ? '' : 's'}`
        ]),
        el('span', { className: 'home-status-pill__sep', 'aria-hidden': 'true' }, ['·']),
        el('span', { className: 'home-status-pill__today' }, [`Hoy: ${stats.todayMinutes}/${stats.goalMinutes} min`]),
        el('div', { className: 'm3-linear-progress home-status-pill__bar' }, [
          el('div', {
            className: `m3-linear-progress__fill ${stats.goalPct >= 100 ? 'm3-linear-progress__fill--done' : ''}`,
            style: `width:${stats.goalPct}%`
          })
        ])
      ]
    );

    const headerBar = el('section', { className: 'home-top-strip', 'aria-label': 'Instrumento y avance de hoy' }, [
      instSeg,
      statusPill
    ]);

    // 2) Fila principal: Retomar ahora + Sesión guiada de hoy
    const heroGrid = el('div', { className: 'home-hero-grid' }, [
      this._buildContinueHero(notation),
      this._buildTodaySessionCard()
    ]);

    // 3) Tu nivel actual (anillo + 3 prácticas directas + enlace a la Ruta completa)
    const levelCard = this._buildCurrentLevelCard(notation);

    // 4) Accesos rápidos del estudio (Escalas, Acordes, Repertorio, Metrónomo, Editor, Referencias)
    const toolsSection = this._buildQuickToolsSection(stats);

    this._container.appendChild(
      el('div', { className: 'home-layout' }, [headerBar, heroGrid, levelCard, toolsSection])
    );
  }

  /** Tarjeta destacada "Retomar ahora" / "Para empezar". */
  _buildContinueHero(notation) {
    const info = this._vm.continueCard.value;
    if (!info) {
      return el('section', { className: 'continue-card home-continue-card', 'aria-label': 'Empezar a practicar' }, [
        el('span', { className: 'm3-label' }, ['TU ESTUDIO']),
        el('h2', { className: 'm3-headline' }, ['Elegí una práctica para empezar']),
        el('p', { className: 'm3-body-md' }, ['Explorá la ruta de niveles, el repertorio o creá tu propio ejercicio.']),
        el('div', { style: 'margin-top:auto; padding-top:6px' }, [
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--filled',
              ripple: true,
              onClick: () => this._vm.navigate('#/practicas')
            },
            [icon('music', 18), 'Ir a Prácticas']
          )
        ])
      ]);
    }

    const { practice, stats, isFresh } = info;
    const pct = Math.min(100, Math.round(((stats.bestBpm || 0) / (practice.tempo.target || 100)) * 100));

    return el('section', { className: 'continue-card home-continue-card', 'aria-label': 'Retomar práctica' }, [
      el('div', { className: 'player-toolbar' }, [
        el('span', { className: 'm3-label' }, [isFresh ? 'RECOMENDADA PARA EMPEZAR' : 'RETOMAR AHORA']),
        el('span', { className: 'm3-badge' }, [`Nivel ${practice.level} · ${formatKeyName(practice.key, notation)}`])
      ]),
      el('h2', { className: 'm3-headline' }, [practice.title]),
      el('p', { className: 'm3-body-md' }, [
        stats.bestBpm > 0
          ? `Mejor marca: ${stats.bestBpm} / ${practice.tempo.target} BPM (${pct}%)`
          : `Inicio sugerido: ${practice.tempo.start} BPM · Objetivo: ${practice.tempo.target} BPM`
      ]),
      el('div', { className: 'm3-linear-progress home-continue-card__bar' }, [
        el('div', {
          className: `m3-linear-progress__fill ${pct >= 100 ? 'm3-linear-progress__fill--done' : ''}`,
          style: `width:${pct}%`
        })
      ]),
      el('div', { className: 'm3-chip-row', style: 'margin-top:auto; padding-top:4px' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--filled',
            ripple: true,
            onClick: () => this._vm.openPractice(practice.id)
          },
          [icon('play', 18), isFresh ? 'Practicar ahora' : 'Seguir practicando']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--text home-continue-card__secondary',
            ripple: true,
            onClick: () => this._vm.navigate('#/practicas/ruta')
          },
          ['Elegir otra']
        )
      ])
    ]);
  }

  /** Tarjeta "Sesión guiada de hoy" con pasos, botón iniciar y constructor de sesión propia. */
  _buildTodaySessionCard() {
    const routine = this._vm.todayRoutine.value;
    const savedSessions = this._vm.savedSessions.value;

    const rows = routine.items.map((item) =>
      el('div', { className: 'routine-row' }, [
        el('span', { className: 'routine-row__title' }, [
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
                  onClick: () => this._vm.startStudySession(ses)
                },
                [icon('playlist', 16), `${ses.title} (${ses.items.reduce((a, b) => a + b.minutes, 0)} min)`]
              )
            )
          )
        : null;

    return el('section', { className: 'm3-card home-session-card', 'aria-label': 'Sesión de hoy' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', {}, [
          el('h2', { className: 'm3-title-md' }, [routine.title]),
          el('span', { className: 'm3-body-md' }, ['Rutina guiada con temporizador entre bloques'])
        ]),
        el('span', { className: 'm3-badge m3-badge--tertiary' }, [`~${routine.totalMinutes} min`])
      ]),
      el('div', { className: 'routine-list' }, rows),
      el('div', { className: 'm3-chip-row', style: 'margin-top:auto; padding-top:4px' }, [
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

  /** Tarjeta "Tu nivel actual" con anillo SVG y 3 prácticas pendientes de acceso en 1 clic. */
  _buildCurrentLevelCard(notation) {
    const summary = this._vm.currentLevelSummary.value;
    const { level, status, recommended } = summary;
    const prog = this._appVm.progress.value;
    const ratio = status.requiredCount > 0 ? Math.min(1, status.completedCount / status.requiredCount) : 0;

    const ring = this._buildProgressRing(level.number, ratio, status.completed);

    const cards = recommended.map((pr) => {
      const pStats = prog.getPracticeStats(pr.id);
      const pStatus = prog.getPracticeStatus(pr.id, pr.tempo.target);
      const pct = Math.min(100, Math.round(((pStats.bestBpm || 0) / (pr.tempo.target || 100)) * 100));
      const statusIconName = pStatus === 'dominada' ? 'check' : pStatus === 'en-curso' ? 'progress' : 'circle';

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
            el('span', { className: `practice-card__status practice-card__status--${pStatus}` }, [icon(statusIconName, 16)])
          ]),
          el('div', { className: 'm3-body-md' }, [
            `${PRACTICE_TYPE_LABELS[pr.type] || 'Melodía'} · ${formatKeyName(pr.key, notation)} · ${pr.timeSignature}`
          ]),
          el('div', { className: 'practice-card__progress-row' }, [
            el('div', { className: 'm3-linear-progress', style: 'flex:1 1 auto' }, [
              el('div', {
                className: `m3-linear-progress__fill ${pStatus === 'dominada' ? 'm3-linear-progress__fill--done' : ''}`,
                style: `width:${pct}%`
              })
            ]),
            el('span', { style: 'white-space:nowrap; font-variant-numeric:tabular-nums' }, [
              pStats.bestBpm > 0 ? `${pStats.bestBpm}/${pr.tempo.target} BPM` : `Obj. ${pr.tempo.target} BPM`
            ])
          ])
        ]
      );
    });

    return el('section', { className: 'm3-card home-level-card', 'aria-label': 'Tu nivel actual' }, [
      el('div', { className: 'player-toolbar' }, [
        el('div', { style: 'display:flex; align-items:center; gap:12px; min-width:0' }, [
          ring,
          el('div', { style: 'min-width:0' }, [
            el('h2', { className: 'm3-title-md' }, [`Nivel ${level.number}: ${level.name}`]),
            el('span', { className: 'm3-body-md' }, [
              `${level.subtitle} · ${status.completedCount}/${status.requiredCount} prácticas clave al objetivo`
            ])
          ])
        ]),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--compact m3-btn--text',
            ripple: true,
            onClick: () => this._vm.navigate('#/practicas/ruta')
          },
          ['Ver ruta completa', icon('arrowRight', 16)]
        )
      ]),
      el('div', { className: 'home-recommended-grid' }, cards)
    ]);
  }

  /** Grilla de accesos rápidos del estudio + Guía de referencias y símbolos. */
  _buildQuickToolsSection(stats) {
    const tiles = [
      {
        title: 'Biblioteca y Repertorio',
        desc: 'Niveles, standards, obras clásicas y tus prácticas',
        iconName: 'music',
        onClick: () => this._vm.navigate('#/practicas/repertorio')
      },
      {
        title: 'Acordes y Armonía',
        desc: 'Voicings, campo armónico, conducción y oído',
        iconName: 'chords',
        onClick: () => this._vm.navigate('#/acordes')
      },
      {
        title: 'Escalas y Diapasón',
        desc: '22 escalas/modos, digitaciones y drone modal',
        iconName: 'scales',
        onClick: () => this._vm.navigate('#/escalas')
      },
      {
        title: 'Metrónomo',
        desc: 'Tap tempo, subdivisiones y acentos precisos',
        iconName: 'metronome',
        onClick: () => this._vm.navigate('#/metronomo')
      }
    ];

    const grid = el(
      'div',
      { className: 'home-tools-grid' },
      tiles.map((t) =>
        el(
          'button',
          {
            type: 'button',
            className: 'home-tool-tile',
            ripple: true,
            onClick: t.onClick
          },
          [
            el('span', { className: 'home-tool-tile__icon' }, [icon(t.iconName, 22)]),
            el('div', { className: 'home-tool-tile__text' }, [
              el('strong', {}, [t.title]),
              el('span', { className: 'm3-body-md' }, [t.desc])
            ])
          ]
        )
      )
    );

    const utilityRow = el('div', { className: 'm3-chip-row' }, [
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--tonal',
          ripple: true,
          onClick: () => this._vm.navigate('#/editor/nueva')
        },
        [icon('plus', 17), 'Crear práctica']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--outlined',
          ripple: true,
          onClick: () => openNotationGuideModal()
        },
        [icon('help', 17), 'Guía de referencias y símbolos']
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--text',
          ripple: true,
          onClick: () => this._vm.navigate('#/progreso')
        },
        [icon('chart', 17), `Progreso (${stats.masteredInInstrument}/${stats.totalInInstrument} dominadas)`]
      )
    ]);

    return el('section', { className: 'route-stack', 'aria-label': 'Herramientas del estudio' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Herramientas de estudio'])
      ]),
      grid,
      utilityRow
    ]);
  }

  /** Dibuja el anillo SVG de avance del nivel actual. */
  _buildProgressRing(levelNumber, ratio, isCompleted) {
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
    const center = isCompleted ? icon('check', 18) : el('span', { className: 'level-ring__label' }, [String(levelNumber)]);
    return el('div', { className: 'level-ring' }, [svg, center]);
  }

  /** Abre un diálogo compacto para armar una sesión guiada personalizada. */
  _openSessionBuilderDialog() {
    const inst = this._vm.instrument.value;
    const practices = this._vm.instrumentPractices.value;
    const titleField = createFloatingField({
      id: 'home-session-title',
      label: 'Nombre de la sesión',
      value: `Mi sesión de ${INSTRUMENT_LABELS[inst] || 'estudio'}`
    });
    const selected = new Map();
    practices.slice(0, 3).forEach((p) => selected.set(p.id, 5));

    const listEl = el(
      'div',
      { style: 'display:flex; flex-direction:column; gap:6px; max-height:46dvh; overflow-y:auto' },
      practices.map((pr) => {
        const cb = el('input', {
          type: 'checkbox',
          checked: selected.has(pr.id),
          onChange: (e) => {
            if (e.target.checked) selected.set(pr.id, Number(minIn.value) || 5);
            else selected.delete(pr.id);
          }
        });
        const minIn = el('input', {
          type: 'number',
          min: 1,
          max: 30,
          value: selected.get(pr.id) || 5,
          className: 'm3-field__input',
          style: 'width:68px; min-height:38px; padding:4px 8px',
          'aria-label': `Minutos para ${pr.title}`,
          onChange: (e) => {
            if (cb.checked) selected.set(pr.id, Math.max(1, Number(e.target.value) || 5));
          }
        });
        return el('label', { className: 'routine-row', style: 'cursor:pointer' }, [
          el('span', { style: 'display:flex; align-items:center; gap:8px; min-width:0' }, [cb, el('span', {}, [pr.title])]),
          el('span', { className: 'stepper-inline' }, [minIn, el('span', { className: 'm3-label' }, ['min'])])
        ]);
      })
    );

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [
      titleField.wrap,
      el('span', { className: 'm3-body-md' }, ['Elegí las prácticas y los minutos para cada bloque:']),
      listEl
    ]);

    openModalDialog({
      title: 'Armar sesión de estudio',
      body,
      actions: [
        { label: 'Cancelar', variant: 'm3-btn--text', onClick: (close) => close() },
        {
          label: 'Guardar e iniciar',
          variant: 'm3-btn--filled',
          onClick: async (close) => {
            const items = [...selected.entries()].map(([practiceId, minutes]) => ({ practiceId, minutes }));
            if (items.length === 0) {
              this._appVm.showSnackbar('Seleccioná al menos una práctica.');
              return;
            }
            const ses = {
              id: `ses-${Date.now().toString(36)}`,
              title: titleField.control.value.trim() || 'Mi sesión',
              instrument: inst,
              items
            };
            await this._appVm.saveStudySession(ses);
            close();
            this._appVm.startStudySession(ses);
          }
        }
      ]
    });
  }
}
