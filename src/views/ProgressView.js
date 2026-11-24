import { formatDateEsAR, formatStudyDuration } from '../core/i18n.js';
import { el, icon, openConfirmDialog } from './uiHelpers.js';

/**
 * Vista de Progreso (#/progreso).
 * Presenta racha diaria, resumen semanal visual, desbloqueo de niveles (con salto manual),
 * historial por práctica y respaldo JSON del progreso.
 */
export class ProgressView {
  /**
   * Construye la vista inyectando su ProgressViewModel.
   * @param {import('../viewmodels/ProgressViewModel.js').ProgressViewModel} vm ViewModel de progreso.
   */
  constructor(vm) {
    /** ViewModel de progreso. */
    this._vm = vm;
    /** Suscripciones activas. */
    this._unsubs = [];
    /** Contenedor DOM. */
    this._container = null;
  }

  /**
   * Monta la vista de progreso y escucha cambios en las métricas.
   * @param {HTMLElement} container Elemento destino.
   */
  mount(container) {
    this._container = container;
    this._unsubs = [
      this._vm.totals.subscribe(() => this._render()),
      this._vm.levelsOverview.subscribe(() => this._render()),
      this._vm.studiedPractices.subscribe(() => this._render())
    ];
    this._render();
  }

  /**
   * Limpia suscripciones al desmontar.
   */
  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  /**
   * Renderiza todas las secciones de la pantalla de progreso.
   */
  _render() {
    if (!this._container) return;
    this._container.innerHTML = '';

    const totals = this._vm.totals.value;
    const streak = this._vm.streakDays.value;
    const weekly = this._vm.weeklySummary.value;
    const levels = this._vm.levelsOverview.value;
    const studied = this._vm.studiedPractices.value;

    const importInput = el('input', {
      type: 'file',
      accept: '.json,application/json',
      className: 'sr-only',
      onChange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const txt = await f.text();
        await this._vm.importProgress(txt);
        e.target.value = '';
      }
    });

    // Tarjetas de resumen
    const summaryCards = el('div', { className: 'stats-cards-grid' }, [
      this._statCard('Racha actual', `${streak} día${streak === 1 ? '' : 's'}`, 'Días seguidos practicando'),
      this._statCard('Tiempo de estudio', formatStudyDuration(totals.totalStudySeconds), 'Total acumulado'),
      this._statCard('Repeticiones', String(totals.totalRepetitions), `${totals.practicesStudied} prácticas tocadas`),
      this._statCard('Objetivos logrados', String(totals.targetsReached), 'Prácticas al BPM objetivo')
    ]);

    // Gráfico semanal simple (7 días)
    const maxSec = Math.max(60, ...weekly.map((d) => d.studySeconds));
    const weeklyBars = el(
      'div',
      { className: 'weekly-bars', role: 'img', 'aria-label': 'Resumen semanal de minutos de estudio' },
      weekly.map((day) => {
        const pct = Math.max(4, Math.round((day.studySeconds / maxSec) * 100));
        const mins = Math.round(day.studySeconds / 60);
        return el('div', { className: 'weekly-bar-col' }, [
          el('span', { className: 'm3-label' }, [mins > 0 ? `${mins}m` : '']),
          el('div', {
            className: 'weekly-bar-fill',
            style: `height:${day.studySeconds > 0 ? pct : 6}%; opacity:${day.studySeconds > 0 ? 1 : 0.25}`
          }),
          el('span', { className: 'm3-body-md' }, [day.label])
        ]);
      })
    );

