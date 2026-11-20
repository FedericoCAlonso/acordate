import {
  CATEGORY_LABELS,
  INSTRUMENT_LABELS,
  NOTATION_VIEW_LABELS,
  PRACTICE_TYPE_LABELS,
  SYNTH_INSTRUMENT_LABELS,
  formatChordSymbol,
  formatKeyName
} from '../core/i18n.js';
import { COMPING_PATTERNS } from '../models/ProgressionStep.js';
import { Tuning } from '../models/Tuning.js';
import { createBassFretboardMapElement, createChordDiagramElement } from './ChordDiagramView.js';
import { createSliderGroup, createSwitchRow, el, icon, openSheetModal } from './uiHelpers.js';

/**
 * Pestañas del Bottom Sheet / Side Sheet de ajustes avanzados del reproductor.
 */
const SHEET_TABS = [
  { id: 'mezcla', label: 'Mezcla' },
  { id: 'bucle', label: 'Bucle' },
  { id: 'timbre', label: 'Timbre' },
  { id: 'vista', label: 'Vista' }
];

/**
 * Vista del Reproductor de Práctica v2 ("Modo Atril").
 * - Prioriza la partitura a todo el ancho con el selector Pentagrama / Cifrado / Mixto justo encima.
 * - Mantiene una barra de transporte fija abajo siempre visible mientras se toca.
 * - Relega los ajustes avanzados (Mezcla, Bucle, Timbre, Vista) a un bottom sheet (vertical)
 *   o side sheet a la derecha (apaisado / escritorio).
 * - Incluye guía de estudio plegable con lista de verificación de objetivos y modo pantalla completa.
 */
export class PracticePlayerView {
  /**
   * Construye la vista inyectando su ViewModel, AppViewModel y AbcService.
   * @param {import('../viewmodels/PracticePlayerViewModel.js').PracticePlayerViewModel} vm ViewModel del reproductor.
   * @param {import('../viewmodels/AppViewModel.js').AppViewModel} appVm ViewModel raíz.
   * @param {import('../services/AbcService.js').AbcService} abcService Servicio abcjs.
   */
  constructor(vm, appVm, abcService) {
    /** ViewModel del reproductor. */
    this._vm = vm;
    /** ViewModel global. */
    this._appVm = appVm;
    /** Servicio abcjs para renderizado adaptable. */
    this._abc = abcService;

    /** Contenedor DOM principal. */
    this._container = null;
    /** Suscripciones activas. */
    this._unsubs = [];
    /** ResizeObserver con debounce para redibujar sin cortar la reproducción. */
    this._resizeObserver = null;
    /** Temporizador debounce del ResizeObserver. */
    this._resizeTimer = null;
    /** Último ancho renderizado en píxeles. */
    this._lastScoreWidth = 0;
    /** Nodos SVG actualmente resaltados. */
    this._highlightedSvgNodes = [];
    /** Referencia al sheet modal abierto (si existe). */
    this._activeSheet = null;

    /** Listener de teclado: barra espaciadora alterna reproducir/pausar. */
    this._onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      this._vm.togglePlay();
    };

