import {
  CATEGORY_LABELS,
  INSTRUMENT_LABELS,
  NOTATION_VIEW_LABELS,
  PRACTICE_TYPE_LABELS,
  RIGHTS_LABELS,
  STYLE_LABELS,
  SYNTH_INSTRUMENT_LABELS,
  formatChordSymbol,
  formatKeyName
} from '../core/i18n.js';
import { COMPING_PATTERNS } from '../models/ProgressionStep.js';
import {
  VOICING_INSTRUMENT_OPTIONS,
  getTuningForVoicingInstrument,
  normalizeVoicingInstrument
} from '../services/FingeringDesignService.js';
import {
  createBassFretboardMapElement,
  createChordColorLegendElement,
  createChordDiagramElement,
  createChordSymbolElement
} from './ChordDiagramView.js';
import { openNotationGuideModal } from './NotationGuideModal.js';
import { createPianoChordElement } from './PianoKeyboardView.js';
import { createSliderGroup, createSwitchRow, el, icon, openModalDialog, openSheetModal } from './uiHelpers.js';

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
    /** Clave vertical del último sistema/fila encuadrado para evitar re-disparar scroll en cada nota. */
    this._lastScrolledSystemKey = null;
    /** Último compás encuadrado durante la reproducción para evitar layout reflows nota por nota. */
    this._lastScrolledMeasure = 0;
    /** Referencia cacheada a la barra superior para cálculos de encuadre sin consultas DOM repetidas. */
    this._cachedTopBarEl = null;
    /** Referencia al sheet modal abierto (si existe). */
    this._activeSheet = null;
    /** Estado del panel rápido de capas de anotaciones (plegado por defecto para despejar la partitura). */
    this._annotationsOpen = false;

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
    if (this._dockResizeObserver) {
      this._dockResizeObserver.disconnect();
      this._dockResizeObserver = null;
    }
    document.documentElement.style.removeProperty('--transport-dock-height');
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._highlightedSvgNodes = [];
    this._container = null;
  }

  /**
   * Abre el diálogo de detalles completos de la práctica actual (invocable desde la Top App Bar).
   */
  openCurrentDetails() {
    const pr = this._vm.practice.value;
    if (!pr) return;
    this._openPracticeDetailsModal(pr, this._appVm.settings.value.chordNotation);
  }

  /**
   * Construye el esqueleto despejado del Modo Atril:
   * - En escritorio amplio (>=1120px): partitura grande a la izquierda + Guía y Siguiente práctica en sidebar derecha.
   * - Sin encabezados ni menús ⋮ duplicados (el título y menú viven en la Top App Bar).
   * - Barra compacta de capas de anotación (Mano izq., Mano der., Acordes, Análisis) + acceso directo a la Guía de referencias.
   */
  _buildSkeleton() {
    this._container.innerHTML = '';

    this._metaStrip = el('div', { className: 'meta-strip', 'aria-label': 'Datos de la práctica' });
    this._viewBar = el('div', { className: 'player-view-bar' });
    this._annotationsBar = el('div', { className: 'annotations-bar', 'aria-label': 'Capas de referencias en partitura' });
    this._countInEl = el('div', { className: 'count-in-overlay', style: 'display:none', 'aria-live': 'assertive' });
    this._scoreEl = el('div', { className: 'score-surface', 'aria-label': 'Partitura en pentagrama' });
    this._harmonyEl = el('div', { className: 'score-surface', style: 'display:none', 'aria-label': 'Diagramas de acordes de la progresión' });
    this._chartEl = el('div', { className: 'score-surface', style: 'display:none', 'aria-label': 'Grilla de cifrado de acordes' });
    this._guideHost = el('aside', { className: 'player-guide-host atril-workspace__side', 'aria-label': 'Guía de estudio y objetivos' });
    this._transportDock = el('div', { className: 'transport-dock', role: 'region', 'aria-label': 'Controles de reproducción' });

    const scoreWrap = el('div', { className: 'score-wrap' }, [
      this._countInEl,
      this._scoreEl,
      this._harmonyEl,
      this._chartEl
    ]);

    const mainCol = el('div', { className: 'atril-workspace__main' }, [
      this._metaStrip,
      this._viewBar,
      this._annotationsBar,
      scoreWrap
    ]);

    this._workspaceEl = el('div', { className: 'atril-workspace' }, [
      mainCol,
      this._guideHost
    ]);

    const layout = el('div', { className: 'player-layout' }, [
      this._workspaceEl,
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

      // Mide en vivo la altura real de la barra de transporte fija para no tapar la Guía de estudio
      this._dockResizeObserver = new ResizeObserver(() => this._syncDockClearance());
      this._dockResizeObserver.observe(this._transportDock);
    }

    this._buildTransportDock();
    this._syncDockClearance();
  }

  /**
   * Actualiza la variable CSS --transport-dock-height según la altura real de la barra inferior
   * para asegurar que la Guía de estudio y la partitura nunca queden cubiertas en móvil.
   */
  _syncDockClearance() {
    if (!this._transportDock) return;
    const rect = this._transportDock.getBoundingClientRect();
    const h = Math.ceil(rect.height || this._transportDock.offsetHeight || 0);
    if (h > 40) {
      document.documentElement.style.setProperty('--transport-dock-height', `${h}px`);
    }
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
        this._lastScrolledSystemKey = null;
        this._renderHeaderAndGuide();
        this._syncTransportDom();
      }),
      this._vm.renderableAbc.subscribe(() => this._renderNotationSurface()),
      this._vm.viewMode.subscribe(() => {
        this._renderViewBar();
        this._renderAnnotationsBar();
        this._renderNotationSurface();
      }),
      this._vm.showLeftHand.subscribe(() => this._renderAnnotationsBar()),
      this._vm.showRightHand.subscribe(() => this._renderAnnotationsBar()),
      this._vm.showChordsOnScore.subscribe(() => this._renderAnnotationsBar()),
      this._vm.showOtherAnnotations.subscribe(() => this._renderAnnotationsBar()),
      this._vm.showBassFunctions.subscribe(() => this._renderAnnotationsBar()),
      this._vm.zoom.subscribe(() => this._renderNotationSurface()),
      this._vm.transposedKey.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.isPlaying.subscribe(() => this._syncTransportDom()),
      this._vm.isPaused.subscribe(() => this._syncTransportDom()),
      this._vm.bpm.subscribe(() => this._syncTransportDom()),
      this._vm.loopEnabled.subscribe(() => this._syncTransportDom()),
      this._vm.metronomeEnabled.subscribe(() => this._syncTransportDom()),
      this._vm.countInStatus.subscribe((st) => this._renderCountIn(st)),
      this._vm.activeNoteEvents.subscribe((events) => this._highlightActiveNotes(events)),
      this._vm.activeMeasure.subscribe((m) => this._highlightActiveChartBar(m)),
      this._vm.activeChordStepIndex.subscribe((idx) => this._highlightActiveHarmonyStep(idx)),
      this._vm.harmonySteps.subscribe(() => this._renderNotationSurface()),
      this._vm.voicingInstrument.subscribe(() => this._renderNotationSurface()),
      this._vm.fingeringDesignId.subscribe(() => this._renderNotationSurface()),
      this._vm.compingPattern.subscribe(() => {
        this._renderViewBar();
        this._renderNotationSurface();
      }),
      this._vm.chordsEnabled.subscribe(() => this._renderNotationSurface()),
      this._vm.bassEnabled.subscribe(() => this._renderNotationSurface()),
      this._vm.voiceMode.subscribe(() => this._renderViewBar()),
      this._vm.hasMultipleVoices.subscribe(() => this._renderViewBar()),
      this._vm.showHarmonicAnalysis.subscribe(() => {
        this._renderViewBar();
        this._renderAnnotationsBar();
      }),
      this._vm.generatedWalkingAbc.subscribe(() => this._renderNotationSurface()),
      this._vm.practiceStats.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.sessionRepetitions.subscribe(() => this._renderHeaderAndGuide()),
      this._vm.isAtrilFullscreen.subscribe((full) => {
        this._metaStrip.style.display = full ? 'none' : 'flex';
        this._guideHost.style.display = full ? 'none' : '';
        this._workspaceEl?.classList.toggle('atril-workspace--full', Boolean(full));
        this._renderViewBar();
        this._renderAnnotationsBar();
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
   * Renderiza la franja sobria de metadatos (máx. 4–5 píldoras de alto valor),
   * la barra de capas de anotación y la Guía de estudio + Siguiente práctica.
   */
  _renderHeaderAndGuide() {
    const pr = this._vm.practice.value;
    if (!pr || !this._metaStrip) return;

    const notation = this._appVm.settings.value.chordNotation;
    const prog = this._appVm.progress.value;
    const stats = this._vm.practiceStats.value;
    const keyLabel = formatKeyName(this._vm.transposedKey.value, notation);
    const semi = this._vm.transposeSemitones.value;

    this._metaStrip.innerHTML = '';
    const parts = [
      `Nivel ${pr.level}`,
      CATEGORY_LABELS[pr.category] || pr.category,
      `${keyLabel}${semi ? ` (${semi > 0 ? '+' : ''}${semi})` : ''} · ${pr.timeSignature}`,
      pr.form || null,
      stats?.bestBpm > 0 ? `Mejor ${stats.bestBpm}/${pr.tempo.target} BPM` : `Obj. ${pr.tempo.target} BPM`,
      this._vm.sessionRepetitions.value > 0
        ? `${this._vm.sessionRepetitions.value} vuelta${this._vm.sessionRepetitions.value === 1 ? '' : 's'}`
        : null
    ].filter(Boolean);

    parts.forEach((text, i) => {
      if (i > 0) this._metaStrip.appendChild(el('span', { className: 'meta-strip__dot', 'aria-hidden': 'true' }, ['·']));
      this._metaStrip.appendChild(el('span', { className: i === 0 ? 'meta-strip__lead' : 'meta-strip__item' }, [text]));
    });

    this._renderViewBar();
    this._renderAnnotationsBar();

    // Guía de estudio y objetivos: abierta por defecto en escritorio amplio (sidebar) y plegable en móvil
    const existingDetails = this._guideHost.querySelector('details');
    const isWideDesktop = typeof window !== 'undefined' && window.innerWidth >= 1120;
    const wasOpen = existingDetails ? existingDetails.open : isWideDesktop;
    const checkedCount = pr.goals.filter((_, idx) => prog.isGoalChecked(pr.id, idx)).length;

    const focusNodes = pr.focus
      ? Object.entries(pr.focus).map(([instKey, text]) =>
          el('div', { className: 'm3-body-md' }, [
            el('strong', {}, [`Foco ${INSTRUMENT_LABELS[instKey] || instKey}: `]),
            text
          ])
        )
      : [];

    const details = el('details', { className: 'm3-collapsible', open: wasOpen }, [
      el('summary', {}, [
        el('span', {}, [`Guía de estudio (${checkedCount}/${pr.goals.length})`]),
        icon('chevronDown', 20)
      ]),
      el('div', { className: 'm3-collapsible__content' }, [
        ...focusNodes,
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
        pr.sourceRef
          ? el('div', { className: 'm3-body-md', style: 'font-size:0.8rem' }, [
              el('strong', {}, ['Fuente: ']),
              pr.sourceRef
            ])
          : null,
        el('div', { className: 'm3-body-md' }, [
          `Inicio sugerido ${pr.tempo.start} BPM · Objetivo ${pr.tempo.target} BPM`
        ])
      ])
    ]);

    details.addEventListener('toggle', () => {
      if (details.open && !isWideDesktop) {
        this._syncDockClearance();
        requestAnimationFrame(() => {
          details.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
      }
    });

    // Tarjeta de continuidad: "Siguiente práctica" para encadenar el estudio sin volver al listado
    const nextPr = this._vm.getNextPracticeInContext();
    const nextCard = nextPr
      ? el('div', { className: 'm3-card next-practice-card' }, [
          el('span', { className: 'm3-label' }, ['SIGUIENTE PRÁCTICA']),
          el('strong', { className: 'm3-title-md' }, [nextPr.title]),
          el('span', { className: 'm3-body-md' }, [`Nivel ${nextPr.level} · ${formatKeyName(nextPr.key, notation)} · Obj. ${nextPr.tempo.target} BPM`]),
          el(
            'button',
            {
              type: 'button',
              className: 'm3-btn m3-btn--compact m3-btn--tonal',
              ripple: true,
              onClick: () => this._vm.openNextPractice()
            },
            ['Continuar con esta', icon('arrowRight', 16)]
          )
        ])
      : null;

    this._guideHost.innerHTML = '';
    this._guideHost.appendChild(details);
    if (nextCard) this._guideHost.appendChild(nextCard);
  }

  /**
   * Renderiza el cajón compacto de capas de anotación sobre la partitura cuando el usuario toca "Referencias".
   */
  _renderAnnotationsBar() {
    if (!this._annotationsBar) return;
    const pr = this._vm.practice.value;
    const mode = this._vm.viewMode.value;
    const isStaffVisible = Boolean(pr && pr.type !== 'harmony' && mode !== 'cifrado' && mode !== 'diagramas');

    if (!isStaffVisible || !this._annotationsOpen) {
      this._annotationsBar.style.display = 'none';
      this._annotationsBar.innerHTML = '';
      return;
    }

    this._annotationsBar.style.display = 'flex';
    this._annotationsBar.innerHTML = '';

    const isChordsDisabledByMode = mode === 'pentagrama';
    const isPiano = pr.instruments.includes('piano') && (pr.instruments.length === 1 || pr.instruments[0] === 'piano');
    const isBass = !isPiano && pr.instruments.includes('bajo');

    const chips = [
      {
        label: 'Mano izq.',
        title: isPiano
          ? 'Digitación 1–5 de mano izquierda (pentagrama inferior / clave de fa)'
          : 'Dedos 0–4, cuerdas (①–⑥) y posiciones romanas (I–XII)',
        active: this._vm.showLeftHand.value,
        onClick: () => { this._vm.toggleLeftHand(); this._renderViewBar(); }
      },
      {
        label: 'Mano der.',
        title: isPiano
          ? 'Digitación 1–5 de mano derecha (pentagrama superior / clave de sol)'
          : 'Dedos de pulsación (p, i, m, a) y rasgueos (↓ ↑)',
        active: this._vm.showRightHand.value,
        onClick: () => { this._vm.toggleRightHand(); this._renderViewBar(); }
      },
      {
        label: 'Acordes',
        title: isChordsDisabledByMode ? 'Cambiá a Mixto para mostrar acordes sobre el pentagrama' : 'Cifrado de acordes sobre la partitura',
        active: !isChordsDisabledByMode && this._vm.showChordsOnScore.value,
        onClick: () => {
          if (isChordsDisabledByMode) {
            this._vm.setViewMode('mixto');
            this._vm.showChordsOnScore.set(true);
          } else {
            this._vm.toggleChordsOnScore();
          }
          this._renderViewBar();
        }
      },
      {
        label: isBass ? 'Funciones' : 'Análisis',
        title: isBass ? 'Funciones armónicas de bajo (R, 3, 5, 7, Crom) y marcas de texto' : 'Grados romanos y anotaciones de análisis',
        active: this._vm.showOtherAnnotations.value,
        onClick: () => { this._vm.toggleOtherAnnotations(); this._renderViewBar(); }
      }
    ];

    this._annotationsBar.append(
      ...chips.map((c) =>
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip m3-chip--compact',
            ripple: true,
            title: c.title,
            'aria-pressed': String(Boolean(c.active)),
            onClick: c.onClick
          },
          [c.label]
        )
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'm3-btn m3-btn--compact m3-btn--text annotations-bar__guide',
          ripple: true,
          title: 'Explicación de dedos, cuerdas, trastes y símbolos',
          onClick: () => openNotationGuideModal()
        },
        [icon('help', 15), 'Guía']
      )
    );
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

    // Modo voces para piezas polifónicas (en piano: Ambas / Mano der. / Mano izq.; en guitarra: Ambas / Melodía / Bajo)
    const isPianoPiece = Boolean(pr?.instruments?.includes('piano') && (pr.instruments.length === 1 || pr.instruments[0] === 'piano'));
    const voiceControl = this._vm.hasMultipleVoices.value
      ? el(
          'div',
          { className: 'm3-segmented player-voice-seg', role: 'group', 'aria-label': isPianoPiece ? 'Selección de manos' : 'Modo de voces' },
          (isPianoPiece
            ? [
                { id: 'both', label: 'Ambas' },
                { id: 'v1', label: 'Mano der.' },
                { id: 'v2', label: 'Mano izq.' }
              ]
            : [
                { id: 'both', label: 'Ambas' },
                { id: 'v1', label: 'Melodía' },
                { id: 'v2', label: 'Bajo' }
              ]
          ).map((v) =>
            el(
              'button',
              {
                type: 'button',
                className: 'm3-segmented__btn',
                ripple: true,
                'aria-pressed': String(this._vm.voiceMode.value === v.id),
                onClick: () => this._vm.setVoiceMode(v.id)
              },
              [v.label]
            )
          )
        )
      : null;

    // Capa opcional de análisis armónico (grados romanos / cadencias para guitarra clásica)
    const harmonicLayerBtn = pr?.harmonicAnalysis?.length > 0
      ? el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(this._vm.showHarmonicAnalysis.value),
            title: 'Mostrar u ocultar análisis armónico (grados y cadencias)',
            onClick: () => this._vm.showHarmonicAnalysis.set(!this._vm.showHarmonicAnalysis.value)
          },
          ['Grados']
        )
      : null;

    const isStaffVisible = Boolean(pr && !isHarmony && mode !== 'cifrado' && mode !== 'diagramas');
    const activeLayersCount =
      (this._vm.showLeftHand.value ? 1 : 0) +
      (this._vm.showRightHand.value ? 1 : 0) +
      (mode !== 'pentagrama' && this._vm.showChordsOnScore.value ? 1 : 0) +
      (this._vm.showOtherAnnotations.value ? 1 : 0);

    const layersToggleBtn = isStaffVisible
      ? el(
          'button',
          {
            type: 'button',
            className: 'm3-chip m3-chip--compact',
            ripple: true,
            'aria-pressed': String(this._annotationsOpen),
            'aria-expanded': String(this._annotationsOpen),
            title: 'Activar o desactivar mano izquierda, mano derecha, acordes y análisis',
            onClick: () => {
              this._annotationsOpen = !this._annotationsOpen;
              this._renderViewBar();
              this._renderAnnotationsBar();
            }
          },
          [icon('layers', 15), `Capas (${activeLayersCount})`]
        )
      : null;

    const quickRight = el('div', { className: 'stepper-inline' }, [
      layersToggleBtn,
      harmonicLayerBtn,
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
    if (voiceControl) this._viewBar.appendChild(voiceControl);
    if (compingSelect) this._viewBar.appendChild(compingSelect);
    this._viewBar.classList.toggle('player-view-bar--has-extra', Boolean(voiceControl || compingSelect));
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
      const isPiano = pr.instruments.includes('piano') && (pr.instruments.length === 1 || pr.instruments[0] === 'piano');
      const { visualObj } = this._abc.renderScore(this._scoreEl, this._vm.renderableAbc.value, {
        width,
        zoom: this._vm.zoom.value,
        isPiano
      });
      const timeline = this._abc.extractTimeline(visualObj, this._vm.transposedAbc.value, {
        instrument: isPiano ? 'piano' : (pr.instruments[0] || 'guitarra'),
        isBass: !isPiano && pr.instruments.includes('bajo'),
        isPiano,
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
   * Renderiza la tira de diagramas de acordes (horizontal en móvil, grilla completa en escritorio),
   * el patrón visual de ritmo (flechas ↓↑ / p-i-m-a), los controles de play-along por instrumento,
   * los marcadores de sección (A, B, C) y el generador de walking bass para bajo.
   */
  _renderHarmonyDiagrams() {
    const pr = this._vm.practice.value;
    const plan = this._vm.fingeringDesignPlan.value;
    const steps = this._vm.harmonySteps.value;
    const notation = this._appVm.settings.value.chordNotation;
    const vInst = normalizeVoicingInstrument(this._vm.voicingInstrument.value);
    const isPiano = vInst === 'piano';
    const tuning = isPiano ? null : (plan?.tuning || getTuningForVoicingInstrument(vInst));
    const isBass = !isPiano && tuning.instrument === 'bass';
    const supportsBass = (!isPiano && pr?.instruments?.includes('bajo')) || isBass;
    const activeIdx = this._vm.activeChordStepIndex.value;
    const compingSpec = COMPING_PATTERNS[this._vm.compingPattern.value] || COMPING_PATTERNS['negras-abajo'];
    const sections = this._vm.getFormSections();
    const criteria = this._vm.getAvailableFingeringCriteria();

    this._harmonyEl.innerHTML = '';
    if (steps.length === 0) {
      this._harmonyEl.appendChild(el('p', { className: 'm3-body-md' }, ['Esta práctica no tiene pasos de progresión armónica.']));
      return;
    }

    // 1) Barra visible del patrón de ritmo (flechas ↓↑ / p-i-m-a) + Play-along + Secciones
    const rhythmBar = el('div', { className: 'comping-banner' }, [
      el('div', { className: 'comping-banner__info' }, [
        el('span', { className: 'm3-label' }, [`Patrón: ${compingSpec.label}`]),
        el('strong', { className: 'comping-banner__arrows', 'aria-label': `Patrón rítmico ${compingSpec.patternDisplay}` }, [
          compingSpec.patternDisplay
        ])
      ]),
      el('div', { className: 'm3-chip-row' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(this._vm.chordsEnabled.value),
            title: 'Activar o silenciar los acordes de acompañamiento (útil para guitarristas en play-along)',
            onClick: () => this._vm.setChordsEnabled(!this._vm.chordsEnabled.value)
          },
          [this._vm.chordsEnabled.value ? 'Acordes: ON' : 'Acordes: silenciados']
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'm3-chip',
            ripple: true,
            'aria-pressed': String(this._vm.bassEnabled.value),
            title: 'Activar o silenciar la pista de bajo (útil para bajistas en play-along)',
            onClick: () => this._vm.setBassEnabled(!this._vm.bassEnabled.value)
          },
          [this._vm.bassEnabled.value ? 'Bajo base: ON' : 'Bajo base: silenciado']
        ),
        ...sections.map((sec) =>
          el(
            'button',
            {
              type: 'button',
              className: 'm3-chip',
              ripple: true,
              'aria-pressed': String(this._vm.loopEnabled.value && this._vm.loopStartMeasure.value === sec.startMeasure && this._vm.loopEndMeasure.value === sec.endMeasure),
              title: `Repetir en bucle la sección ${sec.label} (compases ${sec.startMeasure}–${sec.endMeasure})`,
              onClick: () => this._vm.loopSection(sec)
            },
            [`Sección ${sec.label}`]
          )
        ),
        supportsBass
          ? el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--compact m3-btn--tonal',
                ripple: true,
                onClick: () => this._vm.generateWalkingForCurrent()
              },
              [icon('wand', 15), 'Generar walking bass']
            )
          : null
      ])
    ]);
    this._harmonyEl.appendChild(rhythmBar);

    // 1b) Selector de instrumento de digitación + Diseño de digitación por criterios musicales
    const criterionSelect = el(
      'select',
      {
        className: 'm3-field__select fingering-design-select',
        'aria-label': 'Criterio de diseño de digitación',
        title: 'Elegí el criterio musical y técnico para digitar esta progresión',
        onChange: (e) => this._vm.setFingeringDesign(e.target.value)
      },
      criteria.map((c) => el('option', { value: c.id }, [c.label]))
    );
    criterionSelect.value = this._vm.fingeringDesignId.value;

    const activeInstLabel = VOICING_INSTRUMENT_OPTIONS.find((o) => o.id === vInst)?.label || 'Guitarra';
    const activeCriterionLabel = plan?.criterion?.label || 'Estándar';

    const designBar = el('details', { className: 'm3-collapsible m3-collapsible--subtle fingering-design-collapsible' }, [
      el('summary', {}, [
        el('span', { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap' }, [
          el('strong', {}, [`Digitación: ${activeInstLabel}`]),
          el('span', { className: 'm3-badge m3-badge--primary' }, [activeCriterionLabel]),
          plan ? el('span', { className: 'm3-body-md' }, [plan.metrics.summaryLabel]) : null
        ]),
        icon('chevronDown', 18)
      ]),
      el('div', { className: 'm3-collapsible__content fingering-design-bar' }, [
        el('div', { className: 'fingering-design-bar__row' }, [
          el('div', { className: 'm3-chip-row', role: 'group', 'aria-label': 'Instrumento para digitación de acordes' }, [
            el('span', { className: 'm3-label', style: 'align-self:center' }, ['Instrumento:']),
            ...VOICING_INSTRUMENT_OPTIONS.map((opt) =>
              el(
                'button',
                {
                  type: 'button',
                  className: 'm3-chip m3-chip--compact',
                  ripple: true,
                  'aria-pressed': String(vInst === opt.id),
                  title: `Ver y diseñar digitaciones de acordes para ${opt.label}`,
                  onClick: () => this._vm.setVoicingInstrument(opt.id)
                },
                [opt.label]
              )
            )
          ]),
          el('div', { className: 'fingering-design-bar__controls' }, [
            criterionSelect,
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--compact m3-btn--tonal',
                ripple: true,
                title: 'Comparar varios criterios musicales de digitación sobre este mismo tema',
                onClick: () => this._openCompareDesignsModal()
              },
              ['Comparar']
            ),
            el(
              'button',
              {
                type: 'button',
                className: 'm3-btn m3-btn--compact m3-btn--outlined',
                ripple: true,
                title: 'Guardar esta digitación personalizada como práctica propia',
                onClick: () => this._vm.saveFingeringDesignAsPractice()
              },
              ['Guardar diseño']
            )
          ])
        ]),
        plan
          ? el('div', { className: 'fingering-design-bar__meta' }, [
              el('span', { className: 'm3-body-md' }, [
                `${plan.criterion.description} ${plan.criterion.pedagogicalTip || ''}`.trim()
              ])
            ])
          : null,
        createChordColorLegendElement()
      ])
    ]);
    this._harmonyEl.appendChild(designBar);

    // 2) Si el bajista generó un walking bass sugerido sobre esta progresión, mostrar pentagrama + botón guardar
    if (this._vm.generatedWalkingAbc.value) {
      const walkScore = el('div', { className: 'score-surface', style: 'margin:10px 0' });
      const walkBox = el('div', { className: 'm3-card', style: 'margin:10px 0; display:flex; flex-direction:column; gap:8px' }, [
        el('div', { className: 'player-toolbar' }, [
          el('strong', {}, ['Walking bass sugerido (notas del acorde y guías 3.ª / 7.ª)']),
          el('div', { className: 'm3-chip-row' }, [
            el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--filled', ripple: true, onClick: () => this._vm.saveGeneratedWalkingAsPractice() }, ['Guardar y editar walking']),
            el('button', { type: 'button', className: 'm3-btn m3-btn--compact m3-btn--text', onClick: () => this._vm.generatedWalkingAbc.set('') }, ['Ocultar'])
          ])
        ]),
        walkScore
      ]);
      this._harmonyEl.appendChild(walkBox);
      setTimeout(() => {
        const prepared = this._abc.prepareAbcForRender(this._vm.generatedWalkingAbc.value, {
          viewMode: 'mixto',
          chordNotation: notation,
          showBassFunctions: true,
          isBass: true,
          stripTitle: true
        });
        this._abc.renderScore(walkScore, prepared, { width: walkScore.clientWidth || 520, zoom: 0.95 });
      }, 0);
    }

    // 3) Cuando se eligió Bajo (4c o 5c), muestra además el mapa del diapasón para el acorde activo
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

    // 4) Tira de diagramas (scroll horizontal en móvil; grilla completa en escritorio)
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
              el('div', { style: 'display:flex; align-items:center; gap:4px' }, [
                step.section ? el('span', { className: 'm3-badge m3-badge--primary', style: 'padding:1px 6px' }, [step.section]) : null,
                el('strong', {}, [createChordSymbolElement(step.chord, notation)])
              ]),
              el('span', { className: 'm3-label' }, [`${step.bars} c.`])
            ]),
            step.voicing
              ? (step.voicing.isPianoVoicing || isPiano
                  ? createPianoChordElement(step.voicing, {
                      notation,
                      size: 'sm',
                      labelMode: this._vm.showFingerings.value ? 'fingers' : 'functions',
                      onPlay: () => this._vm.playStepVoicing(step)
                    })
                  : createChordDiagramElement(step.voicing, {
                      tuning,
                      notation,
                      size: 'sm',
                      showTitle: false,
                      labelMode: this._vm.showFingerings.value ? 'fingers' : 'functions',
                      onPlay: () => this._vm.playStepVoicing(step)
                    }))
              : el('button', {
                  type: 'button',
                  className: 'm3-btn m3-btn--compact m3-btn--tonal',
                  onClick: () => this._vm.playStepVoicing(step)
                }, [createChordSymbolElement(step.chord, notation)]),
            step.rationale
              ? el('span', { className: 'm3-label harmony-step-card__rationale', title: step.rationale }, [step.rationale])
              : null,
            step.candidates && step.candidates.length > 1
              ? el(
                  'button',
                  {
                    type: 'button',
                    className: 'm3-btn m3-btn--compact m3-btn--text',
                    style: 'width:100%; min-height:32px; padding:2px 6px; font-size:0.76rem',
                    title: `Elegir otra digitación para ${formatChordSymbol(step.chord, notation)}`,
                    onClick: () => this._openStepVoicingPickerModal(idx, step, tuning, notation)
                  },
                  [step.isManualOverride ? 'Forma manual · cambiar' : `Cambiar forma (${step.candidates.length})`]
                )
              : null
          ]
        )
      )
    );

    this._harmonyEl.appendChild(strip);
  }

  /**
   * Abre un modal comparativo con todos los diseños de digitación propuestos por el especialista
   * en teoría y técnica para la progresión actual y el instrumento elegido.
   */
  _openCompareDesignsModal() {
    const plans = this._vm.compareFingeringDesigns();
    if (!plans.length) return;
    const notation = this._appVm.settings.value.chordNotation;
    const activeId = this._vm.fingeringDesignId.value;
    const instLabel =
      VOICING_INSTRUMENT_OPTIONS.find((o) => o.id === normalizeVoicingInstrument(this._vm.voicingInstrument.value))?.label ||
      'Guitarra';

    let closeFn = null;
    const cards = plans.map((plan) => {
      const isActive = plan.criterion.id === activeId;
      const previewChips = plan.steps.slice(0, 6).map((st) =>
        el('span', { className: 'm3-badge' }, [
          `${formatChordSymbol(st.chord, notation)} · ${st.voicing ? st.voicing.getPositionLabel() : '—'}`
        ])
      );
      return el('div', { className: `m3-card ${isActive ? 'm3-card--elevated' : ''}`, style: 'display:flex; flex-direction:column; gap:8px' }, [
        el('div', { className: 'player-toolbar' }, [
          el('strong', {}, [plan.criterion.label]),
          el('span', { className: `m3-badge ${isActive ? 'm3-badge--success' : 'm3-badge--primary'}` }, [
            isActive ? 'Activo' : plan.metrics.summaryLabel
          ])
        ]),
        el('p', { className: 'm3-body-md' }, [plan.criterion.description]),
        el('p', { className: 'm3-label' }, [
          `Traste medio: ${plan.metrics.averageFret || 1} · Salto máx.: ${Math.round(plan.metrics.maxShiftFrets)} trastes · Enlace prom.: ${plan.metrics.avgVoiceLeadingSemitones} st · Notas comunes: ${plan.metrics.commonTonesTotal}`
        ]),
        el('div', { className: 'm3-chip-row' }, previewChips),
        el('div', { className: 'm3-chip-row', style: 'justify-content:flex-end' }, [
          el(
            'button',
            {
              type: 'button',
              className: `m3-btn m3-btn--compact ${isActive ? 'm3-btn--outlined' : 'm3-btn--filled'}`,
              ripple: true,
              onClick: () => {
                this._vm.setFingeringDesign(plan.criterion.id);
                closeFn?.();
              }
            },
            [isActive ? 'Diseño activo' : 'Aplicar este diseño']
          )
        ])
      ]);
    });

    const body = el('div', { style: 'display:flex; flex-direction:column; gap:10px; max-height:70dvh; overflow-y:auto' }, [
      el('p', { className: 'm3-body-md' }, [
        `Distintas soluciones técnicas y armónicas para digitar esta progresión en ${instLabel}. Elegí la que mejor se adapte a tu objetivo musical:`
      ]),
      ...cards
    ]);

    const dlg = openModalDialog({
      title: `Diseños de digitación — ${instLabel}`,
      body,
      actions: [{ label: 'Cerrar', variant: 'text' }]
    });
    closeFn = dlg.close;
  }

  /**
   * Abre un selector puntual para cambiar el voicing de un solo compás/paso dentro del diseño activo.
   * @param {number} stepIndex Índice del paso.
   * @param {object} step Paso enriquecido con candidatos.
   * @param {import('../models/Tuning.js').Tuning} tuning Afinación activa.
   * @param {'americano'|'latino'} notation Sistema de cifrado.
   */
  _openStepVoicingPickerModal(stepIndex, step, tuning, notation) {
    let closeFn = null;
    const grid = el(
      'div',
      { className: 'voicing-group-grid', style: 'max-height:65dvh; overflow-y:auto' },
      step.candidates.map((v) => {
        const isCurrent = step.voicing && v.id === step.voicing.id;
        const isPianoV = Boolean(v.isPianoVoicing);
        return el('div', { className: `m3-card ${isCurrent ? 'm3-card--elevated' : ''}`, style: 'display:flex; flex-direction:column; gap:6px; align-items:center' }, [
          el('span', { className: 'm3-label' }, [
            isPianoV ? v.getPositionLabel() : `${v.getPositionLabel()} · ${v.getUsedStringsLabel(tuning)}`
          ]),
          isPianoV
            ? createPianoChordElement(v, {
                notation,
                size: 'sm',
                labelMode: this._vm.showFingerings.value ? 'fingers' : 'functions',
                onPlay: () => this._vm.playStepVoicing({ ...step, voicing: v })
              })
            : createChordDiagramElement(v, {
                tuning,
                notation,
                size: 'sm',
                showTitle: false,
                labelMode: this._vm.showFingerings.value ? 'fingers' : 'functions',
                onPlay: () => this._vm.playStepVoicing({ ...step, voicing: v })
              }),
          el(
            'button',
            {
              type: 'button',
              className: `m3-btn m3-btn--compact ${isCurrent ? 'm3-btn--outlined' : 'm3-btn--filled'}`,
              ripple: true,
              onClick: () => {
                this._vm.setStepVoicingOverride(stepIndex, v);
                closeFn?.();
              }
            },
            [isCurrent ? 'Seleccionada' : 'Usar esta forma']
          )
        ]);
      })
    );

    const dlg = openModalDialog({
      title: `Elegir forma para ${formatChordSymbol(step.chord, notation)} (paso ${stepIndex + 1})`,
      body: grid,
      actions: [{ label: 'Cerrar', variant: 'text' }]
    });
    closeFn = dlg.close;
  }

  /**
   * Resalta el diagrama del acorde que suena actualmente (y anticipa visualmente el siguiente)
   * acomodando la vista horizontal o vertical para ver el acorde actual y los próximos.
   * @param {number} stepIndex Índice del paso activo (-1 si detenido).
   */
  _highlightActiveHarmonyStep(stepIndex) {
    if (!this._harmonyEl) return;
    if (stepIndex < 0) {
      this._lastScrolledSystemKey = null;
    }
    const vInst = normalizeVoicingInstrument(this._vm.voicingInstrument.value);
    if ((vInst === 'bajo' || vInst === 'bajo-5') && stepIndex >= 0) {
      // En bajo actualiza el mapa del diapasón para mostrar las notas del acorde que suena
      this._renderHarmonyDiagrams();
    }
    const strip = this._harmonyEl.querySelector('.harmony-strip');
    const cards = this._harmonyEl.querySelectorAll('.harmony-step-card');
    const total = cards.length;
    const nextIdx = stepIndex >= 0 && total > 1 ? (stepIndex + 1) % total : -1;

    cards.forEach((card) => {
      const idx = Number(card.dataset.stepIndex);
      const match = idx === stepIndex;
      card.classList.toggle('harmony-step-card--active', match);
      card.classList.toggle('harmony-step-card--next', !match && idx === nextIdx);
      if (match) {
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior = reduced ? 'auto' : 'smooth';
        // En tira horizontal (móvil), ubica el acorde actual cerca del borde izquierdo para ver los 2-3 que vienen
        if (strip && strip.scrollWidth > strip.clientWidth + 8) {
          const targetLeft = Math.max(0, card.offsetLeft - 12);
          strip.scrollTo({ left: targetLeft, behavior });
        }
        // En vertical (grilla de escritorio o móvil), deja espacio debajo para ver las filas siguientes
        this._scrollToFollowReading(card, { systemQuantizePx: 60 });
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

    // En prácticas de armonía puras agrupa los harmonySteps por compás entero real
    // (soporta 2+ acordes en un mismo compás cuando step.bars < 1 sin duplicar compases)
    if (pr?.type === 'harmony' && steps.length > 0) {
      const barsMap = new Map();
      let cursorBar = 0;
      steps.forEach((step, idx) => {
        const durBars = Math.max(0.25, Number(step.bars) || 1);
        const startBarIdx = Math.floor(cursorBar + 1e-6);
        const endBarIdx = Math.max(startBarIdx + 1, Math.ceil(cursorBar + durBars - 1e-6));
        for (let b = startBarIdx; b < endBarIdx; b++) {
          const measureNum = b + 1;
          if (!barsMap.has(measureNum)) {
            barsMap.set(measureNum, {
              measure: measureNum,
              section: b === startBarIdx ? (step.section || null) : null,
              entries: []
            });
          }
          const slot = barsMap.get(measureNum);
          if (b === startBarIdx && step.section && !slot.section) {
            slot.section = step.section;
          }
          slot.entries.push({
            chord: b === startBarIdx ? step.chord : '%',
            stepIndex: idx
          });
        }
        cursorBar += durBars;
      });

      const activeStepIdx = this._vm.activeChordStepIndex.value;
      const gridChildren = [];
      let lastSection = null;
      const orderedBars = [...barsMap.values()].sort((a, b) => a.measure - b.measure);

      for (const barObj of orderedBars) {
        if (barObj.section && barObj.section !== lastSection) {
          lastSection = barObj.section;
          gridChildren.push(
            el('div', { className: 'chord-chart-section-header', role: 'heading', 'aria-level': '3' }, [
              `Sección ${barObj.section}`
            ])
          );
        }
        const isSplit = barObj.entries.length > 1;
        const isActiveBar =
          barObj.measure === activeM || barObj.entries.some((e) => e.stepIndex === activeStepIdx);
        const chordNodes = [];
        barObj.entries.forEach((entry, eIdx) => {
          if (eIdx > 0) {
            chordNodes.push(el('span', { className: 'chord-bar-cell__sep', 'aria-hidden': 'true' }, ['|']));
          }
          chordNodes.push(
            entry.chord === '%'
              ? el('span', {}, ['%'])
              : createChordSymbolElement(entry.chord, notation)
          );
        });
        gridChildren.push(
          el(
            'div',
            {
              className: `chord-bar-cell ${isSplit ? 'chord-bar-cell--split' : ''} ${isActiveBar ? 'chord-bar-cell--active' : ''}`.trim(),
              dataset: { measure: barObj.measure }
            },
            [
              el('span', { className: 'chord-bar-cell__num' }, [String(barObj.measure)]),
              el('div', { className: 'chord-bar-cell__chords' }, chordNodes)
            ]
          )
        );
      }

      this._chartEl.appendChild(el('div', { className: 'chord-chart-grid' }, gridChildren));
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

    this._targetBtn = el(
      'button',
      {
        type: 'button',
        className: 'm3-btn m3-btn--compact m3-btn--text',
        ripple: true,
        'aria-label': 'Ir al tempo objetivo de la práctica',
        title: 'Ir al tempo objetivo',
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
      el('button', { type: 'button', className: 'm3-icon-btn', ripple: true, 'aria-label': 'Bajar 5 BPM', title: 'Bajar 5 BPM', onClick: () => this._vm.stepTempo(-5) }, ['−']),
      this._bpmReadout,
      el('button', { type: 'button', className: 'm3-icon-btn', ripple: true, 'aria-label': 'Subir 5 BPM', title: 'Subir 5 BPM', onClick: () => this._vm.stepTempo(5) }, ['+']),
      this._bpmSlider,
      this._targetBtn
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
    const targetBpm = this._vm.practice.value?.tempo?.target;
    if (this._targetBtn && targetBpm) {
      this._targetBtn.setAttribute('aria-label', `Ir al tempo objetivo (${targetBpm} BPM)`);
      this._targetBtn.setAttribute('title', `Ir al tempo objetivo (${targetBpm} BPM)`);
    }
  }

  /**
   * Muestra un diálogo con todos los detalles, derechos, forma y referencia bibliográfica de la práctica.
   * @param {import('../models/Practice.js').Practice} pr Práctica actual.
   * @param {'americano'|'latino'} notation Sistema de cifrado.
   */
  _openPracticeDetailsModal(pr, notation) {
    const prog = this._appVm.progress.value;
    const isVerified = prog.isPracticeVerified(pr);
    const content = el('div', { style: 'display:flex; flex-direction:column; gap:8px' }, [
      el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Tipo: ']), PRACTICE_TYPE_LABELS[pr.type] || pr.type]),
      el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Nivel y tonalidad: ']), `Nivel ${pr.level} · ${formatKeyName(pr.key, notation)} · ${pr.timeSignature}`]),
      pr.form ? el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Forma: ']), pr.form]) : null,
      pr.style ? el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Estilo: ']), STYLE_LABELS[pr.style] || pr.style]) : null,
      pr.rights ? el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Derechos: ']), RIGHTS_LABELS[pr.rights] || pr.rights]) : null,
      pr.isRepertoire ? el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Estado de transcripción: ']), isVerified ? 'Verificada' : 'A verificar']) : null,
      pr.sourceRef ? el('div', { className: 'm3-body-md' }, [el('strong', {}, ['Referencia: ']), pr.sourceRef]) : null,
      pr.notes ? el('p', { className: 'm3-body-md' }, [pr.notes]) : null
    ]);
    openModalDialog({
      title: pr.title,
      content,
      actions: [{ label: 'Cerrar', variant: 'tonal' }]
    });
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
        const prActive = this._vm.practice.value;
        const isPianoPractice = Boolean(prActive?.instruments?.includes('piano') && (prActive.instruments.length === 1 || prActive.instruments[0] === 'piano'));
        const chordsToggle = createSwitchRow({
          id: 'sheet-chords-toggle',
          label: isPianoPractice ? 'Acompañamiento de acordes' : 'Acompañamiento de acordes (guitarra)',
          checked: this._vm.chordsEnabled.value,
          onChange: (v) => this._vm.setChordsEnabled(v)
        });
        const bassToggle = createSwitchRow({
          id: 'sheet-bass-toggle',
          label: 'Pista de bajo (play-along)',
          checked: this._vm.bassEnabled.value,
          onChange: (v) => this._vm.setBassEnabled(v)
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
          bassToggle.row,
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
              [n === 0 ? 'Sin conteo' : `${n} ${n === 1 ? 'compás' : 'compases'}`]
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

        const syncSlider = createSliderGroup({
          id: 'sheet-av-offset-slider',
          label: 'Calibración visual vs. audio',
          min: -200,
          max: 250,
          step: 10,
          value: this._appVm.settings.value.audioVisualOffsetMs ?? 0,
          formatValue: (v) => (v === 0 ? '0 ms (Auto)' : `${v > 0 ? '+' : ''}${v} ms`),
          onInput: (v) => this._vm.setAudioVisualOffsetMs(v)
        });

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
          ]),
          el('div', {}, [
            syncSlider.wrap,
            el('div', { className: 'm3-body-sm', style: 'color:var(--md-sys-color-on-surface-variant); margin-top:4px' }, [
              'Compensación automática activa. Ajustá (+) si el brillo se adelanta con Bluetooth.'
            ])
          ])
        );
      } else {
        const pr = this._vm.practice.value;
        const isPiano = Boolean(pr?.instruments?.includes('piano') && (pr.instruments.length === 1 || pr.instruments[0] === 'piano'));
        const isBass = !isPiano && pr?.instruments?.includes('bajo');
        const lhSwitch = createSwitchRow({
          id: 'sheet-lh-toggle',
          label: 'Mano izquierda',
          description: isPiano
            ? 'Digitación 1–5 en pentagrama inferior (clave de fa)'
            : 'Dedos 0–4, cuerdas (①–⑥) y posiciones romanas (I–XII)',
          checked: this._vm.showLeftHand.value,
          onChange: () => this._vm.toggleLeftHand()
        });
        const rhSwitch = createSwitchRow({
          id: 'sheet-rh-toggle',
          label: 'Mano derecha',
          description: isPiano
            ? 'Digitación 1–5 en pentagrama superior (clave de sol)'
            : 'Dedos p, i, m, a y direcciones de rasgueo (↓ ↑)',
          checked: this._vm.showRightHand.value,
          onChange: () => this._vm.toggleRightHand()
        });
        const chordsScoreSwitch = createSwitchRow({
          id: 'sheet-chords-score-toggle',
          label: 'Acordes sobre la partitura',
          description: 'Cifrado armónico encima del pentagrama (modo Mixto)',
          checked: this._vm.showChordsOnScore.value,
          onChange: () => this._vm.toggleChordsOnScore()
        });
        const otherAnnSwitch = createSwitchRow({
          id: 'sheet-other-ann-toggle',
          label: 'Otras anotaciones y análisis',
          description: 'Grados romanos y marcas textuales de estudio',
          checked: this._vm.showOtherAnnotations.value,
          onChange: () => this._vm.toggleOtherAnnotations()
        });
        const bassFnSwitch = isBass
          ? createSwitchRow({
              id: 'sheet-bassfn-toggle',
              label: 'Funciones armónicas de bajo (R, 3, 5, 7)',
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
        const guideBtn = el(
          'button',
          {
            type: 'button',
            className: 'm3-btn m3-btn--outlined',
            ripple: true,
            onClick: () => {
              this._closeSheet();
              openNotationGuideModal();
            }
          },
          [icon('help', 18), 'Abrir guía de referencias y símbolos']
        );
        panelHost.append(
          lhSwitch.row,
          rhSwitch.row,
          chordsScoreSwitch.row,
          otherAnnSwitch.row,
          bassFnSwitch ? bassFnSwitch.row : null,
          zoomSlider.wrap,
          guideBtn
        );
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
   * Resalta simultáneamente en tiempo real los elementos SVG de todas las voces/notas
   * activas en el pulso actual y acomoda suavemente la vista para ver la línea actual y las siguientes.
   * @param {Array<object>} noteEvents Lista de eventos de nota activos en este pulso.
   */
  _highlightActiveNotes(noteEvents) {
    for (const node of this._highlightedSvgNodes) {
      node.classList?.remove('acordate-note-active');
    }
    this._highlightedSvgNodes = [];

    if (!Array.isArray(noteEvents) || noteEvents.length === 0) {
      this._lastScrolledSystemKey = null;
      this._lastScrolledMeasure = 0;
      return;
    }

    const seen = new Set();
    let anchor = null;

    for (const noteEvent of noteEvents) {
      if (!noteEvent || !Array.isArray(noteEvent.svgElements)) continue;
      for (const node of noteEvent.svgElements) {
        if (node && node.classList && !seen.has(node)) {
          seen.add(node);
          node.classList.add('acordate-note-active');
          this._highlightedSvgNodes.push(node);
          if (!anchor) anchor = node;
        }
      }
    }

    // Evita forzar layout reflow (getBoundingClientRect) en cada corchea/semicorchea:
    // solo evalúa el seguimiento vertical al cambiar de compás o al iniciar la reproducción.
    const primaryMeasure = noteEvents[0]?.measureIndex || 0;
    if (anchor && (primaryMeasure === 0 || primaryMeasure !== this._lastScrolledMeasure)) {
      this._lastScrolledMeasure = primaryMeasure;
      this._scrollToFollowReading(anchor, { systemQuantizePx: 44 });
    }
  }

  /**
   * Busca el ancestro con desplazamiento vertical activo (o null para usar window).
   * @param {Element} elNode Nodo de referencia dentro del reproductor.
   * @returns {HTMLElement|null} Contenedor scrollable vertical o null.
   */
  _findVerticalScrollContainer(elNode) {
    let cur = elNode?.parentElement || null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const style = window.getComputedStyle ? window.getComputedStyle(cur) : null;
      const oy = style ? style.overflowY : '';
      if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 12) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  /**
   * Acomoda la vista durante la reproducción ubicando la línea/compás actual en el tercio superior
   * libre (debajo de la barra superior y por encima del dock fijo de transporte), dejando ~75 %
   * del espacio visible debajo para leer con anticipación los compases que vienen.
   * Solo dispara scroll al cambiar de sistema o salir de la zona cómoda, evitando tirones.
   * @param {Element} targetEl Elemento activo (nota SVG, tarjeta de acorde o compás).
   * @param {{ force?: boolean, systemQuantizePx?: number }} [options={}] Opciones de encuadre.
   */
  _scrollToFollowReading(targetEl, { force = false, systemQuantizePx = 44 } = {}) {
    if (!targetEl || typeof targetEl.getBoundingClientRect !== 'function') return;

    const scrollParent = this._findVerticalScrollContainer(targetEl);
    if (!this._cachedTopBarEl || !this._cachedTopBarEl.isConnected) {
      this._cachedTopBarEl = document.querySelector('.m3-top-bar');
    }
    const topBar = this._cachedTopBarEl;
    const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
    const dockRect = this._transportDock ? this._transportDock.getBoundingClientRect() : null;

    const viewportTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
    const viewportBottom = scrollParent ? scrollParent.getBoundingClientRect().bottom : window.innerHeight;
    const topSafe = Math.max(viewportTop, topBarRect ? topBarRect.bottom : 0) + 16;
    const bottomSafe =
      Math.min(viewportBottom, dockRect && dockRect.top > topSafe + 120 ? dockRect.top : viewportBottom) - 20;
    const visibleHeight = Math.max(140, bottomSafe - topSafe);

    const rect = targetEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const currentScrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY;
    const absoluteTop = rect.top + currentScrollTop;
    const systemKey = Math.round(absoluteTop / systemQuantizePx);

    // Tercio superior (~22 % desde topSafe): muestra claramente lo que suena y 1-3 sistemas siguientes debajo
    const idealTop = topSafe + Math.min(54, Math.max(16, visibleHeight * 0.22));
    const comfortLowerBound = topSafe + visibleHeight * 0.48;
    const isOutOfComfortBand = rect.top < topSafe || rect.bottom > comfortLowerBound;

    if (!force && systemKey === this._lastScrolledSystemKey && !isOutOfComfortBand) {
      return;
    }
    if (!force && !isOutOfComfortBand && Math.abs(rect.top - idealTop) < 34) {
      this._lastScrolledSystemKey = systemKey;
      return;
    }

    this._lastScrolledSystemKey = systemKey;
    const deltaY = rect.top - idealTop;
    const nextScrollTop = Math.max(0, currentScrollTop + deltaY);
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduced ? 'auto' : 'smooth';

    if (scrollParent) {
      scrollParent.scrollTo({ top: nextScrollTop, behavior });
    } else if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: nextScrollTop, behavior });
    }
  }

  /**
   * Resalta el compás activo (y anticipa el siguiente) dentro de la grilla de Cifrado cuando está visible.
   * @param {number} measureIndex Número de compás (1-based).
   */
  _highlightActiveChartBar(measureIndex) {
    if (!this._chartEl || this._vm.viewMode.value !== 'cifrado') return;
    const cells = this._chartEl.querySelectorAll('.chord-bar-cell');
    cells.forEach((cell) => {
      const num = Number(cell.dataset.measure);
      const isMatch = num === measureIndex;
      cell.classList.toggle('chord-bar-cell--active', isMatch);
      cell.classList.toggle('chord-bar-cell--next', measureIndex > 0 && num === measureIndex + 1);
      if (isMatch) {
        this._scrollToFollowReading(cell, { systemQuantizePx: 54 });
      }
    });
  }
}