    const weeklyCard = el('div', { className: 'm3-card' }, [
      el('div', { className: 'player-toolbar' }, [
        el('h2', { className: 'm3-title-md' }, ['Resumen semanal']),
        el('div', { className: 'm3-chip-row' }, [
          importInput,
          el('button', { type: 'button', className: 'm3-btn m3-btn--outlined', ripple: true, onClick: () => this._vm.exportProgress() }, [icon('download', 18), 'Exportar JSON']),
          el('button', { type: 'button', className: 'm3-btn m3-btn--tonal', ripple: true, onClick: () => importInput.click() }, [icon('upload', 18), 'Importar JSON']),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--text',
              ripple: true,
              onClick: async () => {
                const ok = await openConfirmDialog({
                  title: 'Reiniciar progreso',
                  message: '¿Seguro que querés borrar tus marcas de BPM, racha y tiempo de estudio?',
                  confirmLabel: 'Reiniciar',
                  danger: true
                });
                if (ok) await this._vm.resetProgress();
              }
            },
            ['Reiniciar']
          )
        ])
      ]),
      weeklyBars
    ]);

    // Estado de desbloqueo por nivel
    const levelsCard = el('div', { className: 'm3-card' }, [
      el('h2', { className: 'm3-title-md', style: 'margin-bottom:12px' }, ['Avance y desbloqueo de niveles']),
      el(
        'div',
        { className: 'controls-grid' },
        levels.map((item) =>
          el('div', { className: 'm3-card m3-card--filled' }, [
            el('div', { className: 'player-toolbar' }, [
              el('strong', {}, [`Nivel ${item.level.number}: ${item.level.name}`]),
              item.unlocked
                ? el('span', { className: 'm3-badge m3-badge--success' }, [icon('check', 13), item.skipped ? 'Saltado' : 'Activo'])
                : el('span', { className: 'm3-badge' }, [icon('lock', 13), 'Pendiente'])
            ]),
            el('p', { className: 'm3-body-md', style: 'margin:6px 0' }, [
              item.unlocked
                ? `${item.level.subtitle} · ${item.completedCount}/${item.requiredCount} prácticas clave al BPM objetivo`
                : `${item.level.subtitle} · Te faltan ${item.remainingToUnlock || 2} prácticas clave del nivel ${item.level.number - 1}`
            ]),
            !item.unlocked
              ? el(
                  'button',
                  {
                    type: 'button',
                    className: 'm3-btn m3-btn--tonal',
                    ripple: true,
                    onClick: () => this._vm.skipToLevel(item.level.number)
                  },
                  ['Saltar a este nivel']
                )
              : null
          ])
        )
      )
    ]);

    // Tabla en escritorio + tarjetas apiladas limpias en móvil (cero scroll horizontal de tabla)
    const historyContent =
      studied.length === 0
        ? el('p', { className: 'm3-body-md' }, [
            'Todavía no registraste sesiones. Abrí cualquier práctica y dale a Reproducir o Registrar vuelta.'
          ])
        : el('div', {}, [
            el(
              'div',
              { className: 'progress-mobile-list' },
              studied.map(({ practiceId, practice, stats }) =>
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'practice-card',
                    ripple: true,
                    onClick: () => this._vm.openPractice(practiceId)
                  },
                  [
                    el('div', { className: 'practice-card__top' }, [
                      el('span', { className: 'practice-card__title' }, [practice ? practice.title : practiceId]),
                      stats.completedTarget
                        ? el('span', { className: 'm3-badge m3-badge--success' }, [`${stats.bestBpm} BPM ✓`])
                        : el('span', { className: 'm3-badge' }, [`${stats.bestBpm} BPM`])
                    ]),
                    el('div', { className: 'm3-body-md' }, [
                      `${stats.repetitions} vuelta${stats.repetitions === 1 ? '' : 's'} · ${formatStudyDuration(stats.studySeconds)} · ${formatDateEsAR(stats.lastSessionAt)}`
                    ])
                  ]
                )
              )
            ),
            el('div', { className: 'progress-table-wrap progress-desktop-table' }, [
              el('table', { className: 'progress-table' }, [
                el('thead', {}, [
                  el('tr', {}, [
                    el('th', {}, ['Práctica']),
                    el('th', {}, ['Mejor BPM']),
                    el('th', {}, ['Repeticiones']),
                    el('th', {}, ['Tiempo']),
                    el('th', {}, ['Última sesión'])
                  ])
                ]),
                el(
                  'tbody',
                  {},
                  studied.map(({ practiceId, practice, stats }) =>
                    el('tr', {}, [
                      el('td', {}, [
                        practice
                          ? el(
                              'button',
                              {
                                type: 'button',
                                className: 'm3-btn m3-btn--text',
                                style: 'min-height:36px; padding:0',
                                onClick: () => this._vm.openPractice(practiceId)
                              },
                              [practice.title]
                            )
                          : practiceId
                      ]),
                      el('td', {}, [
                        stats.completedTarget
                          ? el('span', { className: 'm3-badge m3-badge--success' }, [`${stats.bestBpm} BPM ✓`])
                          : `${stats.bestBpm} BPM`
                      ]),
                      el('td', {}, [String(stats.repetitions)]),
                      el('td', {}, [formatStudyDuration(stats.studySeconds)]),
                      el('td', {}, [formatDateEsAR(stats.lastSessionAt)])
                    ])
                  )
                )
              ])
            ])
          ]);

    const historyCard = el('div', { className: 'm3-card' }, [
      el('h2', { className: 'm3-title-md', style: 'margin-bottom:10px' }, ['Registro por práctica']),
      historyContent
    ]);

    this._container.appendChild(
      el('div', { className: 'player-layout' }, [summaryCards, weeklyCard, levelsCard, historyCard])
    );
  }

  /**
   * Construye una tarjeta numérica compacta de estadística.
   * @param {string} label Título de métrica.
   * @param {string} value Valor destacado.
   * @param {string} sub Subtítulo descriptivo.
   * @returns {HTMLElement} Tarjeta DOM.
   */
  _statCard(label, value, sub) {
    return el('div', { className: 'm3-card m3-card--elevated stat-card' }, [
      el('span', { className: 'm3-body-md' }, [label]),
      el('span', { className: 'm3-headline' }, [value]),
      el('span', { className: 'm3-body-md' }, [sub])
    ]);
  }
}