    /** Listener de orientación para redibujar la partitura al girar el dispositivo. */
    this._onOrientationChange = () => {
      this._scheduleScoreRedraw();
    };
  }

  /**
   * Monta el reproductor en el contenedor DOM.
   * @param {HTMLElement} container Nodo contenedor.
   */
  mount(container) {
    this._container = container;
    this._buildSkeleton();
    this._bindObservables();
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('orientationchange', this._onOrientationChange);

    if (this._vm.practice.value) {
      this._renderHeaderAndGuide();
      this._renderNotationSurface();
      this._syncTransportDom();
    }
  }

  /**
   * Carga una práctica específica en el ViewModel y actualiza la pantalla.
   * @param {import('../models/Practice.js').Practice} practice Práctica a practicar.
   */
  showPractice(practice) {
    if (!practice) return;
    if (this._vm.practice.value?.id !== practice.id) {
      this._vm.loadPractice(practice);
    }
    if (this._container) {
      this._renderHeaderAndGuide();
      this._renderNotationSurface();
      this._syncTransportDom();
    }
  }

  /**
   * Limpia observadores, sheet, teclado, audio y suscripciones al desmontar.
   */
  unmount() {
    this._closeSheet();
    this._vm.stop();
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._highlightedSvgNodes = [];
    this._container = null;
  }

  /**
   * Construye el esqueleto compacto del Modo Atril: fila de datos, selector de vista,
   * partitura a todo ancho, guía plegable y barra de transporte fija abajo.
   */
  _buildSkeleton() {
    this._container.innerHTML = '';

    this._metaStrip = el('div', { className: 'meta-strip', 'aria-label': 'Datos de la práctica' });
    this._viewBar = el('div', { className: 'player-view-bar' });
    this._countInEl = el('div', { className: 'count-in-overlay', style: 'display:none', 'aria-live': 'assertive' });
    this._scoreEl = el('div', { className: 'score-surface', 'aria-label': 'Partitura en pentagrama' });
    this._harmonyEl = el('div', { className: 'score-surface', style: 'display:none', 'aria-label': 'Diagramas de acordes de la progresión' });
    this._chartEl = el('div', { className: 'score-surface', style: 'display:none', 'aria-label': 'Grilla de cifrado de acordes' });
    this._guideHost = el('div');
    this._transportDock = el('div', { className: 'transport-dock', role: 'region', 'aria-label': 'Controles de reproducción' });

    const scoreWrap = el('div', { className: 'score-wrap' }, [
      this._countInEl,
      this._scoreEl,
      this._harmonyEl,
      this._chartEl
    ]);

    const layout = el('div', { className: 'player-layout' }, [
      this._metaStrip,
      this._viewBar,
      scoreWrap,
      this._guideHost,
      this._transportDock
    ]);

    this._container.appendChild(layout);

    // ResizeObserver con debounce para reflujo fluido sin perder posición de lectura ni reproducción
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w = Math.round(entries[0]?.contentRect?.width || 0);
        if (w > 120 && Math.abs(w - this._lastScoreWidth) > 20) {
          this._scheduleScoreRedraw();
        }
      });
      this._resizeObserver.observe(scoreWrap);
    }

    this._buildTransportDock();
  }

  /**
   * Agenda un redibujo con debounce (120 ms) preservando el scroll actual.
   */
  _scheduleScoreRedraw() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      if (!this._container) return;
      const scrollY = window.scrollY;
      this._renderNotationSurface();
      if (Math.abs(window.scrollY - scrollY) > 4) {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
      }
    }, 120);
  }

  /**
   * Vincula los observables del PracticePlayerViewModel a las actualizaciones del DOM.
   */
  _bindObservables() {
    this._unsubs = [
      this._vm.practice.subscribe(() => {
        this._renderHeaderAndGuide();
        this._syncTransportDom();
      }),
      this._vm.renderableAbc.subscribe(() => this._renderNotationSurface()),
      this._vm.viewMode.subscribe(() => {
        this._renderViewBar();
        this._renderNotationSurface();
      }),
      this._vm.zoom.subscribe(() => this._renderNotationSurface()),
      this._vm.transposedKey.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.isPlaying.subscribe(() => this._syncTransportDom()),
      this._vm.isPaused.subscribe(() => this._syncTransportDom()),
      this._vm.bpm.subscribe(() => this._syncTransportDom()),
      this._vm.loopEnabled.subscribe(() => this._syncTransportDom()),
      this._vm.metronomeEnabled.subscribe(() => this._syncTransportDom()),
      this._vm.countInStatus.subscribe((st) => this._renderCountIn(st)),
      this._vm.activeNoteEvent.subscribe((ev) => this._highlightActiveNote(ev)),
      this._vm.activeMeasure.subscribe((m) => this._highlightActiveChartBar(m)),
      this._vm.activeChordStepIndex.subscribe((idx) => this._highlightActiveHarmonyStep(idx)),
      this._vm.harmonySteps.subscribe(() => this._renderNotationSurface()),
      this._vm.compingPattern.subscribe(() => this._renderViewBar()),
      this._vm.practiceStats.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.sessionRepetitions.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.isAtrilFullscreen.subscribe((full) => {
        this._metaStrip.style.display = full ? 'none' : 'flex';
        this._guideHost.style.display = full ? 'none' : 'block';
        this._renderViewBar();
        this._scheduleScoreRedraw();
      }),
      this._appVm.progress.subscribe(() => this._renderHeaderAndGuide()),
      this._appVm.settings.subscribe(() => {
        this._renderHeaderAndGuide();
        this._renderNotationSurface();
      })
    ];
  }

  /**
   * Renderiza la fila compacta de etiquetas desplazable horizontalmente y la guía de estudio plegable.
   */
  _renderHeaderAndGuide() {
    const pr = this._vm.practice.value;
    if (!pr || !this._metaStrip) return;

    const notation = this._appVm.settings.value.chordNotation;
    const stats = this._vm.practiceStats.value;
    const keyLabel = formatKeyName(this._vm.transposedKey.value, notation);
    const semi = this._vm.transposeSemitones.value;

    this._metaStrip.innerHTML = '';
    const badges = [
      el('span', { className: 'm3-badge m3-badge--primary' }, [`Nivel ${pr.level}`]),
      el('span', { className: 'm3-badge m3-badge--tertiary' }, [PRACTICE_TYPE_LABELS[pr.type] || 'Melodía']),
      el('span', { className: 'm3-badge' }, [CATEGORY_LABELS[pr.category] || pr.category]),
      el('span', { className: 'm3-badge' }, [`${keyLabel}${semi ? ` (${semi > 0 ? '+' : ''}${semi})` : ''} · ${pr.timeSignature}`]),
      el('span', { className: 'm3-badge' }, [`Obj. ${pr.tempo.target} BPM`]),
      stats?.bestBpm > 0
        ? el('span', { className: 'm3-badge m3-badge--success' }, [`Mejor ${stats.bestBpm} BPM`])
        : null,
      this._vm.sessionRepetitions.value > 0
        ? el('span', { className: 'm3-badge m3-badge--tertiary' }, [`${this._vm.sessionRepetitions.value} vuelta${this._vm.sessionRepetitions.value === 1 ? '' : 's'}`])
        : null
    ];
    for (const b of badges) {
      if (b) this._metaStrip.appendChild(b);
    }

    this._renderViewBar();

    // Guía de estudio y objetivos plegable con lista de verificación tildable
    const prog = this._appVm.progress.value;
    const wasOpen = this._guideHost.querySelector('details')?.open || false;
    const checkedCount = pr.goals.filter((_, idx) => prog.isGoalChecked(pr.id, idx)).length;

    const details = el('details', { className: 'm3-collapsible', open: wasOpen }, [
      el('summary', {}, [
        el('span', {}, [`Guía de estudio y objetivos (${checkedCount}/${pr.goals.length})`]),
        icon('chevronDown', 20)
      ]),
      el('div', { className: 'm3-collapsible__content' }, [
        pr.notes ? el('p', { className: 'm3-body-md' }, [pr.notes]) : null,
        pr.goals.length > 0
          ? el(
              'div',
              { className: 'goal-check-list' },
              pr.goals.map((goal, idx) => {
                const isDone = prog.isGoalChecked(pr.id, idx);
                return el('label', { className: `goal-check-item ${isDone ? 'goal-check-item--done' : ''}` }, [
                  el('input', {
                    type: 'checkbox',
                    checked: isDone,
                    onChange: () => this._vm.toggleGoal(idx)
                  }),
                  el('span', {}, [goal])
                ]);
              })
            )
          : null,
        el('div', { className: 'm3-body-md' }, [
          `Instrumentos: ${pr.instruments.map((i) => INSTRUMENT_LABELS[i] || i).join(', ')} · Inicio sugerido ${pr.tempo.start} BPM`
        ])
      ])
    ]);

    this._guideHost.innerHTML = '';
    this._guideHost.appendChild(details);
  }

  /**
   * Renderiza el selector segmentado de vista (Pentagrama / Cifrado / Mixto) y el botón Modo Atril.
   */
  _renderViewBar() {
    if (!this._viewBar) return;
    const pr = this._vm.practice.value;
    const mode = this._vm.viewMode.value;
    const isFull = this._vm.isAtrilFullscreen.value;
    const isHarmony = pr?.type === 'harmony';
    const hasHarmonySteps = (this._vm.harmonySteps.value || []).length > 0;

    this._viewBar.innerHTML = '';
    const modeChoices = isHarmony
      ? [
          { id: 'diagramas', label: 'Diagramas' },
          { id: 'cifrado', label: 'Cifrado' }
        ]
      : hasHarmonySteps
        ? [
            { id: 'pentagrama', label: 'Pentagrama' },
            { id: 'diagramas', label: 'Diagramas' },
            { id: 'mixto', label: 'Mixto' }
          ]
        : [
            { id: 'pentagrama', label: NOTATION_VIEW_LABELS.pentagrama },
            { id: 'cifrado', label: NOTATION_VIEW_LABELS.cifrado },
            { id: 'mixto', label: NOTATION_VIEW_LABELS.mixto }
          ];

    const seg = el(
      'div',
      { className: 'm3-segmented', role: 'group', 'aria-label': 'Vista de notación' },
      modeChoices.map((m) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-segmented__btn',
            ripple: true,
            'aria-pressed': String(mode === m.id),
            onClick: () => this._vm.setViewMode(m.id)
          },
          [m.label]
        )
      )
    );

    const compingSelect =
      isHarmony || hasHarmonySteps
        ? el(
            'select',
            {
              className: 'm3-field__select',
              style: 'padding:6px 10px; min-height:44px; width:auto; max-width:200px; font-size:0.84rem',
              'aria-label': 'Patrón de ritmo',
              onChange: (e) => this._vm.setCompingPattern(e.target.value)
            },
            Object.values(COMPING_PATTERNS).map((pat) =>
              el('option', { value: pat.id, selected: pat.id === this._vm.compingPattern.value }, [pat.label])
            )
          )
        : null;
    if (compingSelect) compingSelect.value = this._vm.compingPattern.value;

    const quickRight = el('div', { className: 'stepper-inline' }, [
      compingSelect,
      el(
        'button',
        {
          type: 'button',
          className: `m3-icon-btn ${isFull ? 'm3-icon-btn--active' : 'm3-icon-btn--tonal'}`,
          ripple: true,
          'aria-label': isFull ? 'Salir de modo atril' : 'Modo atril pantalla completa',
          title: isFull ? 'Salir de pantalla completa' : 'Modo atril (pantalla completa)',
          onClick: () => this._vm.toggleAtrilFullscreen()
        },
        [icon(isFull ? 'fullscreenExit' : 'fullscreen', 20)]
      )
    ]);

    this._viewBar.appendChild(seg);
    this._viewBar.appendChild(quickRight);
  }

  /**
   * Renderiza la partitura adaptable con abcjs, la fila de diagramas de armonía o la grilla de cifrado.
   */
  _renderNotationSurface() {
    if (!this._scoreEl || !this._chartEl || !this._harmonyEl) return;
    const pr = this._vm.practice.value;
    if (!pr) return;

    const mode = this._vm.viewMode.value;
    const isHarmonyOnly = pr.type === 'harmony';
    const hasSteps = this._vm.harmonySteps.value.length > 0;

    const showStaff = !isHarmonyOnly && mode !== 'cifrado' && mode !== 'diagramas';
    const showDiagrams = (isHarmonyOnly && mode !== 'cifrado') || mode === 'diagramas' || (hasSteps && mode === 'mixto');
    const showChart = mode === 'cifrado';

    this._scoreEl.style.display = showStaff ? 'block' : 'none';
    this._harmonyEl.style.display = showDiagrams ? 'block' : 'none';
    this._chartEl.style.display = showChart ? 'block' : 'none';

    if (showStaff) {
      const width = this._scoreEl.clientWidth || this._container?.clientWidth || 340;
      this._lastScoreWidth = width;
      const { visualObj } = this._abc.renderScore(this._scoreEl, this._vm.renderableAbc.value, {
        width,
        zoom: this._vm.zoom.value
      });
      const timeline = this._abc.extractTimeline(visualObj, this._vm.transposedAbc.value, {
        instrument: pr.instruments[0] || 'guitarra',
        isBass: pr.instruments.includes('bajo'),
        timeSignature: pr.timeSignature
      });
      this._vm.registerVisualTimeline(timeline);
    }

    if (showDiagrams) {
      this._renderHarmonyDiagrams();
    }

    if (showChart) {
      this._renderChordChart();
    }
  }

  /**
   * Renderiza la fila desplazable de diagramas de acordes de una práctica de armonía o mixta,
   * y en bajo incluye además el mapa de notas del acorde activo sobre el diapasón.
   */
  _renderHarmonyDiagrams() {
    const pr = this._vm.practice.value;
    const steps = this._vm.harmonySteps.value;
    const notation = this._appVm.settings.value.chordNotation;
    const isBass = pr?.instruments?.includes('bajo');
    const tuning = Tuning.defaultForInstrument(isBass ? 'bass' : 'guitar');
    const activeIdx = this._vm.activeChordStepIndex.value;

    this._harmonyEl.innerHTML = '';
    if (steps.length === 0) {
      this._harmonyEl.appendChild(el('p', { className: 'm3-body-md' }, ['Esta práctica no tiene pasos de progresión armónica.']));
      return;
    }

    // En bajo, muestra el mapa del diapasón para el acorde activo (o el primero)
    if (isBass) {
      const focusStep = steps[activeIdx >= 0 ? activeIdx : 0] || steps[0];
      this._harmonyEl.appendChild(
        createBassFretboardMapElement(focusStep.chord, {
          tuning,
          notation,
          labelMode: 'functions'
        })
      );
    }

    const strip = el(
      'div',
      { className: 'harmony-strip', role: 'list', 'aria-label': 'Progresión de acordes con diagramas' },
      steps.map((step, idx) =>
        el(
          'div',
          {
            className: `harmony-step-card ${idx === activeIdx ? 'harmony-step-card--active' : ''}`,
            dataset: { stepIndex: idx }
          },
          [
            el('div', { className: 'player-toolbar', style: 'margin-bottom:4px' }, [
              el('strong', {}, [formatChordSymbol(step.chord, notation)]),
              el('span', { className: 'm3-label' }, [`${step.bars} c.`])
            ]),
            step.voicing
              ? createChordDiagramElement(step.voicing, {
                  tuning,
                  notation,
                  size: 'sm',
                  showTitle: false,
                  labelMode: this._vm.showFingerings.value ? 'fingers' : 'functions',
                  onPlay: () => this._vm.playStepVoicing(step)
                })
              : el('button', {
                  type: 'button',
                  className: 'm3-btn m3-btn--compact m3-btn--tonal',
                  onClick: () => this._vm.playStepVoicing(step)
                }, [formatChordSymbol(step.chord, notation)])
          ]
        )
      )
    );

    this._harmonyEl.appendChild(strip);
  }

  /**
   * Resalta el diagrama del acorde que suena actualmente en la fila de armonía.
   * @param {number} stepIndex Índice del paso activo (-1 si detenido).
   */
  _highlightActiveHarmonyStep(stepIndex) {
    if (!this._harmonyEl) return;
    const pr = this._vm.practice.value;
    if (pr?.instruments?.includes('bajo') && stepIndex >= 0) {
      // En bajo actualiza el mapa del diapasón para mostrar las notas del acorde que suena
      this._renderHarmonyDiagrams();
    }
    const cards = this._harmonyEl.querySelectorAll('.harmony-step-card');
    cards.forEach((card) => {
      const match = Number(card.dataset.stepIndex) === stepIndex;
      card.classList.toggle('harmony-step-card--active', match);
      if (match) {
        card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
  }

  /**
   * Renderiza la grilla de compases de acordes en modo Cifrado.
   */
  _renderChordChart() {
    const pr = this._vm.practice.value;
    const ex = this._vm.exercise.value;
    const notation = this._appVm.settings.value.chordNotation;
    const activeM = this._vm.activeMeasure.value;
    const steps = this._vm.harmonySteps.value;
    this._chartEl.innerHTML = '';

    // En prácticas de armonía puras construye la grilla directamente desde harmonySteps
    if (pr?.type === 'harmony' && steps.length > 0) {
      let barNum = 1;
      const cells = [];
      steps.forEach((step, idx) => {
        const count = Math.max(1, Math.round(step.bars));
        for (let b = 0; b < count; b++) {
          const curBar = barNum++;
          cells.push(
            el(
              'div',
              {
                className: `chord-bar-cell ${curBar === activeM || idx === this._vm.activeChordStepIndex.value ? 'chord-bar-cell--active' : ''}`,
                dataset: { measure: curBar }
              },
              [
                el('span', { className: 'chord-bar-cell__num' }, [String(curBar)]),
                el('div', { className: 'chord-bar-cell__chords' }, [el('span', {}, [formatChordSymbol(step.chord, notation)])])
              ]
            )
          );
        }
      });
      this._chartEl.appendChild(el('div', { className: 'chord-chart-grid' }, cells));
      return;
    }

    if (!ex || ex.measures.length === 0) {
      this._chartEl.appendChild(el('p', { className: 'm3-body-md' }, ['Esta práctica no tiene compases detectables.']));
      return;
    }

    if (!ex.hasChords) {
      this._chartEl.appendChild(
        el('p', { className: 'm3-body-md', style: 'margin-bottom:10px' }, [
          'Práctica de lectura pura sin cifrado explícito.'
        ])
      );
    }

    const grid = el(
      'div',
      { className: 'chord-chart-grid' },
      ex.measures.map((m) => {
        const chords = m.chords.length > 0 ? m.chords.map((c) => formatChordSymbol(c, notation)) : ['%'];
        return el(
          'div',
          {
            className: `chord-bar-cell ${m.index === activeM ? 'chord-bar-cell--active' : ''}`,
            dataset: { measure: m.index }
          },
          [
            el('span', { className: 'chord-bar-cell__num' }, [String(m.index)]),
            el('div', { className: 'chord-bar-cell__chords' }, chords.map((c) => el('span', {}, [c])))
          ]
        );
      })
    );
    this._chartEl.appendChild(grid);
  }

  /**
   * Construye la barra de transporte fija inferior (siempre accesible sin desplazarse).
   */
  _buildTransportDock() {
    this._playFab = el(
      'button',
      {
        type: 'button',
        className: 'm3-fab m3-fab--primary m3-fab--round',
        ripple: true,
        'aria-label': 'Reproducir práctica',
        onClick: () => this._vm.togglePlay()
      },
      [icon('play', 24)]
    );

    const stopBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-icon-btn m3-icon-btn--tonal',
        ripple: true,
        'aria-label': 'Detener reproducción',
        onClick: () => this._vm.stop()
      },
      [icon('stop', 20)]
    );

    this._loopBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-icon-btn',
        ripple: true,
        'aria-label': 'Activar o desactivar bucle',
        title: 'Bucle',
        onClick: () => this._vm.setLoop({ enabled: !this._vm.loopEnabled.value })
      },
      [icon('loop', 20)]
    );

    this._metroBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-icon-btn',
        ripple: true,
        'aria-label': 'Activar o desactivar metrónomo',
        title: 'Metrónomo',
        onClick: () => this._vm.setMetronomeEnabled(!this._vm.metronomeEnabled.value)
      },
      [icon('metronome', 20)]
    );

    const repBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--tonal',
        ripple: true,
        'aria-label': 'Registrar vuelta completada',
        onClick: () => this._vm.logManualRepetition()
      },
      [icon('check', 16), 'Vuelta']
    );

    const tuneBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-icon-btn m3-icon-btn--tonal',
        ripple: true,
        'aria-label': 'Abrir mezcla y ajustes avanzados',
        title: 'Mezcla, bucle, transposición y vista',
        onClick: () => this._openSettingsSheet()
      },
      [icon('tune', 20)]
    );

    this._bpmReadout = el('span', { className: 'bpm-readout' }, [`${this._vm.bpm.value}`]);
    this._bpmSlider = el('input', {
      type: 'range',
      className: 'm3-slider m3-slider--slim',
      min: 40,
      max: 240,
      step: 1,
      'aria-label': 'Tempo en BPM',
      onInput: (e) => this._vm.setTempo(Number(e.target.value))
    });
    this._bpmSlider.value = String(this._vm.bpm.value);

    const targetBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--text',
        ripple: true,
        title: 'Ir al BPM objetivo',
        onClick: () => {
          const target = this._vm.practice.value?.tempo?.target;
          if (target) this._vm.setTempo(target);
        }
      },
      [icon('target', 16), 'Obj.']
    );

    const mainRow = el('div', { className: 'transport-dock__row' }, [
      el('div', { className: 'transport-dock__group' }, [this._playFab, stopBtn, this._loopBtn, this._metroBtn]),
      el('div', { className: 'transport-dock__group' }, [repBtn, tuneBtn])
    ]);

    const bpmRow = el('div', { className: 'transport-dock__bpm-row' }, [
      el('button', { type: 'button', className: 'm3-icon-btn', ripple: true, 'aria-label': 'Bajar 5 BPM', onClick: () => this._vm.stepTempo(-5) }, ['−']),
      this._bpmReadout,
      el('button', { type: 'button', className: 'm3-icon-btn', ripple: true, 'aria-label': 'Subir 5 BPM', onClick: () => this._vm.stepTempo(5) }, ['+']),
      this._bpmSlider,
      targetBtn
    ]);

    this._transportDock.innerHTML = '';
    this._transportDock.appendChild(mainRow);
    this._transportDock.appendChild(bpmRow);
  }

  /**
   * Sincroniza los estados visuales de la barra de transporte fija.
   */
  _syncTransportDom() {
    if (!this._playFab) return;
    const playing = this._vm.isPlaying.value;
    this._playFab.innerHTML = '';
    this._playFab.appendChild(icon(playing ? 'pause' : 'play', 24));
    this._playFab.setAttribute('aria-label', playing ? 'Pausar práctica' : 'Reproducir práctica');

    this._loopBtn.classList.toggle('m3-icon-btn--active', this._vm.loopEnabled.value);
    this._loopBtn.setAttribute('aria-pressed', String(this._vm.loopEnabled.value));

    this._metroBtn.classList.toggle('m3-icon-btn--active', this._vm.metronomeEnabled.value);
    this._metroBtn.setAttribute('aria-pressed', String(this._vm.metronomeEnabled.value));

    this._bpmReadout.textContent = `${this._vm.bpm.value} BPM`;
    this._bpmSlider.value = String(this._vm.bpm.value);
  }

  /**
   * Abre el Bottom Sheet (vertical) / Side Sheet (apaisado y escritorio) con 4 pestañas:
   * Mezcla, Bucle, Timbre y Vista.
   */
  _openSettingsSheet() {
    this._closeSheet();

    const tabsBar = el('div', { className: 'm3-sheet__tabs', role: 'tablist' });
    const panelHost = el('div', { style: 'display:flex; flex-direction:column; gap:14px' });

    const renderTab = (tabId) => {
      this._vm.activeSheetTab.set(tabId);
      tabsBar.innerHTML = '';
      for (const tab of SHEET_TABS) {
        tabsBar.appendChild(
          el(
            'button',
            {
              type: 'button',
              role: 'tab',
              className: 'm3-sheet__tab',
              'aria-selected': String(tab.id === tabId),
              onClick: () => renderTab(tab.id)
            },
            [tab.label]
          )
        );
      }

      panelHost.innerHTML = '';
      if (tabId === 'mezcla') {
        const chordsToggle = createSwitchRow({
          id: 'sheet-chords-toggle',
          label: 'Acompañamiento de acordes',
          checked: this._vm.chordsEnabled.value,
          onChange: (v) => this._vm.setChordsEnabled(v)
        });
        const metroToggle = createSwitchRow({
          id: 'sheet-metro-toggle',
          label: 'Clic del metrónomo',
          checked: this._vm.metronomeEnabled.value,
          onChange: (v) => this._vm.setMetronomeEnabled(v)
        });
        const melodySlider = createSliderGroup({
          id: 'sheet-vol-melody',
          label: 'Melodía / Voz principal',
          min: 0, max: 100,
          value: Math.round(this._vm.melodyVolume.value * 100),
          formatValue: (v) => `${v}%`,
          onInput: (v) => this._vm.setVolumes({ melody: v / 100 })
        });
        const chordsSlider = createSliderGroup({
          id: 'sheet-vol-chords',
          label: 'Acordes',
          min: 0, max: 100,
          value: Math.round(this._vm.chordsVolume.value * 100),
          formatValue: (v) => `${v}%`,
          onInput: (v) => this._vm.setVolumes({ chords: v / 100 })
        });
        const bassSlider = createSliderGroup({
          id: 'sheet-vol-bass',
          label: 'Bajo',
          min: 0, max: 100,
          value: Math.round(this._vm.bassVolume.value * 100),
          formatValue: (v) => `${v}%`,
          onInput: (v) => this._vm.setVolumes({ bass: v / 100 })
        });
        const metroSlider = createSliderGroup({
          id: 'sheet-vol-metro',
          label: 'Volumen del clic',
          min: 0, max: 100,
          value: Math.round(this._vm.metronomeVolume.value * 100),
          formatValue: (v) => `${v}%`,
          onInput: (v) => this._vm.setVolumes({ metronome: v / 100 })
        });
        const resetBtn = el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--outlined',
            ripple: true,
            onClick: async () => {
              await this._vm.resetPracticeMix();
              renderTab('mezcla');
            }
          },
          ['Restablecer mezcla (100 % voz principal)']
        );
        panelHost.append(
          melodySlider.wrap,
          chordsToggle.row,
          chordsSlider.wrap,
          bassSlider.wrap,
          metroToggle.row,
          metroSlider.wrap,
          resetBtn
        );
      } else if (tabId === 'bucle') {
        const maxM = Math.max(1, this._vm.measureCount.value);
        const loopToggle = createSwitchRow({
          id: 'sheet-loop-toggle',
          label: 'Bucle por compases',
          checked: this._vm.loopEnabled.value,
          onChange: (v) => this._vm.setLoop({ enabled: v })
        });
        const startIn = el('input', {
          type: 'number', min: 1, max: maxM, value: this._vm.loopStartMeasure.value,
          className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:76px',
          'aria-label': 'Compás inicial',
          onChange: (e) => this._vm.setLoop({ start: Number(e.target.value) })
        });
        const endIn = el('input', {
          type: 'number', min: 1, max: maxM, value: this._vm.loopEndMeasure.value,
          className: 'm3-field__input', style: 'padding:8px 10px; min-height:44px; width:76px',
          'aria-label': 'Compás final',
          onChange: (e) => this._vm.setLoop({ end: Number(e.target.value) })
        });
        const countInSeg = el(
          'div',
          { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Conteo previo' },
          [0, 1, 2].map((n) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                ripple: true,
                'aria-pressed': String(this._vm.countInMeasures.value === n),
                onClick: () => {
                  this._vm.setCountIn(n);
                  renderTab('bucle');
                }
              },
              [n === 0 ? 'Sin conteo' : `${n} compás${n === 1 ? '' : 'es'}`]
            )
          )
        );
        const trainerToggle = createSwitchRow({
          id: 'sheet-trainer-toggle',
          label: 'Entrenador de velocidad',
          description: 'Sube el BPM cada 2 vueltas del bucle hasta el objetivo',
          checked: this._vm.speedTrainerEnabled.value,
          onChange: (v) => this._vm.setSpeedTrainer({ enabled: v })
        });

        panelHost.append(
          loopToggle.row,
          el('div', { className: 'stepper-inline' }, [
            el('span', { className: 'm3-body-md' }, ['Del compás']),
            startIn,
            el('span', { className: 'm3-body-md' }, ['al']),
            endIn,
            el('span', { className: 'm3-body-md' }, [`(de ${maxM})`])
          ]),
          el('div', {}, [
            el('div', { className: 'm3-body-md', style: 'margin-bottom:6px' }, ['Conteo previo']),
            countInSeg
          ]),
          trainerToggle.row
        );
      } else if (tabId === 'timbre') {
        const notation = this._appVm.settings.value.chordNotation;
        const semi = this._vm.transposeSemitones.value;
        const keyLabel = formatKeyName(this._vm.transposedKey.value, notation);
        const transLabel = el('strong', {}, [semi === 0 ? `${keyLabel} (Original)` : `${keyLabel} (${semi > 0 ? '+' : ''}${semi} st)`]);

        const synthSelect = el(
          'select',
          {
            className: 'm3-field__select',
            style: 'padding:10px 12px; min-height:48px',
            'aria-label': 'Instrumento de síntesis',
            onChange: (e) => this._vm.setSynthInstrument(e.target.value)
          },
          Object.entries(SYNTH_INSTRUMENT_LABELS).map(([val, lbl]) => el('option', { value: val }, [lbl]))
        );
        synthSelect.value = this._vm.synthInstrument.value;

        const currentReg = this._appVm.settings.value.listeningRegister || 'real';
        const regSeg = el(
          'div',
          { className: 'm3-segmented m3-segmented--full', role: 'group', 'aria-label': 'Registro de escucha' },
          [
            { value: 'real', label: 'Real' },
            { value: '+1oct', label: '+1 octava (celular)' }
          ].map((opt) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                ripple: true,
                'aria-pressed': String(currentReg === opt.value),
                onClick: () => {
                  this._vm.setListeningRegister(opt.value);
                  renderTab('timbre');
                }
              },
              [opt.label]
            )
          )
        );

        panelHost.append(
          el('div', {}, [
            el('div', { className: 'm3-body-md', style: 'margin-bottom:8px' }, ['Transposición (melodía + cifrado)']),
            el('div', { className: 'stepper-inline' }, [
              el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, onClick: () => { this._vm.transpose(this._vm.transposeSemitones.value - 1); renderTab('timbre'); } }, ['−½']),
              transLabel,
              el('button', { type: 'button', className: 'm3-icon-btn m3-icon-btn--tonal', ripple: true, onClick: () => { this._vm.transpose(this._vm.transposeSemitones.value + 1); renderTab('timbre'); } }, ['+½']),
              el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--text', ripple: true, onClick: () => { this._vm.resetTranspose(); renderTab('timbre'); } }, ['Original'])
            ])
          ]),
          el('div', {}, [
            el('label', { className: 'm3-body-md', style: 'display:block; margin-bottom:6px' }, ['Timbre del sintetizador (offline)']),
            synthSelect
          ]),
          el('div', {}, [
            el('div', { className: 'm3-body-md', style: 'margin-bottom:6px' }, ['Registro de escucha']),
            regSeg
          ])
        );
      } else {
        const pr = this._vm.practice.value;
        const isBass = pr?.instruments?.includes('bajo');
        const fingSwitch = createSwitchRow({
          id: 'sheet-fing-toggle',
          label: 'Digitaciones anotadas',
          description: 'Dedos 1-4, cuerdas y posiciones sobre la nota (nunca tablatura)',
          checked: this._vm.showFingerings.value,
          onChange: () => this._vm.toggleFingerings()
        });
        const bassFnSwitch = isBass
          ? createSwitchRow({
              id: 'sheet-bassfn-toggle',
              label: 'Funciones armónicas (R, 3, 5, 7)',
              description: 'Análisis de walking bass debajo del pentagrama',
              checked: this._vm.showBassFunctions.value,
              onChange: () => this._vm.toggleBassFunctions()
            })
          : null;
        const zoomSlider = createSliderGroup({
          id: 'sheet-zoom-slider',
          label: 'Tamaño de partitura (Zoom)',
          min: 75, max: 160, step: 5,
          value: Math.round(this._vm.zoom.value * 100),
          formatValue: (v) => `${v}%`,
          onInput: (v) => this._vm.setZoom(v / 100)
        });
        panelHost.append(fingSwitch.row, bassFnSwitch ? bassFnSwitch.row : null, zoomSlider.wrap);
      }
    };

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:12px' }, [tabsBar, panelHost]);
    renderTab(this._vm.activeSheetTab.value || 'mezcla');

    this._activeSheet = openSheetModal({
      title: 'Ajustes de práctica',
      body,
      sideOnWide: true,
      onClose: () => {
        this._activeSheet = null;
        this._vm.isSheetOpen.set(false);
      }
    });
    this._vm.isSheetOpen.set(true);
  }

  /**
   * Cierra el sheet modal si está abierto.
   */
  _closeSheet() {
    if (this._activeSheet) {
      this._activeSheet.close();
      this._activeSheet = null;
    }
  }

  /**
   * Muestra el conteo previo grande y visible (4 - 3 - 2 - 1) antes de comenzar.
   * @param {{ beat: number, countDown: number, totalBeats: number }|null} status Estado del conteo.
   */
  _renderCountIn(status) {
    if (!this._countInEl) return;
    if (!status) {
      this._countInEl.style.display = 'none';
      return;
    }
    this._countInEl.style.display = 'flex';
    this._countInEl.innerHTML = '';
    this._countInEl.appendChild(el('span', {}, ['Preparate…']));
    this._countInEl.appendChild(el('span', { className: 'count-in-overlay__num' }, [String(status.countDown ?? status.beat)]));
  }

  /**
   * Resalta en tiempo real los elementos SVG de la nota que suena y realiza scroll suave a la línea activa.
   * @param {object|null} noteEvent Evento de nota emitido por AudioSynthService.
   */
  _highlightActiveNote(noteEvent) {
    for (const node of this._highlightedSvgNodes) {
      node.classList?.remove('acordate-note-active');
    }
    this._highlightedSvgNodes = [];

    if (!noteEvent || !Array.isArray(noteEvent.svgElements) || noteEvent.svgElements.length === 0) {
      return;
    }

    for (const node of noteEvent.svgElements) {
      if (node && node.classList) {
        node.classList.add('acordate-note-active');
        this._highlightedSvgNodes.push(node);
      }
    }

    const anchor = noteEvent.svgElements[0];
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      anchor.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: reduced ? 'auto' : 'smooth'
      });
    }
  }

  /**
   * Resalta el compás activo dentro de la grilla de Cifrado cuando está visible.
   * @param {number} measureIndex Número de compás (1-based).
   */
  _highlightActiveChartBar(measureIndex) {
    if (!this._chartEl || this._vm.viewMode.value !== 'cifrado') return;
    const cells = this._chartEl.querySelectorAll('.chord-bar-cell');
    cells.forEach((cell) => {
      const isMatch = Number(cell.dataset.measure) === measureIndex;
      cell.classList.toggle('chord-bar-cell--active', isMatch);
      if (isMatch) {
        cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
}
